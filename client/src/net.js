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
// `advance` znaczy tu co innego niż w ruchu — stąd alias, żeby nie było wątpliwości,
// który krok czasu jest który.
import { advance as advanceDay, partOfDay, phaseOf } from './world/daylight.js';
import { weatherName } from './world/weather.js';

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
const CLIENT_VERSION = 13;
const MAX_FRAME_MS = 250;   // dłuższa przerwa (przełączona karta) nie jest odrabiana

// Limity czatu. Muszą być zgodne z serwerem: on odrzuca po cichu, więc gdyby
// klient pozwalał na więcej, gracz widziałby wiadomości przepadające bez słowa.
const MAX_CHAT_CHARS = 120;
const CHAT_INTERVAL_MS = 1500;

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
    this.chatListeners = [];
    // Tryb wejścia ogłasza serwer wiadomością `gate`, zaraz po otwarciu gniazda.
    this.gate = null;
    this.gateListeners = [];
    this.guest = false;
    this.lastChatAt = -Infinity;
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

  /** Woła, gdy serwer ogłosi tryb wejścia — albo od razu, jeśli już go ogłosił. */
  onGate(callback) {
    if (this.gate) callback(this.gate);
    else this.gateListeners.push(callback);
  }

  /** Wiadomości czatu i komunikaty serwera — jednym strumieniem, w kolejności. */
  onChat(callback) {
    this.chatListeners.push(callback);
  }

  emitChat(entry) {
    for (const callback of this.chatListeners) callback(entry);
  }

  /**
   * Wysyła wiadomość na czat. Zwraca `{ ok: true }` albo powód odmowy.
   *
   * Odstęp sprawdzamy także tutaj, mimo że pilnuje go serwer: tam odrzucenie jest
   * ciche, a gracz musi wiedzieć, czemu jego zdanie nie poszło.
   */
  sendChat(text) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_CHARS);
    if (!clean) return { ok: false, reason: null };   // puste — bez komentarza
    if (!this.id) return { ok: false, reason: 'brak połączenia z serwerem' };

    const now = performance.now();
    if (now - this.lastChatAt < CHAT_INTERVAL_MS) {
      return { ok: false, reason: 'za szybko — jedna wiadomość na 1,5 s' };
    }
    this.lastChatAt = now;

    this.send({ t: 'chat', m: clean });
    return { ok: true };
  }

  /**
   * Kto jest online — do tabeli pod TAB-em. Serwer i tak przysyła co migawkę
   * opis wszystkich graczy, więc nie ma po co pytać o listę osobno.
   */
  roster() {
    const list = [];
    if (this.name) {
      list.push({ id: this.id, name: this.name, admin: Boolean(this.admin), you: true });
    }
    for (const remote of this.remotes.values()) {
      list.push({ id: remote.id, name: remote.name, admin: remote.admin, you: false });
    }
    return list;
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

  /**
   * Wejście bez logowania — tylko jeśli serwer sam powiedział, że je dopuszcza.
   * Prosimy o nick, który dostaliśmy wcześniej, żeby przeładowanie strony
   * (a serwer deweloperski robi je po każdym zapisie pliku) nie zmieniało postaci.
   */
  joinAsGuest() {
    return new Promise((resolve) => {
      this.guest = true;
      this.pending = resolve;
      if (this.socket?.readyState === 1) this.sendJoin();
    });
  }

  sendJoin() {
    if (this.guest) {
      this.send({ t: 'join', guest: true, name: this.name ?? undefined, ver: CLIENT_VERSION });
      return;
    }
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

      case 'gate':
        // Serwer mówi, czy wymaga logowania. Scena świata czeka na tę wiadomość,
        // zanim zdecyduje, czy pokazać formularz.
        this.gate = { guests: Boolean(message.guests) };
        for (const callback of this.gateListeners) callback(this.gate);
        this.gateListeners.length = 0;
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

      case 'chat':
        this.emitChat({
          id: message.id,
          name: message.n,
          admin: Boolean(message.a),
          you: message.id === this.id,
          text: String(message.m ?? ''),
        });
        break;

      case 'system':
        this.emitChat({ id: null, system: true, text: String(message.m ?? '') });
        break;

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

    // Stan ciosu przywracamy razem z pozycją i **z tego samego powodu**: zaraz
    // odtworzymy niepotwierdzone komendy, a one przewijają cios. Gdyby licznik
    // ciosu nie był resetowany, każde odtworzenie przewijałoby go od nowa i cios
    // u klienta biegłby wielokrotnie szybciej niż na serwerze.
    this.body.atk = message.you.a ?? 0;
    this.body.atkWait = message.you.aw ?? 0;
    this.body.atkSeq = message.you.as ?? 0;
    this.body.atkStrike = message.you.ak ?? 0;
    this.body.atkDx = message.you.adx ?? 0;
    this.body.atkDy = message.you.ady ?? 0;
    this.body.atkFacing = message.you.af ?? 'down';
    this.body.atkAim = message.you.ao ?? message.you.af ?? 'down';
    this.body.atkFlip = Boolean(message.you.al);
    if (Number.isFinite(message.you.am)) this.body.aim = message.you.am;

    // Życie własne. **Nie przewidujemy go** i to jest świadome: o obrażeniach
    // rozstrzyga wyłącznie serwer, więc nie ma czego odtwarzać po korekcie —
    // a zgadywanie własnego HP dawałoby paski, które skaczą w tył.
    this.hp = message.you.hp ?? this.hp ?? 0;
    this.maxHp = message.you.mhp ?? this.maxHp ?? 100;
    this.safe = Boolean(message.you.safe);
    const hurt = message.you.hs ?? 0;
    if (hurt !== (this.hurtSeq ?? hurt)) this.onHurtSelf?.();
    this.hurtSeq = hurt;
    this.body.dodge = message.you.d ?? 0;
    this.body.dodgeWait = message.you.dw ?? 0;
    this.body.dodgeSeq = message.you.ds ?? 0;
    this.body.dodgeDx = message.you.ddx ?? 0;
    this.body.dodgeDy = message.you.ddy ?? 0;
    if (Number.isFinite(message.you.df)) this.body.dodgeFuel = message.you.df;

    while (this.unacked.length && this.unacked[0][0] <= message.ack) this.unacked.shift();
    for (const [, keys, ms, turn] of this.unacked) {
      advance(this.world, this.body, keys, ms / 1000, (turn / 256) * Math.PI * 2);
    }

    this.error = Math.hypot(this.body.x - predictedX, this.body.y - predictedY);

    // Po zestawieniu z serwerem punkt odniesienia dla klatki pośredniej musi
    // pójść razem z pozycją — inaczej rysowalibyśmy przejście od miejsca,
    // w którym postać już nie jest.
    this.prevX = this.body.x;
    this.prevY = this.body.y;

    // Cele do bicia. Pozycji nie interpolujemy jak graczy: kukła po ciosie szarpie
    // się gwałtownie i wygładzanie zjadałoby właśnie to, co ma być widoczne.
    if (message.ms) this.mobs = message.ms;

    // Pora dnia. Zapamiętujemy razem z chwilą odbioru, żeby między migawkami
    // posuwać ją samodzielnie — dwadzieścia skoków na sekundę byłoby widać
    // jako drganie światła.
    if (typeof message.d === 'number') {
      this.dayPhase = message.d;
      this.dayPhaseAt = now;
    }

    // Deszcz zmienia się wolno, więc bierzemy go wprost z migawki. Wygładzaniem
    // zajmuje się scena — i musi, bo przy wejściu do gry pierwsza wartość bywa
    // pełną ulewą i bez łagodnego dojścia deszcz zaczynałby się jedną klatką.
    if (typeof message.r === 'number') this.rain = message.r;

    for (const p of message.ps) {
      const remote = this.upsert(p);
      remote.hp = p.h;
      remote.maxHp = p.mh;
      remote.buffer.push({
        at: now, x: p.x, y: p.y, f: p.f, k: p.k, m: p.m, l: p.l, s: p.s,
        h: p.h, mh: p.mh, hs: p.hs, hx: p.hx, hy: p.hy,
      });
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
      // Kąt celowania leci **w każdej komendzie**, a nie osobnym komunikatem.
      // Musi, bo serwer odtwarza komendy po korekcie: kierunek ciosu jest częścią
      // wejścia dokładnie tak samo jak wciśnięte klawisze. Zapisany jako jedna
      // z 256 ósemek stopnia — dokładniej niż widać, a mieści się w bajcie.
      const turn = Math.round(((this.aim ?? Math.PI / 2) / (Math.PI * 2)) * 256) & 255;
      const command = [this.seq, keys, STEP_MS, turn];
      // Pozycja sprzed kroku — z niej i z nowej liczymy klatkę pośrednią.
      this.prevX = this.body.x;
      this.prevY = this.body.y;
      advance(this.world, this.body, keys, STEP_MS / 1000, (turn / 256) * Math.PI * 2);
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

  /**
   * Pora dnia w tej chwili: ostatnia wartość z serwera, posunięta o czas, jaki
   * minął od jej odebrania.
   *
   * Zanim przyjdzie pierwsza migawka, liczymy z własnego zegara. Rozjazd jest
   * wtedy możliwy, ale trwa ułamek sekundy i dotyczy tylko koloru światła —
   * lepszy niż błysk domyślnej barwy przy wejściu do gry.
   */
  phaseNow() {
    // Suwak testowy ma pierwszeństwo, ale zegara nie zatrzymuje: po zwolnieniu
    // sterowania światło wraca tam, gdzie naprawdę jest pora dnia.
    if (this.dayOverride != null) return this.dayOverride;
    if (this.dayPhase == null) return phaseOf(Date.now());
    return advanceDay(this.dayPhase, performance.now() - this.dayPhaseAt);
  }

  /**
   * Ręczne przestawienie pory dnia — wyłącznie u siebie, do oglądania świateł.
   * `null` oddaje sterowanie z powrotem zegarowi serwera.
   */
  setDayOverride(phase) {
    this.dayOverride = phase;
  }

  /** Siła deszczu z serwera, 0–1. Zanim przyjdzie pierwsza migawka — sucho. */
  rainNow() {
    if (this.rainOverride != null) return this.rainOverride;
    return this.rain ?? 0;
  }

  /** Ręczne przestawienie pogody — jak przy porze dnia, wyłącznie u siebie. */
  setRainOverride(rain) {
    this.rainOverride = rain;
  }

  /** Pora dnia z serwera, bez względu na suwak — do podpisu pod suwakiem. */
  serverPhase() {
    if (this.dayPhase == null) return phaseOf(Date.now());
    return advanceDay(this.dayPhase, performance.now() - this.dayPhaseAt);
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
      poraDnia: partOfDay(this.phaseNow()),
      pogoda: weatherName(this.rainNow()),
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
          f: after.f, k: after.k, m: after.m, l: after.l, s: after.s,
          h: after.h, mh: after.mh, hs: after.hs, hx: after.hx, hy: after.hy,
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
