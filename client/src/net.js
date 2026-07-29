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
const CLIENT_VERSION = 7;
const MAX_FRAME_MS = 250;   // dłuższa przerwa (przełączona karta) nie jest odrabiana

export class Net {
  constructor(world) {
    this.world = world;
    this.id = null;
    this.name = null;
    // Dane logowania trzymamy tylko w pamięci, żeby po zerwaniu połączenia
    // wrócić do gry bez pytania gracza o hasło drugi raz. Nigdzie ich nie
    // zapisujemy — w localStorage siedzi wyłącznie sam nick, do podpowiedzi.
    this.credentials = null;
    this.pending = null;
    this.status = 'łączenie';
    this.body = null;             // przewidywana pozycja własnej postaci
    this.remotes = new Map();
    this.unacked = [];            // komendy wysłane, jeszcze nie potwierdzone
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

    // Zliczanie czasu z trzech źródeł naraz. Jeśli "realny" i "Phaser" się
    // rozjeżdżają, to znaczy że silnik wygładza czas i postać gubi ruch.
    this.meter = {
      frames: 0, real: 0, phaser: 0, simulated: 0, since: performance.now(),
      fps: 0, realPerSec: 0, phaserPerSec: 0, simPerSec: 0, worstFrame: 0, lastWorst: 0,
    };
  }

  onStatus(callback) {
    this.listeners.push(callback);
  }

  setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    for (const callback of this.listeners) callback(status);
  }

  /**
   * Otwiera połączenie, ale **nie wchodzi do gry** — na to trzeba nicku i hasła.
   * Świat jest już widoczny, postać stoi bezwładnie, dopóki gracz się nie zaloguje.
   */
  connect(spawn, variant) {
    this.spawn = spawn;
    this.variant = variant;
    this.body = null;
    this.open();
  }

  /**
   * Próba wejścia. Zwraca `{ ok: true, name, fresh }` albo `{ ok: false, reason }`.
   * Wolny nick zakłada konto, zajęty wymaga hasła — decyduje o tym serwer.
   */
  authenticate(name, pass) {
    return new Promise((resolve) => {
      this.credentials = { name, pass };
      this.pending = resolve;
      if (this.socket?.readyState === 1) this.sendJoin();
      else this.setStatus('łączenie');   // wyślemy po otwarciu gniazda
    });
  }

  sendJoin() {
    if (!this.credentials) return;
    this.send({
      t: 'join',
      name: this.credentials.name,
      pass: this.credentials.pass,
      ver: CLIENT_VERSION,
    });
  }

  open() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${protocol}://${location.host}`);

    this.socket.addEventListener('open', () => {
      this.retryIn = 500;
      this.setStatus('łączenie');
      // Po zerwaniu i ponownym połączeniu wchodzimy sami, danymi z pamięci —
      // gracz nie ma być pytany o hasło za każdym mignięciem sieci.
      this.sendJoin();
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

      case 'welcome': {
        this.id = message.id;
        this.name = message.name;
        this.admin = Boolean(message.admin);
        this.body = { x: message.you.x, y: message.you.y, vx: 0, vy: 0 };
        this.prevX = message.you.x;
        this.prevY = message.you.y;
        this.unacked.length = 0;
        for (const p of message.players) this.upsert(p);
        this.setStatus('połączony');
        const resolve = this.pending;
        this.pending = null;
        resolve?.({ ok: true, name: message.name, fresh: Boolean(message.fresh) });
        break;
      }

      case 'autherr': {
        const resolve = this.pending;
        this.pending = null;
        this.credentials = null;
        this.setStatus('logowanie odrzucone');
        resolve?.({ ok: false, reason: message.reason });
        break;
      }

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
      existing.admin = Boolean(p.a);
      return existing;
    }
    const remote = { id: p.id, name: p.n, variant: p.v, admin: Boolean(p.a), buffer: [] };
    this.remotes.set(p.id, remote);
    return remote;
  }

  /**
   * Ustawia własną postać na pozycji z serwera i ponownie wykonuje komendy,
   * których serwer jeszcze nie rozliczył.
   */
  reconcile(message) {
    // Migawka może przyjść, zanim gracz się zaloguje (albo po rozłączeniu) —
    // wtedy nie ma czego korygować.
    if (!this.body) return;
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

    while (this.unacked.length && this.unacked[0][0] <= message.ack) this.unacked.shift();
    for (const [, keys, ms] of this.unacked) {
      advance(this.world, this.body, keys, ms / 1000);
    }

    this.error = Math.hypot(this.body.x - predictedX, this.body.y - predictedY);

    // Po zestawieniu z serwerem punkt odniesienia dla klatki pośredniej musi
    // pójść razem z pozycją — inaczej rysowalibyśmy przejście od miejsca,
    // w którym postać już nie jest.
    this.prevX = this.body.x;
    this.prevY = this.body.y;

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
  update(keys, phaserDeltaMs) {
    if (!this.body) return null;

    // Wszystkie czasy w tym pliku pochodzą z `performance.now()`. Zegar Phasera
    // liczy od startu gry, nie od wczytania strony — mieszanie ich sprawiało, że
    // interpolacja szukała w buforze chwili, której tam nie było, i zamiast
    // wygładzać ruch innych graczy przyklejała się do ostatniej migawki.
    const now = performance.now();

    // Czas liczymy sami, z zegara przeglądarki. `delta` Phasera jest wygładzana,
    // a przy dużym skoku silnik wchodzi w tryb awaryjny i podstawia średnią
    // zamiast prawdziwego czasu — postać gubiła wtedy ruch i zwalniała.
    const realDelta = Math.min(MAX_FRAME_MS, Math.max(0, now - (this.lastFrameAt ?? now)));
    this.lastFrameAt = now;

    const meter = this.meter;
    meter.frames++;
    meter.real += realDelta;
    meter.phaser += Math.max(0, phaserDeltaMs ?? 0);
    if (realDelta > meter.worstFrame) meter.worstFrame = realDelta;

    this.accumulator = (this.accumulator ?? 0) + realDelta;
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= STEP_MS;
      steps++;
      this.seq++;
      const command = [this.seq, keys, STEP_MS];
      // Pozycja sprzed kroku — z niej i z nowej liczymy klatkę pośrednią.
      this.prevX = this.body.x;
      this.prevY = this.body.y;
      advance(this.world, this.body, keys, STEP_MS / 1000);
      this.unacked.push(command);
      this.outbox.push(command);
    }
    // Po bardzo długiej przerwie (przełączona karta) nie odrabiamy wszystkiego —
    // resztę porzucamy, bo gracz i tak tego nie widział.
    if (this.accumulator > STEP_MS * MAX_CATCHUP_STEPS) this.accumulator = 0;

    meter.simulated += steps * STEP_MS;
    if (now - meter.since >= 1000) {
      const seconds = (now - meter.since) / 1000;
      meter.fps = meter.frames / seconds;
      meter.realPerSec = meter.real / seconds;
      meter.phaserPerSec = meter.phaser / seconds;
      meter.simPerSec = meter.simulated / seconds;
      meter.lastWorst = meter.worstFrame;
      meter.frames = 0; meter.real = 0; meter.phaser = 0; meter.simulated = 0;
      meter.worstFrame = 0; meter.since = now;
    }

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
    if (this.unacked.length > 240) this.unacked.splice(0, this.unacked.length - 240);

    return this.body;
  }

  /**
   * Pozycja do narysowania — pośrednia między dwoma ostatnimi krokami symulacji.
   *
   * Symulacja chodzi krokiem 16 ms, a ekran odświeża się co 16,67 ms. Te liczby
   * się nie dzielą, więc raz na kilkanaście klatek jedna dostaje dwa kroki ruchu,
   * a inna żaden — i to widać jako drobne teleportowanie postaci, mimo pełnych
   * 60 klatek. Rysowanie punktu pośredniego rozkłada ruch równo. Kosztem jest
   * obraz opóźniony o najwyżej jeden krok, czyli 16 ms — niezauważalne.
   */
  renderPosition() {
    if (!this.body) return null;
    const fromX = this.prevX ?? this.body.x;
    const fromY = this.prevY ?? this.body.y;
    const alpha = Math.max(0, Math.min(1, this.accumulator / STEP_MS));
    return {
      x: fromX + (this.body.x - fromX) * alpha,
      y: fromY + (this.body.y - fromY) * alpha,
    };
  }

  /** Komplet liczb do panelu diagnostycznego. */
  stats() {
    const m = this.meter;
    return {
      wersja: CLIENT_VERSION,
      stan: this.status,
      ping: this.rtt,
      korekta: this.error,
      fps: m.fps,
      najgorszaKlatka: m.lastWorst,
      czasRealny: m.realPerSec,
      czasPhasera: m.phaserPerSec,
      czasSymulacji: m.simPerSec,
      niepotwierdzone: this.unacked.length,
      obok: this.remotes.size,
    };
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

      result.push({ id: remote.id, name: remote.name, variant: remote.variant, admin: remote.admin, ...sample });
    }

    return result;
  }
}

export { poseOf };
