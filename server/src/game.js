// Stan świata po stronie serwera.
//
// Zasada, na której stoi cała reszta: **klient nigdy nie podaje swojej pozycji**.
// Wysyła wyłącznie to, które klawisze trzyma wciśnięte, a serwer sam liczy, dokąd
// go to zaprowadziło. Dzięki temu nie da się przyspieszyć postaci ani przeniknąć
// przez ścianę, grzebiąc w kodzie klienta — najgorsze, co gracz może zrobić, to
// wcisnąć naraz cztery kierunki.
//
// Świat i kolizje pochodzą z tego samego pliku co u klienta.

import { buildWorld, SPAWN, WORLD_W, WORLD_H } from '../../client/src/world/forge.js';
import { advance, poseOf } from '../../client/src/world/movement.js';

export const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const MAX_PLAYERS = 60;

// Wejście przychodzi jako komendy z własnym czasem trwania — tylko wtedy klient
// jest w stanie odtworzyć u siebie dokładnie ten sam wynik, co serwer, i korekta
// nie objawia się szarpnięciem postaci.
const MAX_COMMAND_DT = 0.05;      // pojedyncza komenda nigdy dłuższa niż 50 ms
const MAX_QUEUED = 48;            // kolejka nie rośnie w nieskończoność
// Klient liczy krokami po 16 ms, więc na jeden tik serwera (50 ms) przypadają
// zwykle trzy komendy. Zapas jest na nadrabianie po przyciętej klatce — gdyby
// był za mały, zaległości odkładałyby się w kolejce i ruch zacinałby się mimo
// poprawnego klienta.
const MAX_PER_TICK = 20;
// Zapas czasu: gracz może zużyć najwyżej 15% więcej czasu symulacji, niż
// naprawdę minęło. To jest zabezpieczenie przed przyspieszaniem postaci przez
// wysyłanie zawyżonego `dt` — bez niego przerobiony klient chodziłby dwa razy
// szybciej, mimo że pozycję liczy serwer.
const BUDGET_RATE = 1.15;
const BUDGET_CAP = 0.35;

export class Game {
  constructor() {
    this.world = buildWorld();
    this.players = new Map();
    this.tickNumber = 0;
  }

  get full() {
    return this.players.size >= MAX_PLAYERS;
  }

  add(id, { name, variant, admin = false }) {
    const player = {
      id,
      name,
      variant,
      admin,
      // Lekkie rozrzucenie wokół punktu startowego, żeby wchodzący nie lądowali
      // dokładnie jeden w drugim.
      x: SPAWN.x + (Math.random() * 24 - 12),
      y: SPAWN.y + (Math.random() * 16 - 8),
      vx: 0,
      vy: 0,
      queue: [],
      seq: 0,          // ostatnia rozliczona komenda — wraca do gracza jako "ack"
      budget: 0,
      facing: 'down',
      moving: false,
      flip: false,
    };
    this.players.set(id, player);
    return player;
  }

  remove(id) {
    this.players.delete(id);
  }

  /**
   * Dokłada komendy wejścia do kolejki gracza. Każda to `[seq, klawisze, ms]`.
   * Wszystko jest sprawdzane co do typu i zakresu — to jedyne miejsce, w którym
   * dane z sieci wpływają na symulację.
   */
  pushCommands(id, commands) {
    const player = this.players.get(id);
    if (!player || !Array.isArray(commands)) return;

    for (const command of commands.slice(0, MAX_PER_TICK * 2)) {
      if (!Array.isArray(command) || command.length < 3) continue;
      const [seq, keys, ms] = command;
      if (!Number.isInteger(seq) || !Number.isInteger(keys) || !Number.isFinite(ms)) continue;
      if (seq <= player.seq) continue;                 // powtórka albo spóźnialska
      if (player.queue.length && seq <= player.queue[player.queue.length - 1][0]) continue;

      player.queue.push([seq, keys & 31, Math.max(0, Math.min(MAX_COMMAND_DT * 1000, ms))]);
    }

    // Gdy kolejka się przepełnia (bardzo słabe łącze), odrzucamy najstarsze —
    // lepiej zgubić ruch sprzed sekundy niż rozjechać się z graczem na zawsze.
    if (player.queue.length > MAX_QUEUED) {
      player.queue.splice(0, player.queue.length - MAX_QUEUED);
    }
  }

  /** Jeden krok symulacji — świat rusza się wyłącznie tutaj. */
  tick() {
    this.tickNumber++;
    for (const player of this.players.values()) {
      player.budget = Math.min(BUDGET_CAP, player.budget + (TICK_MS / 1000) * BUDGET_RATE);

      let handled = 0;
      while (player.queue.length && handled < MAX_PER_TICK) {
        const [seq, keys, ms] = player.queue.shift();
        let dt = Math.min(ms / 1000, MAX_COMMAND_DT);
        // Licznik diagnostyczny: ile razy limit czasu obciął ruch. Przy uczciwym
        // kliencie powinno to być zero — jeśli rośnie, to zabezpieczenie dusi
        // normalną grę i postać zwalnia bez powodu.
        if (dt > player.budget) {
          dt = player.budget;
          player.clamped = (player.clamped ?? 0) + 1;
        }
        player.budget -= dt;
        player.seq = seq;
        handled++;
        if (dt > 0) advance(this.world, player, keys, dt);
      }
      // Ile komend czeka w kolejce — jeśli stale rośnie, serwer nie nadąża.
      player.backlog = player.queue.length;

      const pose = poseOf(player, player.facing);
      player.facing = pose.facing;
      player.moving = pose.moving;
      player.flip = pose.flip;

      // Pas bezpieczeństwa: gdyby jakikolwiek błąd wypchnął gracza poza mapę,
      // wracamy go na planszę zamiast pozwolić mu odlecieć w nieskończoność.
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
        player.x = SPAWN.x;
        player.y = SPAWN.y;
        player.vx = 0;
        player.vy = 0;
      }
      player.x = Math.max(0, Math.min(WORLD_W, player.x));
      player.y = Math.max(0, Math.min(WORLD_H, player.y));
    }
  }

  /** Opis gracza dla innych — bez prędkości, bo jej nie potrzebują do rysowania. */
  describe(player) {
    return {
      id: player.id,
      n: player.name,
      v: player.variant,
      x: Math.round(player.x * 2) / 2,
      y: Math.round(player.y * 2) / 2,
      f: player.facing,
      m: player.moving ? 1 : 0,
      l: player.flip ? 1 : 0,
      // Odznaka administratora — jawna dla wszystkich, żeby nie dało się
      // podszyć pod obsługę.
      a: player.admin ? 1 : 0,
    };
  }

  snapshot() {
    const list = [];
    for (const player of this.players.values()) list.push(this.describe(player));
    return list;
  }
}
