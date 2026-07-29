// Protokół i obsługa połączeń.
//
// Wszystko, co przychodzi z sieci, jest traktowane jak wrogie: sprawdzany jest
// rozmiar, typ, zakres i częstotliwość. Gracz może wpływać wyłącznie na to, które
// klawisze trzyma — reszta stanu należy do serwera.
//
// Wejście do gry to **nick i hasło**, bez maila i bez potwierdzania. Jeśli nick
// jest wolny, konto zakłada się w locie; jeśli zajęty, sprawdzamy hasło. Dzięki
// temu postać i jej stan przeżywają zamknięcie przeglądarki, a jednocześnie
// wejście to dwa pola i jedno kliknięcie.

import { Game, TICK_HZ } from './game.js';
import { Accounts } from './accounts.js';

const MAX_MESSAGE_BYTES = 1024;      // najdłuższa sensowna wiadomość to kilkadziesiąt bajtów
const MAX_MESSAGES_PER_SECOND = 90;  // wejście leci ~30 Hz, zapas na skoki
const JOIN_TIMEOUT_MS = 60_000;      // tyle czasu na wpisanie nicku i hasła
const HEARTBEAT_MS = 30_000;
const MAX_AUTH_ATTEMPTS = 8;         // na jedno połączenie

export function attachGame(sockets, dataDir, variantCount = 6) {
  const game = new Game();
  const accounts = new Accounts(dataDir);
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

  const kick = (socket, reason) => {
    send(socket, { t: 'kick', reason });
    socket.close();
  };

  /** Przeglądarka i wersja klienta — do logu, przy diagnozowaniu problemów. */
  const describeClient = (request, message) => {
    const agent = String(request.headers['user-agent'] ?? '');
    const browser = /Firefox/.test(agent) ? 'Firefox'
      : /Edg\//.test(agent) ? 'Edge'
      : /Chrome/.test(agent) ? 'Chrome'
      : /Safari/.test(agent) ? 'Safari'
      : 'inna';
    return { browser, version: Number.isInteger(message.ver) ? message.ver : 0 };
  };

  /**
   * Wejście: zaloguj albo zakładaj konto.
   *
   * Liczenie hasza `scrypt` trwa kilkadziesiąt milisekund, dlatego jest tu
   * `await`, a nie wersja synchroniczna — ta zatrzymałaby na ten czas pętlę
   * świata i wszyscy gracze by przystanęli.
   */
  async function enter(socket, session, message, request) {
    session.attempts = (session.attempts ?? 0) + 1;
    if (session.attempts > MAX_AUTH_ATTEMPTS) {
      session.joining = false;
      return kick(socket, 'za dużo prób logowania');
    }

    // Najpierw próba logowania. Jeśli konta nie ma, zakładamy je od razu — to
    // jest cała „rejestracja".
    const key = typeof message.name === 'string' ? Accounts.keyOf(message.name) : '';
    const exists = accounts.has(key);
    const result = exists
      ? await accounts.login(message.name, message.pass)
      : await accounts.register(message.name, message.pass);

    if (result.error) {
      session.joining = false;
      return send(socket, { t: 'autherr', reason: result.error });
    }

    const account = result.account;

    // Jedno konto na raz. Bez tego dwie karty tej samej osoby chodziłyby po
    // mapie jako dwie postacie z tym samym nickiem.
    for (const other of sessions.values()) {
      if (other.account && other.account === key) {
        session.joining = false;
        return send(socket, { t: 'autherr', reason: 'ktoś już gra na tym koncie' });
      }
    }

    session.account = key;
    const variant = (((account.variant ?? 0) % variantCount) + variantCount) % variantCount;

    const id = nextId++;
    const player = game.add(id, { name: account.name, variant });
    session.player = player;
    session.joining = false;
    clearTimeout(session.joinTimer);

    const { browser, version } = describeClient(request, message);
    session.version = version;
    player.version = version;

    send(socket, {
      t: 'welcome',
      id,
      hz: TICK_HZ,
      name: account.name,
      fresh: !exists,
      you: { x: player.x, y: player.y },
      players: game.snapshot(),
    });
    broadcast({ t: 'spawn', p: game.describe(player) }, socket);
    console.log(`  + ${account.name} (#${id}) — ${exists ? 'logowanie' : 'NOWE KONTO'}`
      + `, klient v${version}, ${browser} — graczy: ${game.players.size}`);
  }

  sockets.on('connection', (socket, request) => {
    const session = {
      player: null,
      account: null,
      joining: false,
      attempts: 0,
      messagesThisSecond: 0,
      windowStart: Date.now(),
      alive: true,
    };
    sessions.set(socket, session);

    session.joinTimer = setTimeout(() => {
      if (!session.player) kick(socket, 'brak logowania');
    }, JOIN_TIMEOUT_MS);

    socket.on('pong', () => { session.alive = true; });

    socket.on('message', (raw) => {
      if (raw.length > MAX_MESSAGE_BYTES) return kick(socket, 'wiadomość za duża');

      // Ogranicznik częstotliwości — chroni przed zalaniem serwera przez jednego
      // klienta, celowo albo przez błąd w pętli.
      const now = Date.now();
      if (now - session.windowStart >= 1000) {
        session.windowStart = now;
        session.messagesThisSecond = 0;
      }
      if (++session.messagesThisSecond > MAX_MESSAGES_PER_SECOND) {
        return kick(socket, 'za dużo wiadomości');
      }

      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;   // śmieci ignorujemy, nie zrywamy przez nie połączenia
      }
      if (!message || typeof message !== 'object') return;

      if (message.t === 'join') {
        if (session.player || session.joining) return;
        if (game.full) return kick(socket, 'serwer pełny');
        session.joining = true;
        // Błąd logowania wraca komunikatem, nie zerwaniem połączenia — gracz ma
        // móc poprawić hasło bez przeładowywania strony.
        enter(socket, session, message, request).catch((error) => {
          session.joining = false;
          console.error('  błąd wejścia:', error.message);
          send(socket, { t: 'autherr', reason: 'coś się posypało po naszej stronie' });
        });
        return;
      }

      if (!session.player) return;   // reszta wymaga zalogowania

      if (message.t === 'in') {
        game.pushCommands(session.player.id, message.c);
        return;
      }

      if (message.t === 'variant') {
        if (!Number.isInteger(message.v)) return;
        const variant = ((message.v % variantCount) + variantCount) % variantCount;
        session.player.variant = variant;
        accounts.setVariant(session.player.name, variant);
        broadcast({ t: 'skin', id: session.player.id, v: variant });
        return;
      }
    });

    socket.on('close', () => {
      clearTimeout(session.joinTimer);
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
  //
  // Mierzymy też rzeczywisty rytm tikania: setInterval potrafi się spóźniać,
  // a od tego zależy, ile czasu symulacji serwer przyznaje graczom.
  let lastTickAt = Date.now();
  let worstGap = 0;

  setInterval(() => {
    const gap = Date.now() - lastTickAt;
    lastTickAt = Date.now();
    if (gap > worstGap) worstGap = gap;
    game.stats = { worstGap, accounts: accounts.size };

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

  const shutdown = () => { accounts.flush(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return game;
}
