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

import { Game, TICK_HZ, inSafeZone } from './game.js';
import { Accounts, checkName, isReserved } from './accounts.js';
import { phaseOf } from '../../client/src/world/daylight.js';
import { rainAt } from '../../client/src/world/weather.js';

const MAX_MESSAGE_BYTES = 1024;      // najdłuższa sensowna wiadomość to kilkadziesiąt bajtów
const MAX_MESSAGES_PER_SECOND = 90;  // wejście leci ~30 Hz, zapas na skoki
const JOIN_TIMEOUT_MS = 60_000;      // tyle czasu na wpisanie nicku i hasła
const HEARTBEAT_MS = 30_000;
const MAX_AUTH_ATTEMPTS = 8;         // na jedno połączenie
const MAX_CHAT_CHARS = 120;
const CHAT_INTERVAL_MS = 1500;       // jedna wiadomość na tyle — liczone tutaj, nie u klienta

/**
 * Czyszczenie wiadomości czatu.
 *
 * Wszystko, co nie jest zwykłym tekstem, zamieniamy na spację: znaki sterujące,
 * znaczniki kierunku pisma i niewidzialne wypełniacze. Nie chodzi o estetykę —
 * tym da się rozwalić układ dymka nad głową albo wpisać w wiadomość coś, co
 * wygląda jak cudza plakietka. Na koniec zwijamy białe znaki, więc sto spacji
 * i pusta wiadomość to to samo, czyli nic.
 */
/**
 * Nicki dla trybu bez logowania. Lista jest zamknięta i dobrana tak, żeby żaden
 * z tych nicków nie był zastrzeżony — losowanie nie może wypuścić na mapę kogoś
 * o nicku „Goblin" albo „Admin".
 */
const GUEST_NAMES = [
  'Kopec', 'Zgrzyt', 'Smoluch', 'Ryjek', 'Kudlacz', 'Obdartus', 'Chrust', 'Lupacz',
  'Cwaniak', 'Piszczel', 'Zebacz', 'Kikut', 'Grzechotka', 'Chytrus', 'Slepiec',
  'Karczoch', 'Szpon', 'Kolczuga', 'Wywloka', 'Smarkacz',
];

function cleanChat(raw) {
  if (typeof raw !== 'string') return '';

  // Znaki podajemy numerami, a nie w nawiasie kwadratowym wyrażenia. Są
  // niewidzialne, więc wpisane dosłownie w źródło byłyby nie do odczytania —
  // a dwa z nich (0x2028 i 0x2029) JavaScript liczy jako koniec linii, czyli
  // rozwaliłyby ten plik w miejscu, w którym niczego nie widać.
  let out = '';
  for (const character of raw) {
    const code = character.codePointAt(0);
    const invisible = code < 0x20                        // znaki sterujące
      || (code >= 0x7f && code <= 0x9f)                   // usuwanie i sterowanie C1
      || code === 0xad                                    // miękki dywiz
      || (code >= 0x200b && code <= 0x200f)               // zerowej szerokości, kierunek pisma
      || (code >= 0x2028 && code <= 0x202e)               // separatory linii i przestawianie stron
      || code === 0x2060 || code === 0xfeff;              // łącznik słów, znacznik kolejności bajtów
    out += invisible ? ' ' : character;
  }

  return out.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_CHARS);
}

export function attachGame(sockets, dataDir, variantCount = 6, { guests = false } = {}) {
  const game = new Game();
  const accounts = new Accounts(dataDir);
  const sessions = new Map();   // socket → sesja
  let nextId = 1;

  /**
   * Wolny nick dla gościa. Sprawdzamy i konta, i graczy obecnie na mapie: gość
   * nie może dostać nicku zarejestrowanego gracza, bo wtedy tryb testowy byłby
   * darmową drogą do podszycia się pod kogokolwiek.
   */
  const freeGuestName = () => {
    const taken = (name) => {
      const key = Accounts.keyOf(name);
      if (accounts.has(key)) return true;
      for (const player of game.players.values()) {
        if (Accounts.keyOf(player.name) === key) return true;
      }
      return false;
    };

    for (let attempt = 0; attempt < 60; attempt++) {
      const base = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
      const name = `${base}${10 + Math.floor(Math.random() * 90)}`;
      if (!taken(name)) return name;
    }
    // Awaryjnie numer sesji — brzydki, ale zawsze wolny.
    return `Gosc${nextId}`;
  };

  /** Czy gość może dostać nick, o który prosi (przy powrocie po zerwaniu sieci). */
  const guestNameAllowed = (name) => {
    if (typeof name !== 'string') return false;
    if (checkName(name) || isReserved(name)) return false;
    const key = Accounts.keyOf(name);
    if (accounts.has(key)) return false;
    for (const player of game.players.values()) {
      if (Accounts.keyOf(player.name) === key) return false;
    }
    return true;
  };

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
  /**
   * Wejście bez logowania — tryb testowy, włączany flagą `--bez-logowania`.
   *
   * Gość **nie trafia do pliku z kontami**. Inaczej po godzinie testów leżałoby
   * tam kilkaset losowych nicków, a jeden z nich mógłby kiedyś zablokować komuś
   * prawdziwy nick.
   *
   * Nick da się poprosić przy powrocie i to jest celowe: serwer deweloperski
   * przeładowuje przeglądarkę po każdym zapisie pliku, a zmieniający się przy tym
   * nick byłby nie do wytrzymania. Prośba jest sprawdzana tak samo jak wszystko
   * inne z sieci — nick zajęty, zarejestrowany albo zastrzeżony jest odrzucany.
   */
  function enterAsGuest(socket, session, message, request) {
    const wanted = message.name;
    const name = guestNameAllowed(wanted) ? wanted.trim() : freeGuestName();

    const id = nextId++;
    const player = game.add(id, { name, variant: 0, admin: false });
    session.player = player;
    session.guest = true;
    session.joining = false;
    clearTimeout(session.joinTimer);

    const { browser, version } = describeClient(request, message);
    session.version = version;
    player.version = version;

    send(socket, {
      t: 'welcome',
      id,
      hz: TICK_HZ,
      name,
      fresh: false,
      admin: false,
      guest: true,
      you: { x: player.x, y: player.y },
      players: game.snapshot(),
    });
    broadcast({ t: 'spawn', p: game.describe(player) }, socket);
    broadcast({ t: 'system', m: `${name} wchodzi do kuźni` }, socket);
    console.log(`  + ${name} (#${id}) — GOSC (bez logowania), klient v${version}, ${browser}`
      + ` — graczy: ${game.players.size}`);
  }

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
    const player = game.add(id, { name: account.name, variant, admin: Boolean(account.admin) });
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
      admin: Boolean(account.admin),
      you: { x: player.x, y: player.y },
      players: game.snapshot(),
    });
    broadcast({ t: 'spawn', p: game.describe(player) }, socket);
    // Wejścia i wyjścia idą na czat, ale nie do samego wchodzącego — ten dostaje
    // powitanie. Bez tego log czatu na spokojnym serwerze jest pustym paskiem.
    broadcast({ t: 'system', m: `${account.name} wchodzi do kuźni` }, socket);
    console.log(`  + ${account.name}${account.admin ? ' [ADMIN]' : ''} (#${id}) — ${exists ? 'logowanie' : 'NOWE KONTO'}`
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

    // Klient musi wiedzieć, czy pokazywać formularz, **zanim** go pokaże. Decyzja
    // należy do serwera: gdyby zależała od kodu klienta, wystarczyłoby podmienić
    // plik w przeglądarce, żeby ominąć logowanie.
    send(socket, { t: 'gate', guests });

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

        // W trybie testowym wchodzi się bez hasła. Zwykłe logowanie dalej działa,
        // więc konto właściciela nadal wpuszcza z odznaką admina — wystarczy podać
        // nick i hasło zamiast prosić o wejście jako gość.
        if (guests && message.guest) {
          session.joining = true;
          enterAsGuest(socket, session, message, request);
          return;
        }

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

      if (message.t === 'chat') {
        const text = cleanChat(message.m);
        if (!text) return;

        // Odstęp pilnowany tutaj, bo klient da się przerobić. Wiadomość wysłana
        // za szybko przepada w ciszy — u siebie klient pilnuje tego samego
        // odstępu i to on tłumaczy graczowi, dlaczego nic nie wyszło.
        const stamp = Date.now();
        if (stamp - (session.lastChat ?? 0) < CHAT_INTERVAL_MS) return;
        session.lastChat = stamp;

        // Rozgłaszamy też do autora. Nie robimy odbicia u klienta, bo wtedy
        // każdy widziałby swój dymek w innym momencie niż wszyscy pozostali.
        broadcast({
          t: 'chat',
          id: session.player.id,
          n: session.player.name,
          a: session.player.admin ? 1 : 0,
          m: text,
        });
        console.log(`  ${session.player.name}: ${text}`);
        return;
      }

      // Plecak. Klient przysyła **zamiar**, nie wynik — „przesuń przedmiot 3 na
      // kratkę 2,4 obrócony". Sprawdza `game.moveItem()`; stąd tylko odsiew
      // wartości, które nie są liczbami.
      if (message.t === 'bag') {
        if (message.a === 'move') {
          if (!Number.isInteger(message.i)) return;
          game.moveItem(session.player, message.i, message.x | 0, message.y | 0, message.r ? 1 : 0);
          return;
        }
        if (message.a === 'drop') {
          if (!Number.isInteger(message.i)) return;
          game.dropItem(session.player, message.i, Date.now());
          return;
        }
        if (message.a === 'eat') {
          if (!Number.isInteger(message.i)) return;
          game.eatItem(session.player, message.i);
          return;
        }
        return;
      }

      // Podniesienie z ziemi na żądanie. Bez parametrów: serwer sam wybiera
      // **najbliższą rzecz w zasięgu**, bo inaczej klient mógłby wskazać
      // dowolną i zbierać z drugiego końca mapy.
      if (message.t === 'pick') {
        game.pickRequest(session.player, Date.now());
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
        broadcast({ t: 'system', m: `${session.player.name} wychodzi` });
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
    const mobs = game.mobSnapshot();
    for (const [socket, session] of sessions) {
      const me = session.player;
      if (!me || socket.readyState !== 1) continue;
      socket.send(JSON.stringify({
        t: 'state',
        ts: Date.now(),
        // Pora dnia jako ułamek doby. Wysyłamy **czas, nie policzony kolor** —
        // to jedna liczba zamiast trzech na klatkę, a przeliczeniem i tak musi
        // zająć się klient, bo to on rysuje.
        d: Math.round(phaseOf(Date.now()) * 10000) / 10000,
        // Deszcz tą samą drogą i z tego samego powodu: o pogodzie rozstrzyga
        // serwer, a jedna liczba na migawkę nic nie waży.
        r: Math.round(rainAt(Date.now()) * 1000) / 1000,
        ack: me.seq,
        // Stan ciosu należy do serwera dokładnie tak samo jak pozycja.
        //
        // Bez niego klient, odtwarzając niepotwierdzone komendy po każdej korekcie,
        // przewijał swój własny cios **drugi raz** — dwadzieścia razy na sekundę.
        // Licznik ciosu biegł u niego szybciej niż na serwerze, przez co uderzenia
        // wypadały w innych momentach i część z nich gubiła się albo dublowała.
        you: {
          x: me.x, y: me.y, vx: me.vx, vy: me.vy,
          // Życie własne razem z resztą stanu. Klient tego nie przewiduje —
          // obrażenia rozstrzyga wyłącznie serwer, więc nie ma czego odtwarzać.
          hp: Math.round(me.hp),
          mhp: me.maxHp,
          hs: me.hurtSeq ?? 0,
          safe: inSafeZone(me.x, me.y) ? 1 : 0,
          a: Math.round(me.atk ?? 0),
          aw: Math.round(me.atkWait ?? 0),
          as: me.atkSeq ?? 0,
          ak: me.atkStrike ?? 0,
          adx: Math.round((me.atkDx ?? 0) * 1000) / 1000,
          ady: Math.round((me.atkDy ?? 0) * 1000) / 1000,
          af: me.atkFacing ?? 'down',
          ao: me.atkAim ?? me.atkFacing ?? 'down',
          al: me.atkFlip ? 1 : 0,
          // Kąt celowania wraca do klienta, bo po korekcie odtwarza on komendy
          // jeszcze niepotwierdzone — a każda z nich zawiera własny kąt. Bez tego
          // pierwsza odtworzona komenda startowałaby od kąta sprzed korekty.
          am: Math.round((me.aim ?? Math.PI / 2) * 1000) / 1000,
          // Odskok tak samo jak cios — jest stanem fizyki, więc odtwarzanie
          // komend po korekcie przewijałoby go drugi raz.
          d: Math.round(me.dodge ?? 0),
          dw: Math.round(me.dodgeWait ?? 0),
          // Ładunki uniku jako ułamek — HUD pokazuje z nich nie tylko ile jest,
          // ale ile zaraz będzie.
          df: Math.round((me.dodgeFuel ?? 0) * 1000) / 1000,
          ds: me.dodgeSeq ?? 0,
          ddx: Math.round((me.dodgeDx ?? 0) * 1000) / 1000,
          ddy: Math.round((me.dodgeDy ?? 0) * 1000) / 1000,
          is: me.pickSeq,
          // Głód i broń. Obie liczy wyłącznie serwer.
          fd: Math.round(me.food),
          mfd: me.maxFood,
          w: me.weapon ?? '',
          // Czy jest co podnieść pod nogami — po tym klient zapala podpowiedź.
          // Liczy serwer, bo to on wie, co naprawdę leży i czy już wolno to wziąć.
          pk: game.reachableDrop(me, Date.now()) ? 1 : 0,
        },
        ps: all.filter((p) => p.id !== me.id),
        ms: mobs,
        // Zasoby i rzeczy na ziemi liczone **osobno dla każdego gracza**, bo obie
        // listy są przycięte do tego, co ten gracz może zobaczyć.
        nd: game.nodeSnapshot(me),
        dr: game.dropSnapshot(me),
        // Plecak leci **tylko do właściciela**. Przy grze, w której łupi się
        // innych, cudza zawartość nie ma prawa być u nikogo w pamięci — inaczej
        // przerobiony klient pokazuje, kogo warto zabić.
        bg: game.bagSnapshot(me),
      }));
    }
  }, 1000 / TICK_HZ);

  const shutdown = () => { accounts.flush(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return game;
}
