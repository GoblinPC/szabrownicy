// Postacie graczy: 16x24, sześć wariantów, trzy rysowane kierunki.
//
// Bok rysujemy raz i odbijamy lustrzanie w grze, więc kierunków w atlasie jest
// trzy, a nie cztery. Cała postać składa się z części (głowa, tułów, ręce, nogi)
// ustawianych według pozy — dzięki temu szósty wariant kosztuje kilka linii
// opisu kolorów, a nie osobny rysunek każdej klatki.
//
// Pionowy układ sprite'a:
//   0-5    zapas na nakrycie głowy (grzebień hełmu sięga 4 piksele nad czaszkę,
//          a podskok w biegu podnosi ją o kolejny — stąd aż sześć wierszy luzu)
//   6-14   głowa
//   15-21  tułów, pas w wierszu 19
//   21-24  nogi
//   25-26  buty
//
// Nogi celowo nie reagują na `bodyY`: tułów i głowa kołyszą się przy oddechu
// i biegu, ale stopy zostają na ziemi, tak jak powinny.

import { Canvas } from './canvas.js';
import { c } from './palette.js';

const W = 16;
const H = 27;
const OUTLINE = c('soot', 0);

// Margines na obrys. Sylwetka jest składana dalej na 16×27 — wszystkie
// współrzędne części ciała zostają bez zmian — i dopiero potem przenoszona na
// płótno większe o ten margines, na którym obrys ma się gdzie zmieścić.
// Na dole marginesu nie ma: tam stoją stopy.
const BODY_PAD_X = 2;
const BODY_PAD_T = 1;
const BODY_W = W + BODY_PAD_X * 2;
const BODY_H = H + BODY_PAD_T;

// Klatki ataku są szersze, bo ostrze wychodzi daleko poza sylwetkę. Ciało
// składamy dalej na 16 pikselach — cały kod części ciała zostaje bez zmian —
// i przenosimy je na szersze płótno, wyśrodkowane. Zaczepienie sprite'a w grze
// to (0.5, 1), więc stopy zostają na miejscu niezależnie od szerokości klatki.
// Szerokie, bo włócznia przy mocnym pchnięciu wychodzi daleko poza sylwetkę.
//
// Liczba wzięta z rachunku, nie z oka: najdalsza garść to `hand.x = 14`, zasięg
// mocnego pchnięcia 21, a grot rysuje się jeszcze 3 piksele za końcem drzewca.
// Trzeba więc `ATTACK_OX + 14 + 21 < ATTACK_W`. Przy 48 grot był ucinany o cztery
// piksele — widać to było dopiero na wypisie sylwetki, nie na arkuszu.
const ATTACK_W = 60;
const ATTACK_OX = Math.floor((ATTACK_W - W) / 2);

/** [ciemny, średni, jasny] — każda część ciała używa tej trójki. */
const shades = (ramp, [a, b, d]) => [c(ramp, a), c(ramp, b), c(ramp, d)];

// Na razie jedna postać. Próba zrobienia ludzkich sylwetek pokazała, że goblin
// jest jedyną, która naprawdę wyszła — reszta wyglądała jak prostokąty sklejone
// razem. Wybór wyglądu wróci, gdy będzie po co: przy ekwipunku, który widać
// na postaci. Do tego czasu nie ma sensu utrzymywać sześciu wariantów.
export const VARIANTS = [
  {
    id: 0, name: 'Szabrownik',
    skin: shades('goblin', [1, 2, 3]),
    cloth: shades('wood', [1, 2, 3]),
    belt: c('copper'), boot: c('wood', 1),
    head: 'none', beard: false,
  },
];

// --- Pozy ---------------------------------------------------------------------

/**
 * Cztery klatki ciosu: **zamach → uderzenie → wyprowadzenie → powrót**.
 *
 * Zamach jest tu najważniejszy i dlatego odchyla całą postać do tyłu (`lean`
 * ujemny): gracz musi widzieć, że cios zaraz padnie, zanim padnie. Bez tej jednej
 * klatki uderzenie pojawia się z niczego i nie ma w nim żadnej wagi.
 *
 * Kolejna zasada: klatka uderzenia **wypycha postać do przodu** (`lean` dodatni).
 * To ten wypad, a nie sam miecz, sprawia, że cios wygląda jak włożenie w niego siły.
 *
 * `hand` to punkt garści w układzie 16-pikselowego ciała, `angle` to kąt ostrza
 * w stopniach (0 w prawo, wartości dodatnie w dół — jak na ekranie), `reach` to
 * długość ostrza. Jedna klatka to więc trzy liczby, a nie osobny rysunek.
 */
// Trzy komplety na kierunek, po jednym na każdy cios łańcucha.
//
// Bronią jest **włócznia**, więc wszystkie trzy ciosy to pchnięcia i różni je
// przede wszystkim zasięg oraz wysokość:
//
//   0 — szybkie dźgnięcie, trochę w górę,
//   1 — szybkie dźgnięcie, trochę w dół (stąd widać, że to inny cios, mimo
//       że ruch jest tego samego rodzaju),
//   2 — mocne pchnięcie: drzewce cofnięte przy tułowiu, potem wyrzucone
//       daleko w przód.
//
// To najprostszy do narysowania układ, jaki mogliśmy dostać: włócznia powstaje
// z punktu garści, kąta i długości, więc pchnięcie jest **rosnącą długością przy
// stałym kącie**. Trzy cięcia mieczem wymagałyby trzech osobnych trajektorii.
const ATTACK_POSES = {
  // Wysokość chwytu: **16–19, czyli tułów**. Głowa zajmuje wiersze 6–14, więc
  // dłoń postawiona wyżej sprawiała, że drzewce wychodziło goblinowi z czaszki.
  // Pierwsza wersja miała tu 14–15 i wyglądało to dokładnie tak.
  side: [
    [
      { lean: -2, hand: [6, 17], angle: -12, reach: 8, legA: -1, legB: 1, bodyY: 0 },
      { lean: 3, hand: [12, 16], angle: -9, reach: 15, legA: 3, legB: -2, bodyY: 0 },
      { lean: 2, hand: [11, 16], angle: -7, reach: 14, legA: 2, legB: -1, bodyY: 0 },
      { lean: 0, hand: [9, 17], angle: -2, reach: 10, legA: 0, legB: 0, bodyY: 1 },
    ],
    [
      { lean: -2, hand: [6, 18], angle: 14, reach: 8, legA: 1, legB: -1, bodyY: 1 },
      { lean: 3, hand: [12, 19], angle: 11, reach: 15, legA: 3, legB: -2, bodyY: 0 },
      { lean: 2, hand: [11, 19], angle: 9, reach: 14, legA: 2, legB: -1, bodyY: 0 },
      { lean: 0, hand: [9, 18], angle: 5, reach: 10, legA: 0, legB: 0, bodyY: 1 },
    ],
    [
      { lean: -4, hand: [3, 18], angle: 0, reach: 7, legA: -2, legB: 2, bodyY: 0 },
      { lean: 5, hand: [14, 18], angle: -2, reach: 21, legA: 4, legB: -3, bodyY: 0 },
      { lean: 4, hand: [13, 18], angle: 0, reach: 20, legA: 3, legB: -2, bodyY: 0 },
      { lean: 1, hand: [10, 18], angle: 5, reach: 12, legA: 1, legB: 0, bodyY: 1 },
    ],
  ],
  // Widok z przodu: pchnięcie idzie w stronę widza, więc drzewce jest mocno
  // skrócone perspektywą. Lekki skos ratuje czytelność — dokładnie w pionie
  // włócznia zasłaniałaby całą postać.
  // Zasięgi są tu **krótsze niż z boku i to jest poprawne**: włócznia wymierzona
  // w stronę kamery jest skrócona perspektywą. Dodatkowo grot musi zmieścić się
  // w wysokości sprite'a (27 wierszy) — przy dłuższych wartościach był ucinany
  // na dolnej krawędzi, co widać było dopiero na wypisie sylwetki.
  down: [
    [
      { lean: -1, hand: [12, 15], angle: 76, reach: 6, legA: 0, legB: 0, bodyY: 0 },
      { lean: 1, hand: [12, 16], angle: 80, reach: 11, legA: 1, legB: 0, bodyY: 1 },
      { lean: 1, hand: [12, 16], angle: 80, reach: 10, legA: 1, legB: 0, bodyY: 1 },
      { lean: 0, hand: [11, 15], angle: 74, reach: 8, legA: 0, legB: 0, bodyY: 0 },
    ],
    [
      { lean: 1, hand: [4, 15], angle: 104, reach: 6, legA: 0, legB: 0, bodyY: 0 },
      { lean: -1, hand: [4, 16], angle: 100, reach: 11, legA: 0, legB: 1, bodyY: 1 },
      { lean: -1, hand: [4, 16], angle: 100, reach: 10, legA: 0, legB: 1, bodyY: 1 },
      { lean: 0, hand: [5, 15], angle: 106, reach: 8, legA: 0, legB: 0, bodyY: 0 },
    ],
    [
      { lean: 0, hand: [12, 14], angle: 88, reach: 5, legA: -1, legB: 1, bodyY: 0 },
      { lean: 0, hand: [12, 16], angle: 90, reach: 12, legA: 2, legB: -1, bodyY: 1 },
      { lean: 0, hand: [12, 16], angle: 90, reach: 11, legA: 1, legB: 0, bodyY: 1 },
      { lean: 0, hand: [12, 15], angle: 84, reach: 8, legA: 0, legB: 0, bodyY: 0 },
    ],
  ],
  // Widok z tyłu: włócznia wychodzi w głąb kadru, po lewej stronie sylwetki.
  up: [
    [
      { lean: 1, hand: [4, 18], angle: -104, reach: 7, legA: 0, legB: 0, bodyY: 0 },
      { lean: -1, hand: [4, 17], angle: -100, reach: 13, legA: 0, legB: 1, bodyY: 0 },
      { lean: -1, hand: [4, 17], angle: -100, reach: 12, legA: 0, legB: 1, bodyY: 0 },
      { lean: 0, hand: [5, 18], angle: -106, reach: 9, legA: 0, legB: 0, bodyY: 1 },
    ],
    [
      { lean: -1, hand: [12, 18], angle: -76, reach: 7, legA: 0, legB: 0, bodyY: 0 },
      { lean: 1, hand: [12, 17], angle: -80, reach: 13, legA: 1, legB: 0, bodyY: 0 },
      { lean: 1, hand: [12, 17], angle: -80, reach: 12, legA: 1, legB: 0, bodyY: 0 },
      { lean: 0, hand: [11, 18], angle: -74, reach: 9, legA: 0, legB: 0, bodyY: 1 },
    ],
    [
      { lean: 0, hand: [4, 19], angle: -92, reach: 6, legA: 1, legB: -1, bodyY: 0 },
      // Zasięg 18 wypychał grot ponad górną krawędź klatki. Sprawdzone wypisem
      // sylwetki, nie okiem — na arkuszu ucięty czubek jest niewidoczny.
      { lean: 0, hand: [4, 18], angle: -90, reach: 15, legA: -2, legB: 1, bodyY: 0 },
      { lean: 0, hand: [4, 18], angle: -90, reach: 14, legA: -1, legB: 0, bodyY: 0 },
      { lean: 0, hand: [4, 18], angle: -96, reach: 10, legA: 0, legB: 0, bodyY: 1 },
    ],
  ],
};

/**
 * Ślad cięcia — łuk pokrywający **cały zasięg ciosu**.
 *
 * To najważniejsza rzecz w całej walce, bo gracz celuje tym, co widzi. Smuga
 * musi więc pokrywać dokładnie ten obszar, który serwer sprawdza przy trafieniu:
 * stożek `ATTACK_ARC_DEG` o promieniu `ATTACK_RANGE` z `world/movement.js`.
 *
 * Dwie poprzednie wersje były złe i warto pamiętać dlaczego:
 *
 * 1. łuki wpisane na wyczucie dawały 292 stopnie owinięte wokół głowy;
 * 2. łuki dopasowane do czubka ostrza w kolejnych klatkach były **poprawne, ale
 *    bezużyteczne** — miały promień 16 px przy zasięgu ciosu 34 px i wisiały
 *    z boku postaci. Gracz widział wąską kreskę obok siebie, a trafiał w szeroki
 *    stożek przed sobą. Bicie zamieniało się w zgadywanie.
 *
 * Dlatego smuga jest teraz **osobnym, dużym sprite'em wyśrodkowanym na tułowiu**,
 * a nie ozdobą doklejoną do klatki postaci. Nie jest już ograniczona rozmiarem
 * sylwetki, więc przy ciosie w górę ma gdzie się zmieścić.
 */
const SLASH_W = 96;
const SLASH_C = SLASH_W / 2;

// Kierunek pchnięcia. Bok rysujemy w prawo i odbijamy lustrzanie w grze.
const SLASH_AIM = { side: 0, down: 90, up: -90, downside: 45, upside: -45 };

/**
 * Trzy klatki śladu: `[od, do, grubość u nasady]` w pikselach od środka postaci.
 *
 * Ślad wystrzeliwuje w przód i cofa się, zamiast rozjeżdżać się w bok — bo
 * włócznia dźga, a nie tnie. Wcześniej był tu szeroki łuk, właściwy dla miecza,
 * i po zmianie broni przestałby zgadzać się z tym, co robi postać **i** z tym,
 * co sprawdza serwer przy trafieniu.
 */
const SLASH_SWEEPS = [
  [15, 42, 4],
  [20, 46, 3],
  [30, 48, 2],
];

const SLASH_TONES = [c('bone'), c('parchment'), c('stone', 4)];
export const SLASH_FRAMES = SLASH_SWEEPS.length;

export const ATTACK_STEPS = ATTACK_POSES.side.length;
export const ATTACK_FRAMES = ATTACK_POSES.side[0].length;

/**
 * Kierunki ciosu — **osiem, ale sylwetek ciała dalej cztery**.
 *
 * To jest cała sztuczka z celowaniem myszką: włócznia powstaje z trzech liczb
 * (garść, kąt, zasięg), więc cios na ukos to **inny kąt na tej samej sylwetce**,
 * a nie nowy rysunek postaci. Ciała nie da się tak potraktować — jest wypisane
 * ręcznie, wiersz po wierszu, i osiem kompletów oznaczałoby osiem kompletów przy
 * każdym przyszłym elemencie ekwipunku.
 *
 * Lewa strona powstaje z odbicia lustrzanego, więc pięć wpisów daje osiem
 * kierunków w grze.
 *
 * `reach` to mnożnik zasięgu: w górę i w dół włócznia jest **skrócona
 * perspektywą**, bo celuje w kamerę. O to, żeby grot zmieścił się w klatce, dba
 * już `fitReach()` — tutaj chodzi wyłącznie o to, jak cios ma wyglądać.
 *
 * Ukos w dół jest rysowany **płycej niż 45 stopni** (34, nie 46). Powód jest
 * fizyczny: pod stopami nie ma klatki, więc strome pchnięcie w dół trzeba by
 * skrócić do kikuta. Płytszy kąt daje ten sam czytelny ukos przy pełnej długości
 * drzewca — a trafienie i tak liczy się pod dokładnym kątem kursora, więc gracz
 * nie traci na celności ani piksela.
 */
export const ATTACK_AIMS = [
  { name: 'up', body: 'up', turn: 0, reach: 1 },
  { name: 'upside', body: 'side', turn: -46, reach: 0.9 },
  { name: 'side', body: 'side', turn: 0, reach: 1 },
  { name: 'downside', body: 'side', turn: 34, reach: 0.9 },
  { name: 'down', body: 'down', turn: 0, reach: 1 },
];

/**
 * Poza dla danej klatki. W widoku z przodu i tyłu nogi unoszą się w pionie,
 * z boku przesuwają w przód i w tył — inaczej bieg wyglądałby jak dreptanie.
 */
function pose(kind, frame, dir, step = 0) {
  const side = dir === 'side';

  if (kind === 'attack') {
    const a = ATTACK_POSES[dir][step][frame];
    return {
      bodyY: a.bodyY,
      legA: a.legA,
      legB: a.legB,
      armA: 0,
      armB: 0,
      lift: side ? 0 : 1,
      lean: a.lean,
      hand: a.hand,
      angle: a.angle,
      reach: a.reach,
    };
  }

  if (kind === 'idle') {
    // Ledwie zauważalny oddech: co drugą klatkę tułów opada o piksel.
    const breath = frame === 1 ? 1 : 0;
    return { bodyY: breath, legA: 0, legB: 0, armA: breath, armB: breath, lift: 0, lean: 0 };
  }
  const p = (frame / 6) * Math.PI * 2;
  const swing = (phase) => Math.round(Math.sin(phase) * 2);
  return {
    bodyY: Math.abs(Math.sin(p * 2)) > 0.7 ? -1 : 0, // podskok w połowie kroku
    legA: swing(p),
    legB: swing(p + Math.PI),
    armA: swing(p + Math.PI),
    armB: swing(p),
    lift: side ? 0 : 1,
    lean: 0,
  };
}

// --- Części ciała -------------------------------------------------------------

/** Ramka czaszki. Z profilu jest węższa, bo nos wychodzi poza nią osobno. */
const headBox = (dir, p) => (dir === 'side'
  ? { x: 3 + (p?.lean ?? 0), w: 9 }
  : { x: 3 + (p?.lean ?? 0), w: 10 });

function drawLegs(t, v, dir, p) {
  const [dark, mid] = v.skin;
  const side = dir === 'side';

  const leg = (x, offset) => {
    const dx = side ? offset : 0;
    const dy = side ? 0 : Math.max(0, -offset) * p.lift;
    t.rect(x + dx, 21 - dy, 3, 4, mid);
    t.vline(x + dx, 21 - dy, 24 - dy, dark);

    // Stopa z profilu jest wysunięta **do przodu**, czyli w prawo — profil patrzy
    // w prawo, a w grze odbijamy go lustrzanie przy chodzeniu w lewo.
    //
    // Wcześniej but wystawał w lewo, tak samo jak w widoku z przodu, gdzie jest
    // to poprawne (stopa szeroka po obu stronach nogi). Z profilu dawało to
    // czubek buta skierowany do tyłu i cała postać czytała się jako skręcona:
    // nogi w jedną stronę, głowa w drugą.
    const bootX = side ? x + dx : x + dx - 1;
    t.rect(bootX, 25 - dy, 4, 2, v.boot);
    t.hline(bootX, bootX + 3, 26 - dy, c('soot', 0));
  };

  if (side) {
    leg(7, p.legB); // noga dalsza — rysowana pierwsza, żeby bliższa ją przykryła
    leg(6, p.legA);
  } else {
    leg(5, p.legA);
    leg(9, p.legB);
  }
}

function drawTorso(t, v, dir, p) {
  const [dark, mid, light] = v.cloth;
  const y = 15 + p.bodyY;
  const narrow = dir === 'side';
  // `lean` odchyla górę postaci przy zamachu i wypycha ją przy ciosie. Nogi
  // zostają na miejscu — to one trzymają postać na ziemi.
  const x = (narrow ? 5 : 4) + (p.lean ?? 0);
  const w = narrow ? 7 : 9;

  t.rect(x, y, w, 7, mid);
  t.rect(x, y, w, 1, light);          // światło na barkach
  t.hline(x, x + w - 1, y + 6, dark); // cień pod pasem
  t.rect(x - 1, y + 1, w + 2, 2, mid); // ramiona
  t.hline(x - 1, x + w, y + 1, light);

  t.rect(x, y + 4, w, 1, v.belt);     // pas
  t.px(x + Math.floor(w / 2), y + 4, c('iron', 4)); // klamra

  if (dir === 'up') t.rect(x + 1, y + 2, w - 2, 2, dark); // troki na plecach
}

/** Pojedyncza ręka. Rysowana osobno, bo z boku jedna jest za tułowiem, a druga przed. */
function drawArm(t, v, x, offset, p) {
  const [skinDark, skinMid] = v.skin;
  const [clothDark, clothMid] = v.cloth;
  const y = 16 + p.bodyY + Math.round(offset / 2);
  t.rect(x, y, 2, 3, clothMid);
  t.hline(x, x + 1, y, clothDark);
  t.rect(x, y + 3, 2, 2, skinMid); // dłoń
  t.hline(x, x + 1, y + 4, skinDark);
}

/** Uszy w widoku z przodu i z tyłu — po jednym z każdej strony czaszki. */
function drawFrontEars(t, v, x0, x1, y) {
  const [dark, mid, light] = v.skin;
  const ear = (x, sign) => {
    t.px(x, y + 2, mid);
    t.px(x - sign, y + 1, mid);
    t.px(x - sign, y + 2, light);
    t.px(x - sign * 2, y, mid);
    t.px(x - sign * 2, y + 1, dark);
    t.px(x - sign * 3, y - 1, dark);
  };
  ear(x0, 1);
  ear(x1, -1);
}

/**
 * Obrys czaszki z profilu (postać patrzy w prawo): zaokrąglony tył głowy,
 * pochyłe czoło, wyraźnie wysunięty nos w wierszu 5 i cofnięta broda.
 *
 * To jest sedno poprawki — wcześniej profil używał tej samej symetrycznej
 * czaszki co widok z przodu, więc czytał się jak twarz z jednym okiem.
 */
const PROFILE_SPANS = [
  [5, 9],
  [4, 10],
  [3, 11],
  [3, 11],
  [3, 12],
  [3, 14], // nos
  [3, 12],
  [3, 10],
  [4, 8],  // broda
];

function drawProfileHead(t, v, p) {
  const [dark, mid, light] = v.skin;
  const y = 6 + p.bodyY;
  const lean = p.lean ?? 0;
  const px = (x, yy, col) => t.px(x + lean, yy, col);

  // Ucho siedzi przy tyle czaszki i odchyla się w tył — z profilu nigdy z boku twarzy.
  px(1, y + 2, mid); px(2, y + 2, light);
  px(0, y + 3, dark); px(1, y + 3, mid); px(2, y + 3, light);
  px(2, y + 4, mid);

  PROFILE_SPANS.forEach(([a, b], row) => {
    for (let x = a; x <= b; x++) {
      let col = mid;
      if (row <= 1) col = light;                                   // ciemię
      else if (row >= 7) col = dark;                               // żuchwa
      else if (row === 5 && x >= 12) col = x >= 14 ? mid : light;  // grzbiet nosa
      else if (row === 6 && x >= 11) col = dark;                   // spód nosa
      else if (x <= 5 && row <= 3) col = light;                    // czoło
      px(x, y + row, col);
    }
  });

  if (v.beard) {
    t.rect(4 + lean, y + 7, 7, 2, c('stone', 2));
    t.hline(4 + lean, 9 + lean, y + 8, c('stone', 1));
    px(3, y + 8, c('stone', 1));
  }

  t.hline(8 + lean, 11 + lean, y + 3, dark);      // brew
  t.rect(9 + lean, y + 4, 2, 2, c('ember', 2));   // świecące oko za nasadą nosa
  px(10, y + 4, c('ember', 4));
  px(12, y + 6, c('soot', 0));                    // nozdrze
  t.hline(8 + lean, 10 + lean, y + 7, c('soot', 1)); // usta
  px(10, y + 7, c('bone'));                       // kieł wystający do przodu
}

function drawHead(t, v, dir, p) {
  if (dir === 'side') return drawProfileHead(t, v, p);

  const [dark, mid, light] = v.skin;
  const y = 6 + p.bodyY;
  const { x, w } = headBox(dir, p);

  drawFrontEars(t, v, x, x + w - 1, y + 3);

  // Czaszka: ścięte narożniki dają wrażenie zaokrąglenia bez antyaliasingu.
  t.rect(x, y, w, 9, mid);
  t.hline(x + 1, x + w - 2, y, light);
  t.rect(x + 1, y + 1, w - 2, 2, light);
  t.px(x, y, null); t.px(x + w - 1, y, null);
  t.px(x, y + 8, null); t.px(x + w - 1, y + 8, null);
  t.hline(x + 1, x + w - 2, y + 8, dark);

  if (dir === 'up') {
    // Tył głowy — bez twarzy, tylko cieniowanie i kark.
    t.rect(x + 1, y + 4, w - 2, 4, mid);
    t.hline(x + 2, x + w - 3, y + 7, dark);
    return;
  }

  t.hline(x + 1, x + 4, y + 4, dark);      // brwi
  t.hline(x + 5, x + 8, y + 4, dark);
  // **Oczy świecą na pomarańczowo**, a nie są białe z czarną źrenicą.
  //
  // Wzięte z odniesienia podesłanego przez użytkownika i jest to najtańsza
  // zmiana o największym efekcie w całej sylwetce: dwa piksele żaru zamieniają
  // ludzką twarz w goblina. Przy szesnastopikselowej postaci oczy to i tak
  // jedyny szczegół twarzy, który da się przeczytać z odległości gry.
  t.rect(x + 1, y + 5, 2, 2, c('ember', 2));
  t.rect(x + 7, y + 5, 2, 2, c('ember', 2));
  t.px(x + 2, y + 5, c('ember', 4));
  t.px(x + 7, y + 5, c('ember', 4));
  t.rect(x + 4, y + 5, 2, 3, dark);        // nos
  t.px(x + 4, y + 6, mid);
  t.hline(x + 3, x + 6, y + 8, c('soot', 1)); // usta
  t.px(x + 3, y + 8, c('bone'));           // kieł
  if (v.beard) {
    t.rect(x + 1, y + 8, 8, 2, c('stone', 2));
    t.hline(x + 2, x + 7, y + 9, c('stone', 1));
    t.px(x + 1, y + 9, c('stone', 1));
  }
}

function drawHeadgear(t, v, dir, p) {
  const y = 6 + p.bodyY;
  const { x, w } = headBox(dir, p);

  if (v.head === 'helmet') {
    t.rect(x - 1, y - 2, w + 2, 4, c('iron', 2));
    t.hline(x, x + w - 1, y - 2, c('iron', 3));
    t.hline(x - 1, x + w, y + 1, c('iron', 1));
    t.rect(x + Math.floor(w / 2) - 1, y - 4, 2, 3, c('iron', 3)); // grzebień
    if (dir !== 'up') t.hline(x + 1, x + w - 2, y + 2, c('iron', 0)); // nakarczek
  } else if (v.head === 'hood') {
    // Chłodny granat zamiast sadzy — inaczej kaptur zlewał się z szarą skórą
    // w jedną brunatną plamę i wariant tracił sylwetkę.
    t.rect(x - 1, y - 2, w + 2, 6, c('night', 2));
    t.hline(x, x + w - 1, y - 2, c('night', 3));
    t.rect(x - 1, y + 2, 2, 4, c('night', 2)); // opadające poły
    t.rect(x + w - 1, y + 2, 2, 4, c('night', 2));
    if (dir !== 'up') t.hline(x + 1, x + w - 2, y + 3, c('night', 1)); // cień okapu
  } else if (v.head === 'cap') {
    t.rect(x, y - 2, w, 3, c('blood'));
    t.hline(x + 1, x + w - 2, y - 2, '#c2455a');
    t.hline(x - 1, x + w, y + 1, '#5c1622');
    t.px(x + w, y - 1, c('blood')); // opadający czubek
    t.px(x + w + 1, y, c('blood'));
  }
}

// --- Miecz --------------------------------------------------------------------

/**
 * Miecz rysowany od garści na zewnątrz, pod zadanym kątem.
 *
 * Dzięki temu jedna klatka zamachu to trzy liczby (punkt garści, kąt, długość),
 * a nie osobny rysunek — i kąty da się poprawiać po obejrzeniu podglądu, bez
 * przerysowywania czegokolwiek.
 *
 * Ostrze ma jasne pasmo i ciemniejszy grzbiet po jednej stronie. Bez tego jest
 * jednolitą kreską i nie widać, że to płaskie ostrze, a nie pręt.
 */
function drawSpear(t, hx, hy, degrees, reach, butt = 6) {
  const angle = (degrees * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Prostopadła do drzewca — po niej odkładamy grubość i grot.
  const nx = -dy;
  const ny = dx;

  const put = (along, across, col) => {
    t.px(Math.round(hx + dx * along + nx * across), Math.round(hy + dy * along + ny * across), col);
  };

  // Drzewce: jasne od góry, ciemniejsze od spodu — bez tego jest płaską kreską.
  const shaftEnd = Math.max(1, reach - 4);
  for (let i = -butt; i <= shaftEnd; i++) {
    put(i, 0, c('wood', 3));
    put(i, 1, c('wood', 1));
  }

  // Owinięcie w miejscu chwytu — po nim widać, gdzie włócznia jest trzymana,
  // i dzięki niemu drzewce nie czyta się jako patyk.
  put(-1, 0, c('copper'));
  put(0, 0, c('copper'));
  put(1, 0, c('copper'));
  put(0, 1, c('wood', 0));

  // Grot w kształcie liścia: rozszerza się, potem zbiega do czubka.
  put(shaftEnd, -1, c('iron', 1));
  put(shaftEnd, 0, c('iron', 2));
  put(shaftEnd, 1, c('iron', 1));
  put(shaftEnd + 1, -1, c('iron', 2));
  put(shaftEnd + 1, 0, c('iron', 4));
  put(shaftEnd + 1, 1, c('iron', 2));
  put(shaftEnd + 2, 0, c('iron', 4));
  put(shaftEnd + 2, 1, c('iron', 2));
  put(shaftEnd + 3, 0, c('iron', 3));
}

/**
 * Łuk śladu cięcia. Grubość jest największa w środku łuku i schodzi do jednego
 * piksela na końcach — równa kreska wygląda jak wycinek obręczy, a nie jak ślad
 * ostrza, które gdzieś zaczyna i gdzieś kończy.
 */
function drawArc(t, cx, cy, radius, fromDeg, toDeg, thickness, col) {
  const steps = Math.max(8, Math.round(Math.abs(toDeg - fromDeg) * 1.4));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const angle = ((fromDeg + (toDeg - fromDeg) * k) * Math.PI) / 180;
    const thick = Math.max(1, Math.round(thickness * Math.sin(Math.PI * k)));
    for (let r = 0; r < thick; r++) {
      t.px(
        Math.round(cx + Math.cos(angle) * (radius - r)),
        Math.round(cy + Math.sin(angle) * (radius - r)),
        col,
      );
    }
  }
}

/**
 * Ślad pchnięcia: klin zwężający się ku czubkowi plus dwie kreski prędkości
 * po bokach. Sam klin czyta się jak przedmiot — dopiero kreski robią z niego ruch.
 */
function drawSlash(dir, frame) {
  const t = new Canvas(SLASH_W, SLASH_W);
  const angle = (SLASH_AIM[dir] * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const [from, to, width] = SLASH_SWEEPS[frame];
  const col = SLASH_TONES[frame];

  const put = (along, across) => {
    t.px(
      Math.round(SLASH_C + dx * along + nx * across),
      Math.round(SLASH_C + dy * along + ny * across),
      col,
    );
  };

  // Rdzeń: wąska smuga zwężająca się ku czubkowi. Szerokość liczona **od osi**,
  // więc `width` to połowa grubości u nasady. Pierwsza wersja brała ją jako pełną
  // grubość i przy siedmiu pikselach ślad czytał się jak biała belka przecinająca
  // postać, a nie jak pchnięcie.
  for (let i = from; i <= to; i++) {
    const k = (i - from) / Math.max(1, to - from);
    const half = Math.max(0, Math.round(width * (1 - k) * 0.5));
    for (let a = -half; a <= half; a++) put(i, a);
  }

  // Dwie kreski prędkości tuż obok osi, cofnięte względem czubka. To one robią
  // z kształtu ruch — sam klin czyta się jak przedmiot.
  const trail = Math.round((to - from) * 0.4);
  for (let i = from + 2; i < from + 2 + trail; i++) {
    put(i, width);
    put(i, -width);
  }

  return t;
}

/**
 * Ręka prowadzona do wskazanego punktu — przy zamachu dłoń wędruje razem
 * z mieczem, więc nie da się jej narysować na stałej pozycji jak w biegu.
 */
function drawArmTo(t, v, shoulderX, shoulderY, handX, handY) {
  const [skinDark, skinMid] = v.skin;
  const [clothDark, clothMid] = v.cloth;

  t.line(shoulderX, shoulderY, handX, handY, clothMid);
  t.line(shoulderX, shoulderY + 1, handX, handY + 1, clothDark);
  t.rect(handX - 1, handY, 2, 2, skinMid);
  t.px(handX - 1, handY + 1, skinDark);
}

// --- Składanie klatki ---------------------------------------------------------

function drawBody(variant, dir, kind, frame, p) {
  const t = new Canvas(W, H);

  drawLegs(t, variant, dir, p);

  if (dir === 'side') {
    // Kolejność ma znaczenie: dalsza ręka chowa się za tułowiem, bliższa idzie na wierzch.
    if (kind !== 'attack') drawArm(t, variant, 4, p.armA, p);
    drawTorso(t, variant, dir, p);
    drawHead(t, variant, dir, p);
    if (kind !== 'attack') drawArm(t, variant, 9, p.armB, p);
  } else {
    drawTorso(t, variant, dir, p);
    drawHead(t, variant, dir, p);
    // Przy ciosie ręka z mieczem **zastępuje** jedną z rąk spoczynkowych, więc tę
    // jedną trzeba pominąć. Z przodu miecz idzie po prawej stronie kadru (garść
    // przy x≈13), z tyłu po lewej (x≈3) — pomijamy odpowiednio prawą albo lewą.
    // Odwrotnie postawiony warunek dawał dwie ręce po jednej stronie i żadnej
    // po drugiej.
    if (kind !== 'attack' || dir !== 'up') drawArm(t, variant, 2 + (p.lean ?? 0), p.armA, p);
    if (kind !== 'attack' || dir !== 'down') drawArm(t, variant, 12 + (p.lean ?? 0), p.armB, p);
  }
  drawHeadgear(t, variant, dir, p);

  // Obrys dostaje **własny margines**, i to jest naprawa realnego błędu.
  //
  // Sylwetka wypełniała całą szerokość szesnastu pikseli — ucho z profilu sięgało
  // dokładnie do krawędzi. Obrys rysuje się piksel na zewnątrz kształtu, więc przy
  // krawędzi po prostu go nie było: ucho zlewało się z tłem i czytało jako **ucięte**.
  // Widać to było zawsze, ale rzucało się w oczy dopiero po przejściu na celowanie
  // myszką, bo bok jest teraz na ekranie bez przerwy.
  //
  // Margines dokładamy z boków i u góry; **na dole nie**, bo tam stoją stopy
  // i zaczepienie sprite'a to (0.5, 1) — piksel pod stopami uniósłby postać.
  const framed = new Canvas(BODY_W, BODY_H);
  framed.blit(t, BODY_PAD_X, BODY_PAD_T);
  return framed.outline(OUTLINE);
}

// Ile pikseli grot dorysowuje za końcem drzewca.
const SPEAR_TIP = 3;

/**
 * Skraca zasięg tak, żeby grot **zmieścił się w klatce**.
 *
 * Liczone, a nie dobierane ręcznie, i to jest tu sedno. Zasięgi wpisywane na oko
 * dwa razy dały ucięte drzewce, za każdym razem niewidoczne na arkuszu kontrolnym:
 * najpierw w bok przy mocnym pchnięciu, potem **w dół przy ukosie** — siedem
 * pikseli grotu ścinała dolna krawędź.
 *
 * Dół jest najciaśniejszy i nie da się tego obejść: zaczepienie sprite'a to
 * (0.5, 1), więc każdy piksel dodany pod stopami podniósłby całą postać nad ziemię.
 * U góry miejsce jest za darmo, dlatego ukos w górę może być znacznie dłuższy niż
 * w dół — i tak właśnie ma być, bo to samo robi perspektywa.
 */
function fitReach(hand, angle, reach) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const hx = ATTACK_OX + hand[0];
  const hy = hand[1];

  let limit = reach;
  const cap = (available, component) => {
    if (component > 0.001) limit = Math.min(limit, available / component - SPEAR_TIP);
  };
  cap(ATTACK_W - 2 - hx, dx);
  cap(hx - 1, -dx);
  // W dół granicą jest **linia stóp**, nie dolna krawędź płótna: drzewce wbite
  // w ziemię przed postacią wygląda jak potknięcie, nie jak pchnięcie.
  cap(H - 2 - hy, dy);
  cap(hy + BODY_PAD_T - 1, -dy);

  return Math.max(2, Math.round(limit));
}

/**
 * @param dir sylwetka ciała: `down`, `up` albo `side`
 * @param aim kierunek ciosu z `ATTACK_AIMS` — obraca samo drzewce i skraca zasięg
 */
function drawFrame(variant, dir, kind, frame, step = 0, aim = null) {
  const p = pose(kind, frame, dir, step);
  if (kind === 'attack') {
    if (aim) p.angle += aim.turn;
    p.reach = fitReach(p.hand, p.angle, p.reach * (aim?.reach ?? 1));
  }
  const body = drawBody(variant, dir, kind, frame, p);
  if (kind !== 'attack') return body;

  // Broń rysowana osobno i z własnym obrysem, więc tam, gdzie mija tułów,
  // wyraźnie się od niego odcina — bez tego drzewce zlewa się z ubraniem w plamę.
  // Broń i ciało dzielą to samo płótno co do wiersza, więc górny margines na obrys
  // obowiązuje też tutaj — inaczej drzewce siedziałoby o piksel wyżej niż garść,
  // która je trzyma.
  const blade = new Canvas(ATTACK_W, BODY_H);
  // Ramię wychodzi z barku, a bark jedzie razem z odchyleniem tułowia.
  const shoulderX = ATTACK_OX + (dir === 'up' ? 5 : 10) + (p.lean ?? 0);
  const handX = ATTACK_OX + p.hand[0];
  const handY = p.hand[1] + BODY_PAD_T;
  drawArmTo(blade, variant, shoulderX, 18 + p.bodyY + BODY_PAD_T, handX, handY);
  drawSpear(blade, handX, handY, p.angle, p.reach);
  const bladeArt = blade.outline(OUTLINE);

  const sheet = new Canvas(ATTACK_W, BODY_H);
  // Ciało przyszło już z własnym marginesem, więc przesuwamy je o tyle mniej.
  const bodyX = ATTACK_OX - BODY_PAD_X;

  if (dir === 'up') {
    // Widok z tyłu: patrzymy postaci w plecy, więc miecz i trzymająca go ręka są
    // po **drugiej stronie** ciała niż kamera i muszą iść POD nie. Rysowane na
    // wierzchu wyglądały jak broń przypięta do pleców — było widać ten kawałek
    // ostrza, który powinien być zasłonięty przez goblina.
    sheet.blit(bladeArt, 0, 0);
    sheet.blit(body, bodyX, 0);
  } else {
    sheet.blit(body, bodyX, 0);
    sheet.blit(bladeArt, 0, 0);
  }

  return sheet;
}

export const DIRECTIONS = ['down', 'up', 'side'];
export const IDLE_FRAMES = 2;
export const RUN_FRAMES = 6;

export function buildGoblins() {
  const entries = [];
  for (const variant of VARIANTS) {
    for (const dir of DIRECTIONS) {
      for (let f = 0; f < IDLE_FRAMES; f++) {
        entries.push({ name: `g${variant.id}_${dir}_idle${f}`, canvas: drawFrame(variant, dir, 'idle', f) });
      }
      for (let f = 0; f < RUN_FRAMES; f++) {
        entries.push({ name: `g${variant.id}_${dir}_run${f}`, canvas: drawFrame(variant, dir, 'run', f) });
      }
    }

    // Ciosy mają własne kierunki, bo jest ich więcej niż sylwetek: ukos powstaje
    // z tej samej sylwetki bocznej, tylko z drzewcem obróconym o 46 stopni.
    // Nazwa: `a<ogniwo>f<klatka>`.
    for (const aim of ATTACK_AIMS) {
      for (let s = 0; s < ATTACK_STEPS; s++) {
        for (let f = 0; f < ATTACK_FRAMES; f++) {
          entries.push({
            name: `g${variant.id}_${aim.name}_a${s}f${f}`,
            canvas: drawFrame(variant, aim.body, 'attack', f, s, aim),
          });
        }
      }
    }
  }

  // Ślad cięcia jest wspólny dla wszystkich wariantów postaci — to efekt broni,
  // nie części ciała.
  for (const aim of ATTACK_AIMS) {
    for (let f = 0; f < SLASH_FRAMES; f++) {
      entries.push({ name: `slash_${aim.name}${f}`, canvas: drawSlash(aim.name, f) });
    }
  }

  return entries;
}
