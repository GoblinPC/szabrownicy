// Fizyka ruchu postaci — jedyna kopia w projekcie.
//
// Ten plik importuje zarówno klient (do przewidywania własnego ruchu), jak
// i serwer (do liczenia stanu prawdziwego). Gdyby istniały dwie kopie, zaczęłyby
// się rozjeżdżać i gracz widziałby, jak jego postać "cofa się" po każdej korekcie.
// Dlatego kod jest czystym JS-em bez Phasera i bez niczego z przeglądarki.

import { isWalkable } from './forge.js';

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
// 3. **Ma przerwę.** Bez niej gracz skacze bez końca i nic go nie kosztuje.
export const DODGE_MS = 200;
export const DODGE_COOLDOWN_MS = 520;
const DODGE_SPEED = 250;

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
export function inAttackArc(body, dx, dy, radius = 0) {
  // Zasięg bierzemy z **tego ciosu, który właśnie sięgnął**, a nie z bieżącego
  // stanu: rozliczenie trafienia dzieje się tik po zaznaczeniu cięcia, więc
  // postać może już być w kolejnym ogniwie łańcucha.
  const step = ATTACK_STEPS[body.atkStrikeStep ?? attackStep(body)] ?? ATTACK_STEPS[0];
  const range = step.range ?? ATTACK_RANGE;
  const arcCos = step.arc ? Math.cos((step.arc / 2) * (Math.PI / 180)) : ATTACK_ARC_COS;

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
 * Kierunek ciosu, zamrażany w chwili zamachu.
 *
 * Bierzemy go z wciśniętych klawiszy, a gdy postać stoi — z ostatniego kierunku,
 * w którym patrzyła. Bez zamrożenia gracz mógłby obracać cios w trakcie zamachu
 * i uderzać za siebie, a wyglądałoby to jak błąd wyświetlania.
 */
function aimOf(keys, body) {
  let dx = 0;
  let dy = 0;
  if (keys & KEY_LEFT) dx -= 1;
  if (keys & KEY_RIGHT) dx += 1;
  if (keys & KEY_UP) dy -= 1;
  if (keys & KEY_DOWN) dy += 1;

  if (dx === 0 && dy === 0) {
    // Postać stoi — celujemy tam, gdzie patrzy.
    const facing = body.facing ?? 'down';
    if (facing === 'side') dx = body.flip ? -1 : 1;
    else if (facing === 'up') dy = -1;
    else dy = 1;
  }

  const length = Math.hypot(dx, dy);
  dx /= length;
  dy /= length;

  const facing = Math.abs(dx) > Math.abs(dy) ? 'side' : (dy < 0 ? 'up' : 'down');
  return { dx, dy, facing, flip: dx < 0 };
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
  const fits = isWalkable(
    world,
    nx - FOOT_HALF_W, ny - FOOT_H,
    nx + FOOT_HALF_W, ny - 0.5,
    body.dodge > 0
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
export function advance(world, body, keys, dt) {
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

    const aim = aimOf(keys, body);
    body.atkDx = aim.dx;
    body.atkDy = aim.dy;
    body.atkFacing = aim.facing;
    body.atkFlip = aim.flip;
    // Znacznik ciosu — rośnie z każdym uderzeniem. Po nim odbiorca migawki poznaje,
    // że padł **nowy** cios, a nie że trwa poprzedni. Sam czas ciosu do tego nie
    // wystarczy: przy dwóch ciosach pod rząd migawki mogłyby go nie złapać.
    body.atkSeq = (body.atkSeq ?? 0) + 1;
  }

  const phase = body.atk > 0 ? phaseAt(attackMs(attackStep(body)) - body.atk, attackStep(body)) : null;

  // --- Odskok ---
  if (body.dodge > 0) body.dodge = Math.max(0, body.dodge - dt * 1000);
  if (body.dodgeWait > 0) body.dodgeWait = Math.max(0, body.dodgeWait - dt * 1000);

  // Wolno go zrobić także w ostatniej fazie ciosu — wtedy odskok **przerywa**
  // dochodzenie do siebie i można wycofać się natychmiast po uderzeniu.
  const canDodge = !(body.dodge > 0)
    && !(body.dodgeWait > 0)
    && (!phase || phase.name === 'recover');

  if (canDodge && (keys & KEY_DODGE)) {
    const aim = aimOf(keys, body);
    body.dodge = DODGE_MS;
    body.dodgeWait = DODGE_MS + DODGE_COOLDOWN_MS;
    body.dodgeDx = aim.dx;
    body.dodgeDy = aim.dy;
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
    const lunge = ATTACK_STEPS[attackStep(body)].lunge;
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

  // Kierunek patrzenia trzymamy w ciele, bo cios musi z czegoś wziąć cel, gdy
  // postać stoi. Podczas ciosu jest zamrożony.
  if (body.atk > 0) {
    body.facing = body.atkFacing;
    body.flip = body.atkFlip;
  } else if (body.dodge > 0) {
    // W odskoku kierunek patrzenia zostaje. Odskakując w tył przed przeciwnikiem
    // trzeba go dalej mieć na oku — obracanie się plecami czytałoby się jak ucieczka.
  } else if (Math.hypot(body.vx, body.vy) > 6) {
    body.facing = Math.abs(body.vx) > Math.abs(body.vy) + 4
      ? 'side'
      : (body.vy < 0 ? 'up' : 'down');
    if (body.facing === 'side') body.flip = body.vx < 0;
  }
}

/**
 * Kierunek i to, czy postać się rusza — liczone z prędkości, więc klient
 * i serwer dochodzą do tej samej animacji bez wysyłania jej po sieci.
 */
export function poseOf(body, previousFacing = 'down') {
  const attacking = (body.atk ?? 0) > 0;
  const moving = Math.hypot(body.vx, body.vy) > 6;

  // Podczas ciosu kierunek jest zamrożony na tym, w który poszedł zamach. Obrót
  // w połowie zamachu czyta się jak błąd i odbiera uderzeniu wagę.
  if (attacking && body.atkFacing) {
    return { moving, attacking, facing: body.atkFacing, flip: Boolean(body.atkFlip) };
  }

  let facing = previousFacing;
  // Odbicie sprite'a bierzemy z **zapamiętanego** kierunku, nie z prędkości.
  //
  // Liczone z `vx < 0` psuło się za każdym razem, gdy postać stanęła: prędkość
  // spada do zera, warunek przestaje być prawdziwy i postać sama odwracała się
  // w prawo. Widać to było najwyraźniej po ciosie wyprowadzonym w lewo — zamach
  // kończył się, postać stawała i natychmiast obracała się w drugą stronę.
  let flip = body.flip ?? (body.vx < 0);

  if (moving) {
    if (Math.abs(body.vx) > Math.abs(body.vy) + 4) facing = 'side';
    else facing = body.vy < 0 ? 'up' : 'down';
    if (facing === 'side') flip = body.vx < 0;
  }
  return { moving, attacking, facing, flip };
}

