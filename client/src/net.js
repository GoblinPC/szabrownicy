// Połączenie z serwerem gry.
//
// Trzy rzeczy dzieją się tutaj naraz:
//
// 1. **Przewidywanie.** Własna postać rusza się natychmiast po wciśnięciu klawisza,
//    bez czekania na odpowiedź serwera — inaczej przy 40 ms opóźnienia sterowanie
//    czuć jak gumę.
// 2. **Odtwarzanie po korekcie.** Serwer odsyła prawdziwą pozycję wraz z numerem
//    ostatniej rozliczonej komendy. Klient ustawia się na niej i **ponownie
//    wykonuje** wszystkie komendy, których serwer jeszcze nie widział. Wynik jest
//    identyczny co do bitu, więc korekta jest niewidoczna — pod warunkiem, że obie
//    strony liczą tym samym kodem (`world/movement.js`).
// 3. **Wygładzanie innych.** Migawki przychodzą 20 razy na sekundę, a rysujemy 60.
//    Innych graczy pokazujemy więc 100 ms w przeszłości i interpolujemy między
//    dwiema migawkami — ruch jest gładki mimo rzadkich pakietów.

import { advance, poseOf } from './world/movement.js';

const INTERP_DELAY = 100;     // ms — o tyle cofamy widok innych graczy
const SEND_HZ = 30;
const SEND_INTERVAL = 1000 / SEND_HZ;
const BUFFER_KEEP = 1000;     // ms historii pozycji trzymanej dla interpolacji

// Symulacja chodzi stałym krokiem, niezależnym od rysowania.
//
// Wcześniej jeden krok odpowiadał jednej klatce i był obcinany do 50 ms. Kiedy
// przeglądarka przytnie klatkę do 120 ms — a Chrome robi to w ramce <iframe>,
// bo strona rodzica zabiera mu czas — postać dostawała ruch za 50 ms zamiast za
// 120. Czyli szła z prędkością 0,4 zamiast 1,0, i to zmienną, bo klatki są
// nierówne. Teraz zaległy czas odrabiamy kolejnymi pełnymi krokami.
const STEP_MS = 16;
const MAX_CATCHUP_STEPS = 16;   // najwyżej ~256 ms zaległości na klatkę

// Numer wersji klienta. Leci do serwera przy wejściu i ląduje w logu, więc widać
// tam, którą wersję kodu naprawdę odpala dana przeglądarka. Bez tego nie da się
// odróżnić "poprawka nie działa" od "przeglądarka odpala stary plik z cache".
// Podnosić przy każdej zmianie w warstwie sieciowej lub w ruchu.
const CLIENT_VERSION = 3;

function makeToken() {
  const existing = localStorage.getItem('szab_token');
  if (existing && /^[a-z0-9]{8,64}$/i.test(existing)) return existing;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  localStorage.setItem('szab_token', token);
  return token;
}

export class Net {
  constructor(world) {
    this.world = world;
    this.token = makeToken();
    this.id = null;
    this.status = 'łączenie';
    this.body = null;             // przewidywana pozycja własnej postaci
    this.remotes = new Map();
    this.pending = [];            // komendy wysłane, jeszcze nie potwierdzone
    this.outbox = [];             // komendy czekające na najbliższą wysyłkę
    this.seq = 0;
    this.lastSend = 0;
    this.listeners = [];
    this.socket = null;
    this.retryIn = 500;

    // Pomiary do podglądu w HUD. `error` to odległość między tym, co klient
    // przewidział, a tym, co wyszło po zestawieniu z serwerem — przy zdrowym
    // odtwarzaniu komend powinna być bliska zeru.
    this.rtt = 0;
    this.error = 0;
    this.sentAt = new Map();
  }

  onStatus(callback) {
    this.listeners.push(callback);
  }

  setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    for (const callback of this.listeners) callback(status);
  }

  connect(spawn, variant) {
    this.body = { x: spawn.x, y: spawn.y, vx: 0, vy: 0 };
    this.variant = variant;
    this.open();
  }

  open() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${protocol}://${location.host}`);

    this.socket.addEventListener('open', () => {
      this.retryIn = 500;
      this.setStatus('łączenie');
      this.send({ t: 'join', token: this.token, variant: this.variant, ver: CLIENT_VERSION });
    });

    this.socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handle(message);
    });

    this.socket.addEventListener('close', () => {
      this.id = null;
      this.remotes.clear();
      this.setStatus('rozłączony — ponawiam');
      // Ponawianie z narastającą przerwą, żeby padnięty serwer nie dostał
      // lawiny prób połączenia od wszystkich graczy naraz.
      setTimeout(() => this.open(), this.retryIn);
      this.retryIn = Math.min(8000, this.retryIn * 2);
    });

    this.socket.addEventListener('error', () => this.socket.close());
  }

  send(message) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  handle(message) {
    switch (message.t) {
      case 'reload':
        location.reload();
        break;

      case 'welcome':
        this.id = message.id;
        this.body.x = message.you.x;
        this.body.y = message.you.y;
        this.body.vx = 0;
        this.body.vy = 0;
        this.pending.length = 0;
        for (const p of message.players) this.upsert(p);
        this.setStatus('połączony');
        break;

      case 'spawn':
        this.upsert(message.p);
        break;

      case 'bye':
        this.remotes.delete(message.id);
        break;

      case 'skin': {
        const remote = this.remotes.get(message.id);
        if (remote) remote.variant = message.v;
        break;
      }

      case 'state':
        this.reconcile(message);
        break;

      case 'kick':
        this.setStatus(`odrzucony: ${message.reason}`);
        break;
    }
  }

  upsert(p) {
    const existing = this.remotes.get(p.id);
    if (existing) {
      existing.name = p.n;
      existing.variant = p.v;
      return existing;
    }
    const remote = { id: p.id, name: p.n, variant: p.v, buffer: [] };
    this.remotes.set(p.id, remote);
    return remote;
  }

  /**
   * Ustawia własną postać na pozycji z serwera i ponownie wykonuje komendy,
   * których serwer jeszcze nie rozliczył.
   */
  reconcile(message) {
    const now = performance.now();

    const sent = this.sentAt.get(message.ack);
    if (sent !== undefined) {
      // Wygładzone, bo pojedynczy pakiet potrafi się spóźnić i liczba skakałaby.
      this.rtt = this.rtt ? this.rtt * 0.8 + (now - sent) * 0.2 : now - sent;
      for (const seq of this.sentAt.keys()) {
        if (seq <= message.ack) this.sentAt.delete(seq);
      }
    }

    const predictedX = this.body.x;
    const predictedY = this.body.y;

    this.body.x = message.you.x;
    this.body.y = message.you.y;
    this.body.vx = message.you.vx;
    this.body.vy = message.you.vy;

    while (this.pending.length && this.pending[0][0] <= message.ack) this.pending.shift();
    for (const [, keys, ms] of this.pending) {
      advance(this.world, this.body, keys, ms / 1000);
    }

    this.error = Math.hypot(this.body.x - predictedX, this.body.y - predictedY);

    for (const p of message.ps) {
      const remote = this.upsert(p);
      remote.buffer.push({ at: now, x: p.x, y: p.y, f: p.f, m: p.m, l: p.l });
      while (remote.buffer.length > 2 && now - remote.buffer[0].at > BUFFER_KEEP) {
        remote.buffer.shift();
      }
    }
  }

  /**
   * Jedna klatka sterowania: przewiduje ruch u siebie i dokłada komendę do
   * wysyłki. Zwraca pozycję do narysowania.
   */
  update(keys, deltaMs) {
    if (!this.body) return null;

    // Wszystkie czasy w tym pliku pochodzą z `performance.now()`. Zegar Phasera
    // liczy od startu gry, nie od wczytania strony — mieszanie ich sprawiało, że
    // interpolacja szukała w buforze chwili, której tam nie było, i zamiast
    // wygładzać ruch innych graczy przyklejała się do ostatniej migawki.
    const now = performance.now();

    this.accumulator = (this.accumulator ?? 0) + Math.max(0, deltaMs);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= STEP_MS;
      steps++;
      this.seq++;
      const command = [this.seq, keys, STEP_MS];
      advance(this.world, this.body, keys, STEP_MS / 1000);
      this.pending.push(command);
      this.outbox.push(command);
    }
    // Po bardzo długiej przerwie (przełączona karta) nie odrabiamy wszystkiego —
    // resztę porzucamy, bo gracz i tak tego nie widział.
    if (this.accumulator > STEP_MS * MAX_CATCHUP_STEPS) this.accumulator = 0;

    // Pakiety wychodzą 30 razy na sekundę, a nie co klatkę — mniej ruchu w sieci
    // przy identycznym odczuciu sterowania.
    if (now - this.lastSend >= SEND_INTERVAL && this.outbox.length) {
      this.lastSend = now;
      this.sentAt.set(this.outbox[this.outbox.length - 1][0], now);
      if (this.sentAt.size > 120) this.sentAt.delete(this.sentAt.keys().next().value);
      this.send({ t: 'in', c: this.outbox });
      this.outbox = [];
    }

    // Gdyby serwer zamilkł, kolejka niepotwierdzonych komend rosłaby bez końca.
    if (this.pending.length > 240) this.pending.splice(0, this.pending.length - 240);

    return this.body;
  }

  setVariant(variant) {
    this.variant = variant;
    this.send({ t: 'variant', v: variant });
  }

  /** Pozycje innych graczy w chwili "teraz minus opóźnienie interpolacji". */
  sampleRemotes() {
    const target = performance.now() - INTERP_DELAY;
    const result = [];

    for (const remote of this.remotes.values()) {
      const buffer = remote.buffer;
      if (buffer.length === 0) continue;

      let before = null;
      let after = null;
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].at <= target) { before = buffer[i]; after = buffer[i + 1] ?? null; break; }
      }

      let sample;
      if (before && after) {
        const span = after.at - before.at;
        const k = span > 0 ? (target - before.at) / span : 0;
        sample = {
          x: before.x + (after.x - before.x) * k,
          y: before.y + (after.y - before.y) * k,
          f: after.f, m: after.m, l: after.l,
        };
      } else {
        // Brak dwóch próbek — pokazujemy ostatnią znaną pozycję. Zdarza się tuż
        // po wejściu gracza i przy zgubionym pakiecie.
        sample = before ?? buffer[buffer.length - 1];
      }

      result.push({ id: remote.id, name: remote.name, variant: remote.variant, ...sample });
    }

    return result;
  }
}

export { poseOf };
