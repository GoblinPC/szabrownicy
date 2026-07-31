// Fizyka ruchu postaci — jedyna kopia w projekcie.
//
// Ten plik importuje zarówno klient (do przewidywania własnego ruchu), jak
// i serwer (do liczenia stanu prawdziwego). Gdyby istniały dwie kopie, zaczęłyby
// się rozjeżdżać i gracz widziałby, jak jego postać "cofa się" po każdej korekcie.
// Dlatego kod jest czystym JS-em bez Phasera i bez niczego z przeglądarki.

import { isWalkable, creatureAt } from './forge.js';

export const WALK_SPEED = 74;
export const RUN_SPEED = 112;
export const ACCELERATION = 14;   // im wyżej, tym ostrzejszy start i zatrzymanie
export const FOOT_HALF_W = 5;     // prostokąt stóp, na nim liczona jest kolizja
export const FOOT_H = 6;

// Wejście jako maska bitowa — jedna liczba zamiast obiektu, bo leci przez sieć
// kilkadziesiąt razy na sekundę.
export const KEY_UP = 1;
export const KEY_DOWN = 2;
export const KEY_LEFT = 4;
export const KEY_RIGHT = 8;
export const KEY_RUN = 16;
export const KEY_ATTACK = 32;
export const KEY_DODGE = 64;
// Ile bitów wejścia jest w użyciu. Serwer obcina maskę do tej wartości, więc
// **dodanie nowego klawisza wymaga podniesienia tej liczby** — inaczej serwer
// po cichu zignoruje wciśnięcie, klient je uwzględni i obie strony rozjadą się
// bez żadnego komunikatu o błędzie.
export const KEY_MASK = 127;

// --- Odskok -------------------------------------------------------------------
//
// Krótki wyskok w bok albo w tył. Ma dać czym **reagować** — bez niego walka jest
// wymianą ciosów na stojąco i to jest źródło wrażenia toporności.
//
// Trzy rzeczy decydują o tym, czy odskok jest przyjemny:
//
// 1. **Wychodzi natychmiast.** Żadnego zamachu przed nim.
// 2. **Przerywa dochodzenie do siebie po ciosie.** Wolno go zrobić w ostatniej
//    fazie ciosu, więc po uderzeniu można od razu wycofać się z zasięgu zamiast
//    stać jak słup do końca animacji. To jest ta rzecz, która robi z walki taniec.
// 3. **Kosztuje ładunek.** Bez tego gracz skacze bez końca i nic go nie kosztuje.
//
// Ładunki zamiast jednej przerwy, i to jest różnica w rozgrywce, nie w liczbach:
// przy jednej przerwie każdy odskok jest taki sam, a przy trzech ładunkach można
// **wydać wszystko naraz** — trzy skoki pod rząd to ucieczka, po której przez
// chwilę nie masz nic. To jest decyzja, a przerwa nią nie była.
//
// Ładunek trzymamy jako **liczbę zmiennoprzecinkową 0–3**, a nie licznik sztuk:
// dzięki temu ładowanie jest ciągłe, odtwarza się identycznie po korekcie
// i pasek na HUD-zie może pokazać, ile *zaraz* będzie.
export const DODGE_MS = 200;
export const DODGE_CHARGES = 3;
export const DODGE_RECHARGE_MS = 2600;
// Krótka blokada po odskoku, żeby trzy ładunki nie wyszły w jednej klatce jako
// jeden długi lot. Chodzi o trzy osobne skoki, a nie o rakietę.
export const DODGE_GAP_MS = 260;
const DODGE_SPEED = 250;

/** Ile ładunków uniku jest gotowych — z częściowym, jako ułamek. */
export function dodgeFuel(body) {
  return Math.max(0, Math.min(DODGE_CHARGES, body.dodgeFuel ?? DODGE_CHARGES));
}

/** Ile odskoku już minęło, albo `null` poza odskokiem. */
export function dodgeElapsed(body) {
  const left = body.dodge ?? 0;
  return left > 0 ? DODGE_MS - left : null;
}

// --- Cios: łańcuch trzech uderzeń ---------------------------------------------
//
// **To jest rdzeń odczucia walki**, nie ozdoba. Gdy każdy cios jest identyczny,
// młócenie klawiszem jest powtarzaniem jednej animacji i czuć to jako toporność,
// choćby efekty były najlepsze. Trzy różne uderzenia dają rytm.
//
// Układ: dwa szybkie cięcia w przeciwne strony, a na końcu wolne rąbnięcie
// z góry za znacznie więcej życia. Trzeci cios jest **wolny celowo** — to za niego
// się płaci czasem, i to on nagradza doprowadzenie łańcucha do końca.
//
// Czasy faz muszą zgadzać się z czasami klatek animacji w `scenes/Boot.js`. Tam
// decydują o tym, co widać, tutaj o tym, kiedy ostrze sięga i kiedy wolno uderzyć
// ponownie.
export const ATTACK_STEPS = [
  {
    name: 'cięcie z góry',
    phases: [
      { name: 'windup', ms: 120, speed: 0.2 },
      { name: 'strike', ms: 55, speed: 0 },
      { name: 'follow', ms: 80, speed: 0.25 },
      { name: 'recover', ms: 100, speed: 0.6 },
    ],
    damage: 10,
    lunge: 92,
    knockback: 150,
    hitstop: 55,
    kick: 3,
    range: 46,
    arc: 84,
  },
  {
    name: 'cięcie z dołu',
    phases: [
      { name: 'windup', ms: 110, speed: 0.2 },
      { name: 'strike', ms: 55, speed: 0 },
      { name: 'follow', ms: 80, speed: 0.25 },
      { name: 'recover', ms: 105, speed: 0.6 },
    ],
    damage: 10,
    lunge: 96,
    knockback: 150,
    hitstop: 55,
    kick: 3,
    range: 46,
    arc: 84,
  },
  {
    // Pchnięcie, nie rąbnięcie. Wybrane świadomie: ostrze rysujemy z punktu
    // garści, kąta i długości, więc pchnięcie to **rosnąca długość przy stałym
    // kącie** — najprostszy do narysowania z trzech ciosów, a po dwóch cięciach
    // czyta się najwyraźniej, bo jako jedyny idzie prosto w przód.
    name: 'pchnięcie',
    phases: [
      { name: 'windup', ms: 230, speed: 0.1 },   // długie cofnięcie — widać, że coś idzie
      { name: 'strike', ms: 70, speed: 0 },
      { name: 'follow', ms: 110, speed: 0.15 },
      { name: 'recover', ms: 180, speed: 0.5 },
    ],
    damage: 28,
    lunge: 150,
    knockback: 300,
    hitstop: 110,
    kick: 7,
    // Sięga wyraźnie dalej i to jest jego cała przewaga — obrażenia są nagrodą
    // za doprowadzenie łańcucha do końca, zasięg za trafienie z dystansu.
    range: 56,
    arc: 60,
  },
];

/**
 * Broń jako **mnożniki**, nie osobne łańcuchy ciosów.
 *
 * Ruch zostaje ten sam — zamach, uderzenie, wyprowadzenie, powrót — a różnicę
 * robią zasięg i obrażenia. Trzy osobne trajektorie na broń kosztowałyby trzy
 * razy więcej klatek i i tak dawałyby to samo odczucie.
 *
 * **Zasięg boli bardziej niż liczby.** Pięści mają połowę obrażeń włóczni, ale
 * to skrócony zasięg decyduje o tym, że walka bez broni jest inna: trzeba wejść
 * w zwarcie, czyli w miejsce, z którego dzik zdąży uderzyć pierwszy.
 */
// Liczby dobrane po obejrzeniu w grze, nie z rachunku. Pierwsza wersja miała
// zasięg 0,52 i wypad 0,7 — użytkownik zgłosił od razu, że **bije za daleko,
// za mocno i wyrywa go do przodu**, czyli że cios pięścią dalej zachowuje się
// jak pchnięcie włócznią. Pięść ma sięgać mniej więcej na długość ręki:
// przy zasięgu włóczni 46–56 px daje to jakieś 17–21 px, czyli nieco ponad kafel.
export const WEAPONS = {
  fists: { range: 0.37, damage: 0.28, lunge: 0.34, frames: 'p' },
  spear: { range: 1, damage: 1, lunge: 1, frames: 'a' },
};

/** Opis broni, z bezpiecznym powrotem do pięści. */
export function weaponOf(name) {
  return WEAPONS[name] ?? WEAPONS.fists;
}

const LAST_STEP = ATTACK_STEPS.length - 1;

/** Całkowity czas danego ciosu z łańcucha. */
export function attackMs(step = 0) {
  return ATTACK_STEPS[step].phases.reduce((sum, phase) => sum + phase.ms, 0);
}

/** Od której milisekundy ostrze sięga. */
export function strikeFrom(step = 0) {
  return ATTACK_STEPS[step].phases[0].ms;
}

// Okno na złapanie kolejnego ciosu w łańcuchu. Otwiera się z chwilą wejścia
// w fazę powrotu — dzięki temu kolejne uderzenie **przerywa** poprzednie zamiast
// czekać na koniec animacji. Bez tego łańcuch jest tylko listą, a nie rytmem.
export const COMBO_WINDOW_MS = 420;

// Przerwa po **całym** łańcuchu, nie po każdym ciosie. Krótkie ciosy mają się
// łączyć bez oporu; płaci się dopiero po rąbnięciu z góry.
export const ATTACK_COOLDOWN_MS = 260;

// Zasięg i szerokość cięcia.
//
// Cios jest **łukiem**, nie pchnięciem: trafia wszystko w stożku o tej szerokości,
// w tym zasięgu od środka postaci. Pierwsza wersja sprawdzała wąski prostokąt
// 22×20 px i trafienie było loterią — stojąc obok celu można było nie trafić,
// mimo że animacja pokazywała szeroki zamach.
//
// Te dwie liczby **muszą zgadzać się z rysunkiem smugi** (`SLASH` w
// `tools/art/goblins.js`). Gracz celuje tym, co widzi; jeśli smuga pokazuje inny
// obszar niż ten sprawdzany tutaj, bicie zamienia się w zgadywanie.
// Wartości domyślne; każdy cios łańcucha może je nadpisać (`range`, `arc`).
// Włócznia sięga dalej niż miecz, ale węższym stożkiem — mocne pchnięcie sięga
// najdalej i to jest jego cała przewaga.
export const ATTACK_RANGE = 40;
export const ATTACK_ARC_DEG = 80;

// Obrażenia opisane są przy każdym ciosie łańcucha (`ATTACK_STEPS`). Trzymane
// tutaj, a nie po stronie serwera, bo klient przewiduje trafienie u siebie
// i musi pokazać **tę samą** liczbę, którą zaraz odejmie serwer. Rozjazd byłby
// widoczny wprost: liczba nad głową nie zgadzałaby się ze spadkiem paska życia.
const ATTACK_ARC_COS = Math.cos((ATTACK_ARC_DEG / 2) * (Math.PI / 180));

/**
 * Czy punkt jest w łuku ciosu. Liczone kątem, nie prostokątem — dzięki temu cios
 * obejmuje cel również wtedy, gdy stoi na skos, a nie idealnie na osi.
 *
 * `body` musi mieć ustawione `atkDx`/`atkDy`, czyli być w trakcie ciosu.
 */
export function inAttackArc(body, dx, dy, radius = 0, { minArc = 0, bonusRange = 0 } = {}) {
  // Zasięg bierzemy z **tego ciosu, który właśnie sięgnął**, a nie z bieżącego
  // stanu: rozliczenie trafienia dzieje się tik po zaznaczeniu cięcia, więc
  // postać może już być w kolejnym ogniwie łańcucha.
  const step = ATTACK_STEPS[body.atkStrikeStep ?? attackStep(body)] ?? ATTACK_STEPS[0];
  // Zasięg z broni, którą trzyma bijący. Domyślnie pięści — **stan startowy jest
  // stanem najgorszym**, więc brak informacji o broni ma znaczyć „gołe ręce",
  // a nie „włócznia".
  const range = (step.range ?? ATTACK_RANGE) * weaponOf(body.weapon).range + bonusRange;
  // `minArc` rozszerza stożek, ale nigdy go nie zwęża. Używane przy celach,
  // które nie uciekają i nie oddają — patrz `NODE_ARC` w `world/nodes.js`.
  const arcDeg = Math.max(step.arc ?? ATTACK_ARC_DEG, minArc);
  const arcCos = Math.cos((arcDeg / 2) * (Math.PI / 180));

  const distance = Math.hypot(dx, dy);

  // `radius` to promień celu. Bez niego trafienie liczyło się do **środka** celu,
  // a ślad na ekranie dotykał jego **krawędzi** — przy kukle szerokiej na dwadzieścia
  // pikseli robiło to dziesięć pikseli różnicy i wyglądało jak cios przechodzący
  // przez cel bez skutku.
  if (distance - radius > range) return false;
  if (distance < 0.001) return true;
  const towards = (dx * body.atkDx + dy * body.atkDy) / distance;
  return towards >= arcCos;
}

/** Który cios łańcucha jest właśnie wyprowadzany. */
export function attackStep(body) {
  return Math.min(LAST_STEP, Math.max(0, body.atkStep ?? 0));
}

/** Ile milisekund ciosu już minęło. Poza ciosem: `null`. */
export function attackElapsed(body) {
  const left = body.atk ?? 0;
  return left > 0 ? attackMs(attackStep(body)) - left : null;
}

function phaseAt(elapsed, step) {
  const phases = ATTACK_STEPS[step].phases;
  let edge = 0;
  for (const phase of phases) {
    edge += phase.ms;
    if (elapsed < edge) return phase;
  }
  return phases[phases.length - 1];
}

/** Nazwa fazy ciosu albo `null`, gdy postać nie uderza. */
export function attackPhase(body) {
  const elapsed = attackElapsed(body);
  if (elapsed === null) return null;
  return phaseAt(elapsed, attackStep(body)).name;
}

/**
 * Kierunki ciosu. Pięć nazw, bo lewa strona powstaje z odbicia lustrzanego —
 * w grze daje to osiem kierunków.
 */
export const AIMS = ['up', 'upside', 'side', 'downside', 'down'];

/**
 * Sylwetka ciała dla danego kierunku ciosu.
 *
 * Ukos używa **boku**, a nie własnej sylwetki, i to jest cała sztuczka z ukosami:
 * postać jest wypisana ręcznie, wiersz po wierszu, więc osiem kompletów ciała
 * oznaczałoby osiem kompletów przy każdym przyszłym elemencie ekwipunku. Włócznia
 * jest za to trzema liczbami, więc jej obrót jest darmowy.
 */
const AIM_BODY = { up: 'up', upside: 'side', side: 'side', downside: 'side', down: 'down' };

// Ósemki kąta, poczynając od „w prawo" i idąc zgodnie z ruchem wskazówek zegara
// (dodatni kąt to w dół, jak na ekranie).
const OCTANTS = [
  { aim: 'side', flip: false },
  { aim: 'downside', flip: false },
  { aim: 'down', flip: false },
  { aim: 'downside', flip: true },
  { aim: 'side', flip: true },
  { aim: 'upside', flip: true },
  { aim: 'up', flip: false },
  { aim: 'upside', flip: false },
];

/**
 * Kąt celowania → nazwa kierunku, sylwetka ciała i odbicie.
 *
 * Rysunek przyskakuje do najbliższej ósemki, ale **trafienie liczy się pod
 * dokładnym kątem** — `atkDx`/`atkDy` biorą się prosto z kursora. Dzięki temu
 * celowanie jest płynne, a klatek jest tyle, ile trzeba.
 */
export function aimPose(angle) {
  const index = (((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8);
  const octant = OCTANTS[index];
  return { aim: octant.aim, facing: AIM_BODY[octant.aim], flip: octant.flip };
}

/**
 * Kierunek ciosu, zamrażany w chwili zamachu.
 *
 * Bierzemy go **z kursora**, nie z klawiszy ruchu. To ta jedna zmiana odkleja
 * kierunek patrzenia od kierunku biegu i dopiero dzięki niej da się biec w lewo
 * i uderzać w prawo.
 *
 * Bez zamrożenia gracz mógłby obracać cios w trakcie zamachu i uderzać za siebie,
 * a wyglądałoby to jak błąd wyświetlania.
 */
function aimOf(body) {
  const angle = body.aim ?? Math.PI / 2;
  const pose = aimPose(angle);
  return {
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    aim: pose.aim,
    facing: pose.facing,
    flip: pose.flip,
  };
}

/**
 * Kierunek odskoku. Bierze się z **klawiszy ruchu**, a nie z kursora.
 *
 * To celowa różnica względem ciosu: uderza się tam, gdzie się patrzy, a ucieka
 * tam, gdzie się idzie. Odskok w stronę kursora znaczyłby, że jedyny sposób na
 * wycofanie się to odwrócenie wzroku od przeciwnika — czyli dokładnie to, czego
 * celowanie myszką miało nie wymagać.
 *
 * Gdy nikt nie trzyma kierunku, odskakujemy **w tył**, czyli przeciwnie do
 * kursora. Stojąc twarzą do wroga i naciskając unik, chce się odejść od niego.
 */
function dodgeAimOf(keys, body) {
  let dx = 0;
  let dy = 0;
  if (keys & KEY_LEFT) dx -= 1;
  if (keys & KEY_RIGHT) dx += 1;
  if (keys & KEY_UP) dy -= 1;
  if (keys & KEY_DOWN) dy += 1;

  if (dx === 0 && dy === 0) {
    const angle = body.aim ?? Math.PI / 2;
    return { dx: -Math.cos(angle), dy: -Math.sin(angle) };
  }

  const length = Math.hypot(dx, dy);
  return { dx: dx / length, dy: dy / length };
}

/** Zapora żywego celu, w której stoją stopy — albo `null`. */
function insideCreature(world, body) {
  return creatureAt(
    world,
    body.x - FOOT_HALF_W, body.y - FOOT_H,
    body.x + FOOT_HALF_W, body.y - 0.5
  );
}

// Jak szybko postać wypycha się z przeciwnika, w pikselach na sekundę. Dość, żeby
// wyjść w ćwierć sekundy, i za mało, żeby wyglądało to jak odrzucenie — wypchnięcie
// ma być niezauważalne, bo gracz i tak zwykle w tej chwili sam ucieka.
const PUSH_OUT_SPEED = 70;

/**
 * Wypycha postać stojącą w zaporze przeciwnika najkrótszą drogą na zewnątrz.
 *
 * Potrzebne, bo samo przepuszczanie ruchu nie wystarcza: gracz, który odskoczył
 * w środek celu i **puścił klawisze**, zostałby w nim na zawsze. Wypychanie działa
 * także wtedy, gdy nikt nic nie wciska.
 *
 * Kierunek liczony jest z najkrótszego wyjścia, a nie z kierunku odskoku — dzięki
 * temu z rogu zapory wychodzi się w bok, a nie po skosie przez całą jej długość.
 * Ściany dalej obowiązują: gdy najkrótsze wyjście prowadzi w mur, próbujemy dalej.
 */
function pushOut(world, body, dt) {
  const box = insideCreature(world, body);
  if (!box) return;

  const x0 = body.x - FOOT_HALF_W;
  const x1 = body.x + FOOT_HALF_W;
  const y0 = body.y - FOOT_H;
  const y1 = body.y - 0.5;

  const ways = [
    { dx: -1, dy: 0, gap: x1 - box.x0 },
    { dx: 1, dy: 0, gap: box.x1 - x0 },
    { dx: 0, dy: -1, gap: y1 - box.y0 },
    { dx: 0, dy: 1, gap: box.y1 - y0 },
  ].sort((a, b) => a.gap - b.gap);

  const step = PUSH_OUT_SPEED * dt;
  for (const way of ways) {
    const nx = body.x + way.dx * step;
    const ny = body.y + way.dy * step;
    // `true`, czyli duchem: wypychamy się **z** przeciwnika, więc jego własna
    // zapora nie może nas przy tym zatrzymać. Ściany i sprzęt owszem.
    if (!isWalkable(world, nx - FOOT_HALF_W, ny - FOOT_H, nx + FOOT_HALF_W, ny - 0.5, true)) continue;
    body.x = nx;
    body.y = ny;
    return;
  }
}

/** Ruch osobno w poziomie i pionie — dzięki temu postać ślizga się po ścianach. */
function slide(world, body, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const nx = body.x + dx;
  const ny = body.y + dy;
  // W odskoku przelatujemy przez przeciwników. To jest decyzja o walce, nie
  // o fizyce: bez tego jedyne, co można zrobić z wrogiem stojącym w przejściu,
  // to go obejść, a odskok ma być wyjściem z zwarcia — także **przez** niego,
  // na drugą stronę. Ściany i sprzęt zostają twarde.
  //
  // Drugi przypadek jest ważniejszy: kto **już stoi** w zaporze przeciwnika, ten
  // ma się ruszać swobodnie. Inaczej odskok w sam środek celu kończy się tym, że
  // kolizja wraca, każdy kierunek jest zablokowany i postać utyka na dobre.
  const ghost = body.dodge > 0 || insideCreature(world, body);
  const fits = isWalkable(
    world,
    nx - FOOT_HALF_W, ny - FOOT_H,
    nx + FOOT_HALF_W, ny - 0.5,
    ghost
  );
  if (fits) {
    body.x = nx;
    body.y = ny;
  } else if (dx !== 0) {
    body.vx = 0;
  } else {
    body.vy = 0;
  }
}

/**
 * Posuwa ciało o jeden krok czasu. `body` to `{x, y, vx, vy}` — modyfikowany
 * w miejscu. `keys` to maska bitowa, `dt` w sekundach.
 */
export function advance(world, body, keys, dt, aim = null) {
  // Kąt celowania zapamiętujemy w ciele, tak samo jak pozycję. Dzięki temu serwer
  // odtwarza cios dokładnie tak samo jak klient, a przy korekcie nie trzeba go
  // rekonstruować z niczego.
  if (aim !== null && Number.isFinite(aim)) body.aim = aim;

  // Cios odlicza się pierwszy, bo od jego fazy zależy, jak szybko wolno się ruszać.
  const atkBefore = body.atk ?? 0;
  if (body.atk > 0) body.atk = Math.max(0, body.atk - dt * 1000);
  if (body.atkWait > 0) body.atkWait = Math.max(0, body.atkWait - dt * 1000);

  // Chwila, w której ostrze naprawdę sięga — zaznaczana **wewnątrz kroku fizyki**.
  //
  // To nie jest ozdoba. Faza cięcia trwa 60 ms, a serwer tyka co 50 ms i na jeden
  // tik przypada kilka kroków. Sprawdzanie fazy raz na tik gubiło całe uderzenia:
  // po nadrobieniu zaległości serwer przeskakiwał fazę cięcia w locie i cios
  // wychodził bez trafienia. Objawiało się to jako „ciężko trafić", bez żadnej
  // regularności — i nie dało się tego zobaczyć w geometrii zasięgu, bo geometria
  // była w porządku.
  const currentStep = attackStep(body);
  const totalMs = attackMs(currentStep);

  if (atkBefore > 0) {
    const edge = strikeFrom(currentStep);
    if (totalMs - atkBefore < edge && totalMs - body.atk >= edge) {
      body.atkStrike = (body.atkStrike ?? 0) + 1;
      // Który cios łańcucha trafił — po tym serwer wie, ile odjąć i jak mocno
      // odrzucić. Bez tego rąbnięcie z góry zadawałoby tyle, co lekkie cięcie.
      body.atkStrikeStep = currentStep;
    }
  }

  if (body.comboUntil > 0) body.comboUntil = Math.max(0, body.comboUntil - dt * 1000);

  const phaseNow = body.atk > 0 ? phaseAt(totalMs - body.atk, currentStep) : null;
  const inRecover = phaseNow?.name === 'recover';

  // Okno łańcucha jest otwarte przez całą fazę powrotu i jeszcze chwilę po niej.
  // Odświeżamy je co krok, więc po zakończeniu ciosu zaczyna odliczać od pełnej
  // wartości.
  if (inRecover && currentStep < LAST_STEP) body.comboUntil = COMBO_WINDOW_MS;

  const chaining = (body.comboUntil > 0) && currentStep < LAST_STEP && (body.atkSeq ?? 0) > 0;

  // Kolejny cios w łańcuchu **przerywa** fazę powrotu poprzedniego — na tym polega
  // rytm. Cios rozpoczynający łańcuch wymaga zakończenia poprzedniego i przerwy.
  const canAttack = !(body.dodge > 0)
    && (chaining ? (!(body.atk > 0) || inRecover) : (!(body.atk > 0) && !(body.atkWait > 0)));

  if (canAttack && (keys & KEY_ATTACK)) {
    body.atkStep = chaining ? currentStep + 1 : 0;
    const step = body.atkStep;
    body.atk = attackMs(step);
    body.comboUntil = 0;
    // Przerwa dopiero po **całym** łańcuchu. Krótkie ciosy mają się łączyć bez
    // oporu; płaci się za rąbnięcie z góry.
    body.atkWait = step === LAST_STEP ? body.atk + ATTACK_COOLDOWN_MS : 0;

    const aimed = aimOf(body);
    body.atkDx = aimed.dx;
    body.atkDy = aimed.dy;
    body.atkFacing = aimed.facing;
    body.atkFlip = aimed.flip;
    body.atkAim = aimed.aim;
    // Znacznik ciosu — rośnie z każdym uderzeniem. Po nim odbiorca migawki poznaje,
    // że padł **nowy** cios, a nie że trwa poprzedni. Sam czas ciosu do tego nie
    // wystarczy: przy dwóch ciosach pod rząd migawki mogłyby go nie złapać.
    body.atkSeq = (body.atkSeq ?? 0) + 1;
  }

  const phase = body.atk > 0 ? phaseAt(attackMs(attackStep(body)) - body.atk, attackStep(body)) : null;

  // --- Odskok ---
  if (body.dodge > 0) body.dodge = Math.max(0, body.dodge - dt * 1000);
  if (body.dodgeWait > 0) body.dodgeWait = Math.max(0, body.dodgeWait - dt * 1000);

  // Ładowanie leci zawsze, także w trakcie skoku i w trakcie ciosu — przerwa
  // między skokami wynika z `dodgeWait`, a nie z zatrzymanego ładowania.
  if (body.dodgeFuel === undefined) body.dodgeFuel = DODGE_CHARGES;
  body.dodgeFuel = Math.min(
    DODGE_CHARGES,
    body.dodgeFuel + (dt * 1000) / DODGE_RECHARGE_MS
  );

  // Wolno go zrobić także w ostatniej fazie ciosu — wtedy odskok **przerywa**
  // dochodzenie do siebie i można wycofać się natychmiast po uderzeniu.
  const canDodge = !(body.dodge > 0)
    && !(body.dodgeWait > 0)
    && body.dodgeFuel >= 1
    && (!phase || phase.name === 'recover');

  if (canDodge && (keys & KEY_DODGE)) {
    const escape = dodgeAimOf(keys, body);
    body.dodgeFuel -= 1;
    body.dodge = DODGE_MS;
    body.dodgeWait = DODGE_MS + DODGE_GAP_MS;
    body.dodgeDx = escape.dx;
    body.dodgeDy = escape.dy;
    body.dodgeSeq = (body.dodgeSeq ?? 0) + 1;
    // Odskok przerywa cios. Inaczej postać kończyłaby zamach w locie.
    body.atk = 0;
  }

  let ax = 0;
  let ay = 0;
  if (keys & KEY_LEFT) ax -= 1;
  if (keys & KEY_RIGHT) ax += 1;
  if (keys & KEY_UP) ay -= 1;
  if (keys & KEY_DOWN) ay += 1;

  const length = Math.hypot(ax, ay);
  if (length > 0) { ax /= length; ay /= length; }

  if (body.dodge > 0) {
    // Prędkość opada w trakcie odskoku: mocne wybicie na starcie, wytracanie
    // pod koniec. Równa prędkość przez cały czas czyta się jak ślizg po lodzie.
    const left = body.dodge / DODGE_MS;
    const speed = DODGE_SPEED * (0.35 + 0.65 * left);
    body.vx = body.dodgeDx * speed;
    body.vy = body.dodgeDy * speed;
  } else if (phase?.name === 'strike') {
    // W chwili uderzenia prędkość narzuca wypad, a nie klawisze. To ten wypad
    // sprawia, że w cios wygląda jak włożony ciężar — bez niego postać stoi jak
    // słup i maha ręką. Rąbnięcie z góry wypada najdalej.
    // Wypad też zależy od broni. Pchnięcie włócznią rzuca całym ciałem do przodu;
    // przy pięści taki sam wyrzut czyta się jak szarża, a nie jak cios.
    const lunge = ATTACK_STEPS[attackStep(body)].lunge * weaponOf(body.weapon).lunge;
    body.vx = body.atkDx * lunge;
    body.vy = body.atkDy * lunge;
  } else {
    const speed = ((keys & KEY_RUN) ? RUN_SPEED : WALK_SPEED) * (phase ? phase.speed : 1);
    const blend = Math.min(1, ACCELERATION * dt);
    body.vx += (ax * speed - body.vx) * blend;
    body.vy += (ay * speed - body.vy) * blend;
  }

  slide(world, body, body.vx * dt, 0);
  slide(world, body, 0, body.vy * dt);

  // Po ruchu, nie przed: wypychamy z tego, w czym postać naprawdę stoi. W trakcie
  // odskoku nie wypychamy — skok ma dolecieć tam, gdzie celował, a nie zostać
  // zepchnięty w połowie drogi przez cel, przez który właśnie przelatuje.
  if (!(body.dodge > 0)) pushOut(world, body, dt);

  // Kierunek patrzenia bierze się **wyłącznie z kursora**, nie z ruchu. To jest
  // sedno sterowania myszką: postać patrzy tam, gdzie celujesz, więc można biec
  // w lewo i uderzać w prawo. Podczas ciosu kierunek jest zamrożony — obrót
  // w połowie zamachu czyta się jak błąd i odbiera uderzeniu wagę.
  if (body.atk > 0) {
    body.facing = body.atkFacing;
    body.flip = body.atkFlip;
    body.aimName = body.atkAim;
  } else {
    const look = aimOf(body);
    body.facing = look.facing;
    body.flip = look.flip;
    body.aimName = look.aim;
  }
}

/**
 * Kierunek i to, czy postać się rusza — liczone z prędkości, więc klient
 * i serwer dochodzą do tej samej animacji bez wysyłania jej po sieci.
 */
export function poseOf(body, previousFacing = 'down') {
  const attacking = (body.atk ?? 0) > 0;
  const moving = Math.hypot(body.vx, body.vy) > 6;

  // Podczas ciosu kierunek jest zamrożony na tym, w który poszedł zamach.
  if (attacking && body.atkFacing) {
    return {
      moving,
      attacking,
      facing: body.atkFacing,
      flip: Boolean(body.atkFlip),
      aim: body.atkAim ?? body.atkFacing,
    };
  }

  // Poza ciosem kierunek idzie z kursora. Prędkość nie ma tu już nic do rzeczy —
  // wcześniej to ona decydowała i dlatego nie dało się biec w jedną stronę,
  // a patrzeć w drugą.
  const look = aimOf(body);
  return {
    moving,
    attacking,
    facing: look.facing ?? previousFacing,
    flip: look.flip,
    aim: look.aim,
  };
}

