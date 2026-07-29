// Protokół i obsługa połączeń.
//
// Wszystko, co przychodzi z sieci, jest traktowane jak wrogie: sprawdzany jest
// rozmiar, typ, zakres i częstotliwość. Gracz może wpływać wyłącznie na to, które
// klawisze trzyma — reszta stanu należy do serwera.

import fs from 'node:fs';
import path from 'node:path';

import { Game, TICK_HZ } from './game.js';

const MAX_MESSAGE_BYTES = 1024;      // najdłuższa sensowna wiadomość to kilkadziesiąt bajtów
const MAX_MESSAGES_PER_SECOND = 90;  // wejście leci ~30 Hz, zapas na skoki
const JOIN_TIMEOUT_MS = 10_000;      // kto się nie przedstawi, wylatuje
const HEARTBEAT_MS = 30_000;

/** Nick: bez znaków sterujących, bez sklejania spacjami, 3–16 znaków. */
function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return name.length >= 3 ? name : null;
}

function nameFromToken(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  return `Goblin-${String(hash % 10000).padStart(4, '0')}`;
}

/** Tożsamość graczy: token z localStorage → nick i wariant postaci. */
class Roster {
  constructor(file) {
    this.file = file;
    this.entries = new Map();
    this.dirty = false;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [token, entry] of Object.entries(raw)) this.entries.set(token, entry);
      console.log(`  wczytano ${this.entries.size} zapamiętanych graczy`);
    } catch {
      // Pierwsze uruchomienie — pliku jeszcze nie ma i to jest w porządku.
    }
    // Zapis zbiorczy, żeby wejście dziesięciu graczy naraz nie zrobiło dziesięciu
    // zapisów na dysk.
    setInterval(() => this.flush(), 15_000).unref();
  }

  get(token) {
    return this.entries.get(token);
  }

  set(token, entry) {
    this.entries.set(token, entry);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.entries)));
    } catch (error) {
      console.error('  nie udało się zapisać listy graczy:', error.message);
    }
  }
}

export function attachGame(sockets, dataDir, variantCount = 6) {
  const game = new Game();
  const roster = new Roster(path.join(dataDir, 'players.json'));
  const sessions = new Map();   // socket → sesja
  let nextId = 1;

  const send = (socket, message) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(message));
  };

  const broadcast = (message, except = null) => {
    const payload = JSON.stringify(message);
    for (const [socket, session] of sessions) {
      if (socket === except || !session.player) continue;
      if (socket.readyState === 1) socket.send(payload);
    }
  };

  sockets.on('connection', (socket, request) => {
    const session = {
      player: null,
      messagesThisSecond: 0,
      windowStart: Date.now(),
      alive: true,
      address: request.socket.remoteAddress,
    };
    sessions.set(socket, session);

    const drop = (reason) => {
      send(socket, { t: 'kick', reason });
      socket.close();
    };

    const joinTimer = setTimeout(() => {
      if (!session.player) drop('brak przedstawienia się');
    }, JOIN_TIMEOUT_MS);

    socket.on('pong', () => { session.alive = true; });

    socket.on('message', (raw) => {
      if (raw.length > MAX_MESSAGE_BYTES) return drop('wiadomość za duża');

      // Ogranicznik częstotliwości — chroni przed zalaniem serwera przez jednego
      // klienta, celowo albo przez błąd w pętli.
      const now = Date.now();
      if (now - session.windowStart >= 1000) {
        session.windowStart = now;
        session.messagesThisSecond = 0;
      }
      if (++session.messagesThisSecond > MAX_MESSAGES_PER_SECOND) {
        return drop('za dużo wiadomości');
      }

      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;   // śmieci ignorujemy, nie zrywamy przez nie połączenia
      }
      if (!message || typeof message !== 'object') return;

      if (message.t === 'join') {
        if (session.player) return;                    // drugi raz się nie wchodzi
        if (game.full) return drop('serwer pełny');

        const token = typeof message.token === 'string' && /^[a-z0-9]{8,64}$/i.test(message.token)
          ? message.token
          : null;
        if (!token) return drop('zły token');

        const remembered = roster.get(token) ?? {};
        const name = cleanName(message.name) ?? remembered.name ?? nameFromToken(token);
        const variant = Number.isInteger(message.variant)
          ? ((message.variant % variantCount) + variantCount) % variantCount
          : (remembered.variant ?? 0);

        roster.set(token, { name, variant });

        const id = nextId++;
        const player = game.add(id, { name, variant });
        session.player = player;
        session.token = token;
        clearTimeout(joinTimer);

        send(socket, {
          t: 'welcome',
          id,
          hz: TICK_HZ,
          you: { x: player.x, y: player.y },
          players: game.snapshot(),
        });
        broadcast({ t: 'spawn', p: game.describe(player) }, socket);
        console.log(`  + ${name} (#${id}) — graczy: ${game.players.size}`);
        return;
      }

      if (!session.player) return;   // reszta wymaga wcześniejszego "join"

      if (message.t === 'in') {
        game.pushCommands(session.player.id, message.c);
        return;
      }

      if (message.t === 'variant') {
        if (!Number.isInteger(message.v)) return;
        const variant = ((message.v % variantCount) + variantCount) % variantCount;
        session.player.variant = variant;
        roster.set(session.token, { name: session.player.name, variant });
        broadcast({ t: 'skin', id: session.player.id, v: variant });
        return;
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      sessions.delete(socket);
      if (session.player) {
        game.remove(session.player.id);
        broadcast({ t: 'bye', id: session.player.id });
        console.log(`  - ${session.player.name} (#${session.player.id}) — graczy: ${game.players.size}`);
      }
    });

    socket.on('error', () => socket.close());
  });

  // Zrywanie martwych połączeń: przeglądarka zamknięta bez pożegnania zostawia
  // gniazdo, które wygląda na żywe. Bez tego po dobie na mapie stoi tłum duchów.
  setInterval(() => {
    for (const [socket, session] of sessions) {
      if (!session.alive) { socket.terminate(); continue; }
      session.alive = false;
      if (socket.readyState === 1) socket.ping();
    }
  }, HEARTBEAT_MS).unref();

  // Pętla świata. Migawka leci osobno do każdego gracza, bo każdy dostaje własne
  // `you` — swoją pozycję prawdziwą, po której koryguje przewidywania.
  setInterval(() => {
    game.tick();
    if (sessions.size === 0) return;

    const all = game.snapshot();
    for (const [socket, session] of sessions) {
      const me = session.player;
      if (!me || socket.readyState !== 1) continue;
      socket.send(JSON.stringify({
        t: 'state',
        ts: Date.now(),
        ack: me.seq,
        you: { x: me.x, y: me.y, vx: me.vx, vy: me.vy },
        ps: all.filter((p) => p.id !== me.id),
      }));
    }
  }, 1000 / TICK_HZ);

  process.on('SIGTERM', () => { roster.flush(); process.exit(0); });
  process.on('SIGINT', () => { roster.flush(); process.exit(0); });

  return game;
}
