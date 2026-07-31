// Kafle terenu, 16x16, perspektywa 3/4.
//
// Ściany składają się z dwóch kafli: `wall_top` (widok na koronę muru z góry)
// i `wall_face_*` (front muru pod nią). Dzięki temu mur ma grubość i widać,
// że gracz chodzi przed nim, a nie po nim.
//
// **Podłoże jest warstwowe, nie „albo/albo".** Pod spodem leży ziemia — wszędzie,
// także tam, gdzie rośnie trawa. Trawa i droga to `surfaceOverlay()`: osobna
// warstwa położona na wierzchu, o własnym, obłym kształcie, która **nachodzi**
// na ziemię zamiast do niej przylegać.
//
// Poprzednia wersja wybierała jeden kafel na pole (`n > 0.68 ? ziemia : trawa`)
// i dokładała pasek zębów na styku. Twardy próg na ciągłym szumie może dać tylko
// binarną granicę, a siatka tnie ją na schodki co szesnaście pikseli — dlatego
// świat czytał się jako kwadraty poukładane obok siebie. Żadna obwódka rysowana
// PO tej decyzji tego nie odwraca, bo podłoże już się zadeklarowało jako kwadrat.

import { Canvas } from './canvas.js';
import { c } from './palette.js';
import { makeRng, seedFrom } from './rng.js';

export const TILE = 16;

/** Ile wariantów kafla ziemi. Musi się zgadzać z `dirtFor()` w `world/forge.js`. */
export const DIRT_VARIANTS = 12;

const rngFor = (name) => makeRng(seedFrom(name));

/**
 * Nieregularne plamy materiału, zawijane na krawędziach kafla.
 *
 * To jest odpowiedź na „wszystko kanciaste" po stronie samej tekstury. Kafle
 * robione przez `fill()` + `speckle()` to jednorodny szum: dwa takie pola o różnej
 * średniej barwie stykają się **idealnie prostą linią**, którą oko czyta
 * natychmiast. Szum pojedynczymi pikselami jest fakturą, nie kształtem — przy
 * zoomie 2-4x uśrednia się w płaską plamę koloru.
 *
 * Plamy o promieniu kilku pikseli dają kaflowi własną formę, więc granica między
 * dwoma kaflami nie ma się gdzie pokazać. Zawijanie (`% TILE`) sprawia, że kafel
 * przylega bez szwu sam do siebie — a to on powtarza się najczęściej.
 */
function blotches(t, rng, shades, { count, rmin, rmax, alpha = 255 }) {
  for (let i = 0; i < count; i++) {
    const cx = rng.range(0, TILE);
    const cy = rng.range(0, TILE);
    const rx = rng.range(rmin, rmax);
    const ry = rx * rng.range(0.55, 1.0);
    const col = shades[rng.int(shades.length)];
    // Trzy fale doklejone do promienia — czysta elipsa czyta się jako narysowany
    // owal, a nie jako nierówność gruntu. Ta sama sztuczka co przy kałuży.
    const amp = [rng.range(0.1, 0.3), rng.range(0.06, 0.2), rng.range(0.03, 0.12)];
    const ph = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];

    const r0 = Math.ceil(Math.max(rx, ry)) + 1;
    for (let dy = -r0; dy <= r0; dy++) {
      for (let dx = -r0; dx <= r0; dx++) {
        const nx = dx / rx;
        const ny = dy / ry;
        const d = Math.hypot(nx, ny);
        if (d > 1.4) continue;
        const a = Math.atan2(ny, nx);
        const edge = 1 + amp[0] * Math.sin(2 * a + ph[0])
          + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]);
        if (d > edge) continue;
        // Brzeg plamy rozsypany, nie obrysowany — plama ma się rozmywać w tło.
        if (d > edge - 0.22 && rng.chance(0.5)) continue;
        const x = ((Math.round(cx + dx) % TILE) + TILE) % TILE;
        const y = ((Math.round(cy + dy) % TILE) + TILE) % TILE;
        t.px(x, y, alpha === 255 ? col : [...hexToRgb(col), alpha]);
      }
    }
  }
  return t;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// --- Wnętrze kuźni ------------------------------------------------------------

/** Kamienna posadzka w wiązaniu przesuwanym; `soot` przyciemnia okolice paleniska. */
function stoneFloor(name, { soot = 0, offset = 0 } = {}) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('stone', 1));

  for (let row = 0; row < 2; row++) {
    const y = row * 8;
    // Fuga u góry płyty i rozjaśniona krawędź pod nią — daje faskę w widoku 3/4.
    // Rozjaśnienie kładziemy przez szachownicę, bo pełna linia tworzyła paski
    // czytelne z daleka jako krata, a nie jako posadzka.
    t.hline(0, TILE - 1, y, c('stone', 1));
    t.dither(0, y + 1, TILE, 1, c('stone', 2), { offset: row });
    const shift = (row + offset) % 2 === 0 ? 3 : 11;
    t.vline(shift, y, y + 7, c('stone', 1));
    t.dither(shift + 1, y + 2, 1, 6, c('stone', 2));
  }

  t.speckle(rng, c('stone', 0), 0.03);
  t.speckle(rng, c('stone', 3), 0.02);
  if (soot > 0) {
    // Przygaszenie, nie zaprószenie: kryjące piksele sadzy czytały się z daleka
    // jako żwir rozsypany po podłodze zamiast jako osad wżarty w kamień.
    t.speckle(rng, [0x14, 0x10, 0x0f, 60], soot * 0.3);
    t.speckle(rng, [0x14, 0x10, 0x0f, 130], soot * 0.08);
  }
  return t;
}

/**
 * Deski — główna podłoga hali.
 *
 * Deski są szerokie (po 5-6 px) i mają wyraźne styki, bo to one mówią „podłoga
 * z drewna". Wcześniej hala miała posadzkę `floor_stone` tak gęsto zaszumioną,
 * że z góry czytała się jak rozsypany żwir.
 */
function woodFloor(name, { offset = 0 } = {}) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  // Podłoga jest CIEMNIEJSZA od mebli i skrzyń, które na niej stoją.
  //
  // Pierwsza wersja miała bazę `wood 2` — dokładnie tę samą, z której zrobione
  // są beczki, skrzynie i stół. Przedmioty zlewały się z podłożem i cała hala
  // była jedną brązową plamą. Deski schodzą więc o dwa stopnie rampy w dół,
  // a przedmioty zostają na środku — kontrast robi sam materiał.
  t.fill(c('wood', 1));

  // Trzy deski na kafel. Wąska jaśniejsza krawędź u góry, szpara u dołu.
  for (const y of [0, 6, 11]) {
    t.hline(0, TILE - 1, y, c('wood', 2));
    t.hline(0, TILE - 1, Math.min(TILE - 1, y + 4), c('wood', 0));
  }

  // Styki desek przesunięte co kafel, żeby podłoga nie ustawiła się w kratę.
  const joint = offset % 2 === 0 ? 5 : 12;
  t.vline(joint, 1, 4, c('wood', 0));
  t.vline((joint + 8) % TILE, 7, 10, c('wood', 0));

  // Słoje: krótkie poziome kreski, nie losowe kropki.
  for (let i = 0; i < 4; i++) {
    const y = 1 + rng.int(TILE - 2);
    const x = rng.int(TILE - 5);
    t.hline(x, x + 2 + rng.int(3), y, c('wood', 2));
  }
  return t;
}

/**
 * Front ściany — bal na bal, jak w karczmie. Kamienne bloki czytały się jak
 * mur obronny; budynek ma być drewniany, a kamień zostaje przy palenisku,
 * gdzie ma sens ogniowy.
 *
 * Bale są poziome, bo tak stawia się ściany zrębowe, i dają wyraźny rytm
 * poziomych linii — z daleka to on mówi „drewno", nie faktura.
 */
function wallFace(name, { soot = 0 } = {}) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('wood', 2));

  // Cztery bale po cztery piksele. Każdy ma światło u góry i cień u dołu, więc
  // ściana ma relief bez rysowania okrągłych przekrojów.
  for (let log = 0; log < 4; log++) {
    const y = log * 4;
    t.hline(0, TILE - 1, y, c('wood', 3));
    t.hline(0, TILE - 1, y + 3, c('wood', 0));   // szpara między balami
    t.speckle(rng, c('wood', 1), 0.22, { x: 0, y: y + 1, w: TILE, h: 2 });  // słoje
    // Sęk co drugi bal, przesunięty — inaczej ściana wygląda jak tapeta w prążki.
    if (log % 2 === 0) {
      const kx = 3 + rng.int(9);
      t.px(kx, y + 1, c('wood', 0));
      t.px(kx + 1, y + 1, c('wood', 1));
      t.px(kx, y + 2, c('wood', 1));
    }
  }

  // Kontaktowy cień przy podłodze — ściana nie "pływa" nad posadzką.
  t.hline(0, TILE - 1, TILE - 1, c('soot', 0));

  if (soot > 0) {
    for (let x = 0; x < TILE; x++) {
      for (let y = 0; y < TILE; y++) {
        // Osad ciągnie się od góry w dół, jak dym po ścianie. Półprzezroczysty,
        // bo kryjąca sadza czyta się jako rozsypany żwir.
        if (rng.next() < soot * (1 - y / TILE) * 0.6) t.px(x, y, [0x14, 0x10, 0x0f, 90]);
      }
    }
  }
  return t;
}

/**
 * Ściana z okienkiem. Otwór jest mały i wysoko, jak w gospodarczym budynku —
 * przez taki widać niewiele i o to chodzi: to, ile widać, ma zależeć od tego,
 * gdzie gracz stoi.
 */
function wallWindow(name) {
  const rng = rngFor(name);
  const t = wallFace(name);

  // Otwór 12x8 px, prawie na całą szerokość kafla. Pierwsza wersja miała 8x6
  // i klin widoczności przez tak wąską szczelinę był na placu paskiem, przez
  // który nic nie było widać.
  const x0 = 2;
  const y0 = 3;
  t.rect(x0 - 1, y0 - 1, 14, 10, c('wood', 0));      // rama
  t.rect(x0, y0, 12, 8, c('night', 0));              // prześwit
  t.hline(x0, x0 + 11, y0, c('night', 1));           // światło z zewnątrz u góry
  t.hline(x0, x0 + 11, y0 + 7, c('soot', 0));        // cień u dołu
  // Krzyżak: jedna listwa w pionie, jedna w poziomie.
  t.vline(x0 + 5, y0, y0 + 7, c('wood', 1));
  t.hline(x0, x0 + 11, y0 + 3, c('wood', 1));
  // Parapet.
  t.hline(x0 - 1, x0 + 12, y0 + 8, c('wood', 3));
  t.speckle(rng, c('wood', 1), 0.1, { x: x0 - 1, y: y0 + 8, w: 14, h: 1 });
  return t;
}

/**
 * Okno w ścianie widzianej z góry (południowa strona hali). Z tej perspektywy
 * otwór czyta się jako szczelina w wieńczącej belce.
 */
function wallTopWindow(name) {
  const t = wallTop(name);
  t.rect(1, 4, 14, 8, c('wood', 0));       // rama
  t.rect(2, 5, 12, 6, c('night', 0));      // prześwit
  t.hline(2, 13, 5, c('night', 1));
  t.vline(7, 5, 10, c('wood', 1));         // listwa krzyżaka
  t.hline(2, 13, 11, c('wood', 3));        // parapet
  return t;
}

/** Wieńcząca belka ściany widziana z góry. */
function wallTop(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('wood', 1));
  t.hline(0, TILE - 1, 0, c('wood', 3));        // światło na górnej krawędzi
  t.rect(0, 1, TILE, TILE - 3, c('wood', 2));
  t.hline(0, TILE - 1, TILE - 2, c('wood', 0));
  t.hline(0, TILE - 1, TILE - 1, c('soot', 0)); // cień rzucany na ścianę pod nią
  // Czoła bali — poprzeczne kreski co kilka pikseli.
  for (let x = 4; x < TILE; x += 6) t.vline(x, 2, TILE - 3, c('wood', 1));
  t.speckle(rng, c('wood', 3), 0.08, { x: 0, y: 1, w: TILE, h: TILE - 3 });
  return t;
}

// --- Dach ---------------------------------------------------------------------
//
// Dach ogląda się z góry pod skosem, więc gont układa się w poziome rzędy
// z zakładką. Jest wyraźnie ciemniejszy od wszystkiego pod spodem — to on ma
// czytać się jako "tu nie zaglądasz", zanim jeszcze zadziała oświetlenie.

function roofShingles(name, { offset = 0 } = {}) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  // Łupek, nie deski. Rampa żelaza jest chłodna i granatowa, więc dachu nie da
  // się pomylić z ubitą ziemią — a przy rampie drewna dokładnie tak było.
  t.fill(c('iron', 1));

  // Gont rysujemy płytka po płytce, każdą w losowo dobranym odcieniu.
  //
  // Poprzednia wersja miała pełne poziome fugi i pionowe spoiny — czyli
  // dokładnie wzór cegły, i dach czytał się jak mur. Dach rozpoznaje się po
  // NIEROWNOŚCI odcieni w rzędzie, nie po siatce spoin.
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const shift = (row + offset) % 2 === 0 ? 0 : 3;

    for (let x = -shift; x < TILE; x += 6) {
      const tone = rng.chance(0.35) ? c('iron', 2) : rng.chance(0.5) ? c('iron', 1) : c('iron', 0);
      t.rect(x, y, 6, 3, tone);
      // Tylko sam narożnik płytki łapie światło — nie cała krawędź.
      t.px(x + 1, y, c('iron', 3));
      t.px(x + 2, y, c('iron', 3));
    }

    // Cień pod rzędem: przerywany, nie ciągła linia.
    for (let x = 0; x < TILE; x++) {
      if ((x + row) % 5 !== 0) t.px(x, y + 3, c('iron', 0));
    }
  }

  t.speckle(rng, c('soot', 1), 0.06);
  return t;
}

/** Krokiew — drewniana belka przez łupek. Kontrast materiału czyta konstrukcję. */
function roofBeam(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('iron', 1));
  t.rect(0, 4, TILE, 8, c('wood', 2));
  t.hline(0, TILE - 1, 4, c('wood', 4));    // światło na górnej krawędzi belki
  t.hline(0, TILE - 1, 11, c('soot', 0));   // cień pod belką
  t.speckle(rng, c('wood', 1), 0.14);       // słoje
  for (let x = 3; x < TILE; x += 7) t.px(x, 8, c('iron', 4));  // ćwieki
  return t;
}

/** Kalenica — jasny grzbiet na osi dachu. */
function roofRidge(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('iron', 1));
  t.rect(0, 5, TILE, 6, c('iron', 3));
  t.hline(0, TILE - 1, 5, c('iron', 4));
  t.hline(0, TILE - 1, 10, c('soot', 0));
  t.speckle(rng, c('iron', 2), 0.12);
  return t;
}

// --- Plac na zewnątrz ---------------------------------------------------------

/**
 * Ubita ziemia — **baza całego świata**, także pod trawą i pod drogą.
 *
 * Najpierw plamy, potem szum. Kolejność jest istotna: plamy robią formę, którą
 * widać z zoomu, szum dokłada fakturę, której z zoomu nie widać, ale bez której
 * plamy wyglądają jak wycięte z papieru.
 */
function dirt(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('earth', 2));
  blotches(t, rng, [c('earth', 1), c('earth', 3)], { count: 5, rmin: 2.5, rmax: 5.0 });
  blotches(t, rng, [c('earth', 0)], { count: 2, rmin: 1.5, rmax: 3.0 });
  // Najjaśniejszy odcień ziemi zostaje drodze — ubita ziemia go nie dostaje.
  // Inaczej droga ginie w placu, bo obie mają te same plamy.
  t.speckle(rng, c('earth', 1), 0.1);
  t.speckle(rng, c('earth', 3), 0.08);
  // Kilka kamyków z podkreśleniem od spodu — drobny relief.
  for (let i = 0; i < 3; i++) {
    const x = rng.int(TILE - 1);
    const y = rng.int(TILE - 1);
    t.px(x, y, c('stone', 2));
    t.px(x, y + 1, c('earth', 0));
  }
  return t;
}

/** Wydeptana ścieżka — jaśniejsza i gładsza od reszty. Kładziona jako nakładka. */
function path(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  // Droga siedzi o cały stopień rampy wyżej od ubitej ziemi i dokłada kamień.
  // Sam odcień jaśniejszej ziemi nie wystarczał: przy zoomie 2x różnica jednego
  // stopnia znikała i wydeptany trakt czytał się jak przypadkowa jasna plama.
  t.fill(c('earth', 4));
  blotches(t, rng, [c('earth', 3)], { count: 4, rmin: 2.5, rmax: 5.5 });
  blotches(t, rng, [c('stone', 2)], { count: 3, rmin: 1.5, rmax: 3.2 });
  t.speckle(rng, c('earth', 3), 0.12);
  t.speckle(rng, c('stone', 3), 0.06);
  t.speckle(rng, c('stone', 1), 0.05);
  return t;
}

/** Trawa — powierzchnia nakładki, nigdy nie kładziona jako samodzielne podłoże. */
function grass(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('foliage', 2));
  // Trawa dostaje **węższy zakres** niż ziemia: tylko sąsiednie stopnie rampy
  // w dużych plamach, a skrajne odcienie pojedynczymi pikselami. Pierwsza wersja
  // brała pełną rampę na plamy i darń czytała się jak brokuł — kontrast wewnątrz
  // materiału zjadał kontrast na jego granicy, czyli to jedyne, co ma tu grać.
  blotches(t, rng, [c('foliage', 1)], { count: 3, rmin: 2.5, rmax: 5.0 });
  blotches(t, rng, [c('foliage', 3)], { count: 3, rmin: 2.5, rmax: 5.0 });
  t.speckle(rng, c('foliage', 1), 0.1);
  t.speckle(rng, c('foliage', 3), 0.09);
  t.speckle(rng, c('foliage', 4), 0.03);
  t.speckle(rng, c('foliage', 0), 0.02);
  // Źdźbła: krótkie pionowe kreski z ciemniejszą podstawą.
  for (let i = 0; i < 6; i++) {
    const x = rng.int(TILE);
    const y = rng.between(2, TILE - 3);
    t.px(x, y, c('foliage', 4));
    t.px(x, y + 1, c('foliage', 1));
  }
  return t;
}

// --- Warstwa nakładkowa (trawa i droga na ziemi) ------------------------------
//
// Siatka nakładek jest **przesunięta o pół kafla** względem siatki świata, więc
// jedna komórka nakładki dotyka czterech pól świata — po jednym na róg. Kształt
// bierze się z tego, ile z tych czterech rogów jest trawą: szesnaście układów
// zamiast czterdziestu siedmiu autokafli, a obłe narożniki wychodzą z samej
// konstrukcji, nie z rysowania ich po jednym.
//
// Dwie rzeczy, których nie da się tu zrobić inaczej:
//
// **Próg liczony dwuliniowo.** Wartość w punkcie to interpolacja czterech rogów.
// Dwie sąsiednie komórki dzielą dwa rogi, więc wzdłuż wspólnej krawędzi liczą
// dokładnie tę samą wartość — kształty schodzą się bez szwu, choć każdy powstał
// osobno. To jest cały powód, dla którego siatka jest przesunięta.
//
// **Szum ma okres równy dwóm kaflom.** Nierówność krawędzi musi się zgadzać po
// obu stronach styku komórek, więc nie może być losowa — jest sumą sinusów o
// okresie 32 px, próbkowaną w czterech fazach zależnych od pozycji komórki.
// Losowy szum dałby ząbek urwany dokładnie na granicy komórki, czyli ten sam
// prosty szew, którego się tu pozbywamy.

/** Ile rogów komórki jest wypełnionych: NW=1, NE=2, SW=4, SE=8. */
const CORNERS = [[1, 0, 0], [2, 1, 0], [4, 0, 1], [8, 1, 1]];

export const PHASES = 16;

function coverage(mask, phase) {
  const ox = (phase & 3) * TILE;
  const oy = ((phase >> 2) & 3) * TILE;
  const P = TILE * 4;

  // Nierówność krawędzi. Amplituda ~0,12 przekłada się na jakieś półtora piksela
  // wychylenia — więcej i obłe narożniki gubią się w postrzępieniu.
  //
  // Okres to **cztery kafle**, nie dwa. Przy dwóch długa prosta granica — a taka
  // jest skalna ściana miasta — dostawała falę powtarzaną co 32 px i czytało się
  // to jako rząd jednakowych garbów, czyli ten sam rytm siatki, którego się tu
  // pozbywamy, tylko dwa razy rzadszy. Kosztem jest szesnaście faz zamiast
  // czterech, czyli kilkaset kafli więcej w atlasie — a te są darmowe.
  const wob = (x, y) => {
    const X = ((x + ox) / P) * Math.PI * 2;
    const Y = ((y + oy) / P) * Math.PI * 2;
    return 0.10 * Math.sin(X + 0.9) * Math.cos(Y - 0.3)
      + 0.07 * Math.sin(2 * X + 1.1) * Math.cos(2 * Y + 0.4)
      + 0.05 * Math.sin(3 * X - 0.7) * Math.cos(Y + 1.7)
      + 0.04 * Math.cos(3 * Y + 2.2)
      + 0.03 * Math.sin(5 * X + 0.2) * Math.sin(5 * Y - 1.1);
  };

  // Próg poniżej połowy: nakładka **rozlewa się** na ziemię zamiast kończyć
  // dokładnie w połowie pola. O to właśnie chodzi w „narasta od boku".
  const THRESHOLD = 0.43;

  return (x, y) => {
    const u = (x + 0.5) / TILE;
    const w = (y + 0.5) / TILE;
    let v = 0;
    for (const [bit, cu, cw] of CORNERS) {
      if (!(mask & bit)) continue;
      v += (cu ? u : 1 - u) * (cw ? w : 1 - w);
    }
    return v + wob(x, y) - THRESHOLD;
  };
}

/**
 * Kafel nakładki: powierzchnia przycięta kształtem z `coverage()` plus obróbka
 * krawędzi, która sprzedaje, że warstwa **leży na** ziemi, a nie obok niej.
 *
 * Trzy sygnały, każdy w innym miejscu:
 * - u góry rozjaśniona grzywka i pojedyncze źdźbła wychodzące poza kształt,
 * - po bokach źdźbła wygięte na zewnątrz,
 * - u dołu **cień kontaktowy położony poza kształtem**, na ziemi.
 *
 * Cień jest z tych trzech najważniejszy. Bez niego warstwa czyta się jak łata
 * wklejona w podłoże; z nim od razu widać, że coś tu rośnie i ma grubość.
 */
const BODY = { grass, path, rock: rockWall };

function surfaceOverlay(name, kind, mask, phase) {
  const rng = rngFor(name);
  const body = BODY[kind](`${name}-body`);
  const t = new Canvas(TILE, TILE);
  const inside = coverage(mask, phase);
  const isIn = (x, y) => inside(x, y) > 0;

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!isIn(x, y)) continue;
      const [r, g, b] = body.get(x, y);
      t.px(x, y, [r, g, b, 255]);
    }
  }

  if (kind === 'rock') {
    // Skała jest **bryłą, nie łatą**: ma oświetloną górną krawędź, ciemny spód
    // i rzuca cień na ziemię pod sobą. Bez tych trzech rzeczy obły obrys tylko
    // zaokrągla płaską plamę i granica świata dalej czyta się jak wycinanka.
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (!isIn(x, y)) continue;
        if (!isIn(x, y - 1)) {
          t.px(x, y, c('stone', rng.chance(0.6) ? 2 : 3));
          if (isIn(x, y + 1)) t.px(x, y + 1, c('stone', 1));
        }
        if (!isIn(x - 1, y) || !isIn(x + 1, y)) t.px(x, y, c('stone', 0));
        if (!isIn(x, y + 1)) {
          // Podstawa i cień. Cień skały jest dłuższy niż trawy, bo skała jest
          // wyższa — dwa piksele kryjące i trzeci zanikający.
          t.px(x, y, c('soot', 0));
          t.px(x, y + 1, [...hexToRgb(c('soot', 0)), 165]);
          t.px(x, y + 2, [...hexToRgb(c('soot', 0)), 95]);
          if (rng.chance(0.6)) t.px(x, y + 3, [...hexToRgb(c('soot', 0)), 40]);
        }
      }
    }
    return t;
  }

  if (kind === 'path') {
    // Droga jest wydeptana, czyli **wgnieciona** — jaśniejsza w środku, z ciemnym
    // rantem po wewnętrznej stronie krawędzi. Cienia na zewnątrz nie ma, bo nic
    // tu nie wystaje ponad grunt; nakładanie go robiło z drogi wypukłą kładkę.
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (!isIn(x, y)) continue;
        const brzeg = !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);
        if (brzeg) t.px(x, y, [...hexToRgb(c('earth', 2)), 150]);
      }
    }
    return t;
  }

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!isIn(x, y)) continue;

      // Grzywka na górnej krawędzi — źdźbła stoją, więc od tej strony łapią światło.
      //
      // Wystających źdźbeł jest **mało i są krótkie**. Pierwsza wersja kłuła co
      // trzeci piksel na trzy w górę i cała łata trawy dostawała szczecinę, przez
      // którą nie było widać obłego kształtu — czyli tego jednego, po co ta warstwa
      // w ogóle powstała.
      if (!isIn(x, y - 1)) {
        t.px(x, y, c('foliage', rng.chance(0.55) ? 3 : 4));
        if (rng.chance(0.16)) t.px(x, y - 1, c('foliage', 3));
      }

      // Boki: pojedyncze źdźbła wychylone na ziemię.
      for (const dx of [-1, 1]) {
        if (isIn(x + dx, y) || !rng.chance(0.1)) continue;
        t.px(x + dx, y, c('foliage', 3));
      }

      // Cień kontaktowy: dwa piksele **poza** kształtem, coraz słabsze.
      if (!isIn(x, y + 1)) {
        t.px(x, y + 1, [...hexToRgb(c('earth', 0)), 120]);
        if (rng.chance(0.55)) t.px(x, y + 2, [...hexToRgb(c('earth', 0)), 55]);
        // Ciemniejsza nasada nad cieniem — trawa styka się z ziemią, nie unosi.
        t.px(x, y, c('foliage', 1));
      }
    }
  }
  return t;
}

/**
 * Lita skała — nieprzekraczalna granica mapy. Też nakładka: pod spodem leży
 * ziemia, więc skała ma na czym stać i może mieć obły obrys.
 *
 * Poprzednia wersja sypała krótkie poziome kreski w regularnych odstępach
 * i z góry czytała się jako **mur z cegły**, a nie jako lita skała. Bloki są
 * teraz plamami o różnej wielkości: skałę rozpoznaje się po nieregularnym
 * podziale na bryły, nie po rytmie spoin.
 */
function rockWall(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  // Skała jest **ciemna**. To granica świata, a granica ma się czytać jako
  // „tędy nie" — jasny kamień wygląda jak niski murek do przeskoczenia. Plamy
  // schodzą więc w dół rampy, a jaśniejszy stopień dostaje sam obrys bryły.
  t.fill(c('stone', 0));
  blotches(t, rng, [c('soot', 2)], { count: 4, rmin: 2.5, rmax: 5.5 });
  blotches(t, rng, [c('stone', 1)], { count: 3, rmin: 2.0, rmax: 4.0 });
  blotches(t, rng, [c('soot', 1)], { count: 2, rmin: 1.5, rmax: 3.5 });
  t.speckle(rng, c('stone', 1), 0.08);
  t.speckle(rng, c('soot', 1), 0.08);
  // Szczeliny: krótkie łamane, nie proste kreski o równej długości.
  for (let i = 0; i < 3; i++) {
    let x = rng.int(TILE);
    let y = rng.int(TILE);
    const len = rng.between(3, 7);
    const dx = rng.chance(0.5) ? 1 : -1;
    for (let j = 0; j < len; j++) {
      t.px(x, y, c('soot', 0));
      t.px(x, y - 1, c('stone', 3));
      x += dx;
      if (rng.chance(0.35)) y += rng.between(-1, 1);
    }
  }
  return t;
}

// --- Dekale (kładzione na wierzch bazowego terenu) ----------------------------

/**
 * Osad sadzy. Kluczowe jest półprzezroczyste krycie: pełne piksele sadzy
 * czytały się jak rozsypany żwir, a przygaszenie kamienia pod spodem daje
 * smugę, o którą chodzi.
 */
function sootSplat(name, scale) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  const cx = TILE / 2, cy = TILE / 2;
  const [r, g, b] = [0x14, 0x10, 0x0f]; // soot[0]
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - cx, y - cy) / (TILE / 2);
      if (d > 1) continue;
      const strength = (1 - d) ** 1.3 * scale;
      if (rng.next() > strength) continue;
      t.px(x, y, [r, g, b, Math.round(45 + strength * 85)]);
    }
  }
  return t;
}

function grassTuft(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  for (let i = 0; i < 7; i++) {
    const x = rng.between(2, TILE - 3);
    const y = rng.between(6, TILE - 3);
    const h = rng.between(2, 4);
    for (let j = 0; j < h; j++) t.px(x, y - j, c('foliage', j === 0 ? 1 : 3));
    if (rng.chance(0.5)) t.px(x + 1, y - h + 1, c('foliage', 4));
  }
  return t;
}

/**
 * Kałuża na ubitej ziemi.
 *
 * Pierwsza wersja była wypełniona granatem z rampy `night` i czytała się jako
 * **kamień albo dziura**, nie jako woda — użytkownik zapytał wprost, co to za
 * granatowe kawałki. Błąd był w rozumowaniu: woda nie jest niebieska, tylko
 * **odbija niebo**, a kałuża głęboka na centymetr odbija go tyle, co nic.
 * Naprawdę widać w niej mokrą ziemię, czyli tę samą ziemię, tylko ciemniejszą.
 *
 * Stąd dzisiejszy układ: rampa `earth` na całość, wilgotna obwódka dookoła
 * (bo grunt przy kałuży też jest mokry i to ona sprzedaje, że coś tam stoi)
 * i **trzy piksele** refleksu z rampy `night`, nie cała kreska.
 */
function puddle(name, { rx, ry }) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  const cx = 8;
  const cy = 9;

  // Kształt: elipsa z trzema falami doklejonymi do promienia. Czysta elipsa czyta
  // się jako narysowany owal — woda rozlewa się nierówno, bo grunt jest nierówny.
  const lobes = [
    { k: 2, amp: rng.range(0.06, 0.16), ph: rng.range(0, 6.28) },
    { k: 3, amp: rng.range(0.04, 0.12), ph: rng.range(0, 6.28) },
    { k: 5, amp: rng.range(0.02, 0.07), ph: rng.range(0, 6.28) },
  ];
  const edgeAt = (angle) =>
    1 + lobes.reduce((sum, l) => sum + l.amp * Math.sin(l.k * angle + l.ph), 0);

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.hypot(dx, dy);
      const edge = edgeAt(Math.atan2(dy, dx));

      // Wilgotny grunt dookoła — **szeroki i wyraźnie ciemniejszy** od suchej
      // ziemi. To on decyduje o tym, czy plama czyta się jako woda w gruncie,
      // czy jako niebieski kamień położony na nim. Wersja z wąską obwódką dała
      // dokładnie ten drugi efekt: kształt z objętością, ale bez związku z ziemią.
      // Krawędź obwódki jest rozsypana losowo, bo wilgoć nie ma konturu.
      if (d > edge) {
        const wet = (d - edge) / 0.75;
        if (wet < 1 && rng.chance(1 - wet * 0.8)) {
          t.px(x, y, c('earth', wet < 0.45 ? 0 : 1));
        }
        continue;
      }

      // Powierzchnia to **pionowe przejście**, nie jednolita plama.
      //
      // Pod kątem 3/4 patrzymy w wodę od strony bliższego brzegu: dalsza krawędź
      // odbija niebo i jest najjaśniejsza, bliższa pokazuje dno i jest ciemna.
      // Pierwsza wersja miała jeden kolor na całość i przez to czytała się jako
      // kamień — płaska plama nie ma się jak ułożyć w wodę, choćby była niebieska.
      //
      // Ale **niebieska jest tylko dalsza krawędź**. Woda głęboka na centymetr
      // pokazuje głównie błoto pod sobą, więc środek i bliższa połowa idą z rampy
      // `earth`. Wersja cała z rampy `night` miała objętość i dalej czytała się
      // jako niebieski kamień: różnica barwy względem brązowego placu była tak
      // duża, że plama odklejała się od podłoża.
      const far = -dy;   // 1 przy dalszej krawędzi, -1 przy bliższej
      let col;
      if (far > 0.66) col = c('night', 3);
      else if (far > 0.34) col = c('night', 2);
      else if (far > -0.1) col = rng.chance(0.4) ? c('night', 1) : c('earth', 0);
      else col = c('earth', 0);
      t.px(x, y, col);
    }
  }

  // Refleks: jeden krótki poziomy błysk. Poziomy, bo odbicie rozciąga się wzdłuż
  // powierzchni; jeden, bo to on ma być najjaśniejszym punktem kałuży — kilka
  // rozprasza uwagę i znowu robi z niej ozdobny kamyk.
  const gx = cx + rng.between(-Math.round(rx * 0.4), Math.round(rx * 0.2));
  const gy = cy - Math.max(1, Math.round(ry * 0.45));
  t.px(gx, gy, c('night', 4));
  t.px(gx + 1, gy, c('night', 4));
  if (rx > 5) t.px(gx + 2, gy, c('night', 3));

  return t;
}

function wheelRut(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  for (let x = 0; x < TILE; x++) {
    const wobble = Math.round(Math.sin((x + rng.next()) * 0.4) * 1.2);
    t.px(x, 6 + wobble, c('earth', 1));
    t.px(x, 7 + wobble, c('earth', 0));
    t.px(x, 11 + wobble, c('earth', 1));
    t.px(x, 12 + wobble, c('earth', 0));
  }
  return t;
}

function crack(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  let x = rng.between(2, TILE - 3);
  let y = 0;
  while (y < TILE) {
    t.px(x, y, c('stone', 0));
    if (rng.chance(0.3)) t.px(x + 1, y, c('soot', 1));
    x += rng.between(-1, 1);
    x = Math.max(1, Math.min(TILE - 2, x));
    y += 1;
  }
  return t;
}

// --- Zestaw -------------------------------------------------------------------

export function buildTiles() {
  const entries = [];
  const add = (name, canvas) => entries.push({ name, canvas });

  for (let i = 0; i < 4; i++) add(`floor_stone_${i}`, stoneFloor(`floor_stone_${i}`, { offset: i }));
  add('floor_stone_soot', stoneFloor('floor_stone_soot', { soot: 1 }));
  add('floor_stone_soot2', stoneFloor('floor_stone_soot2', { soot: 0.5, offset: 1 }));
  for (let i = 0; i < 3; i++) add(`floor_wood_${i}`, woodFloor(`floor_wood_${i}`, { offset: i }));

  for (let i = 0; i < 3; i++) add(`wall_face_${i}`, wallFace(`wall_face_${i}`));
  add('wall_face_soot', wallFace('wall_face_soot', { soot: 0.5 }));
  add('wall_window', wallWindow('wall_window'));
  add('wall_top_window', wallTopWindow('wall_top_window'));
  add('wall_top', wallTop('wall_top'));

  for (let i = 0; i < 2; i++) add(`roof_${i}`, roofShingles(`roof_${i}`, { offset: i }));
  add('roof_beam', roofBeam('roof_beam'));
  add('roof_ridge', roofRidge('roof_ridge'));

  // Dwanaście wariantów ziemi, nie cztery. Ziemia leży teraz pod **całym**
  // światem, a nie tylko na placu, więc jej powtarzalność widać najbardziej ze
  // wszystkiego: przy czterech kaflach plamy układały się w czytelny ukośny rytm
  // na całej otwartej przestrzeni. Trawa i droga tego problemu nie mają, bo każdy
  // z ich 240 kafli nakładki ma własną, osobno losowaną powierzchnię.
  for (let i = 0; i < DIRT_VARIANTS; i++) add(`dirt_${i}`, dirt(`dirt_${i}`));
  for (let i = 0; i < 2; i++) add(`path_${i}`, path(`path_${i}`));
  for (let i = 0; i < 3; i++) add(`grass_${i}`, grass(`grass_${i}`));
  for (let i = 0; i < 3; i++) add(`rock_${i}`, rockWall(`rock_${i}`));

  // Nakładki: piętnaście układów rogów (zero rogów to pusty kafel, którego nie ma
  // po co rysować) razy cztery fazy szumu. Fazę wybiera pozycja komórki, więc
  // nierówność krawędzi ma okres dwóch kafli zamiast jednego i długa granica nie
  // wpada w rytm widoczny jako powtarzany ząbek.
  for (const kind of ['grass', 'path', 'rock']) {
    for (let mask = 1; mask < 16; mask++) {
      for (let phase = 0; phase < PHASES; phase++) {
        const key = `ov_${kind}_${mask}_${phase}`;
        add(key, surfaceOverlay(key, kind, mask, phase));
      }
    }
  }

  add('decal_soot_0', sootSplat('decal_soot_0', 0.6));
  add('decal_soot_1', sootSplat('decal_soot_1', 0.32));
  for (let i = 0; i < 3; i++) add(`decal_tuft_${i}`, grassTuft(`decal_tuft_${i}`));
  // Cztery rozmiary, od zastoiny w koleinie po rozlewisko. Jeden rozmiar
  // powtórzony po całym placu widać od razu jako ten sam obrazek.
  // Stosunek osi trzymany blisko 1:1,7. Płaskie kałuże nie mają gdzie zmieścić
  // przejścia od nieba do dna i czytają się jako kreska.
  const PUDDLES = [
    { rx: 3.0, ry: 2.0 },
    { rx: 4.6, ry: 2.8 },
    { rx: 6.0, ry: 3.5 },
    { rx: 7.2, ry: 4.2 },
  ];
  PUDDLES.forEach((size, i) => add(`decal_puddle_${i}`, puddle(`decal_puddle_${i}`, size)));
  add('decal_rut', wheelRut('decal_rut'));
  for (let i = 0; i < 2; i++) add(`decal_crack_${i}`, crack(`decal_crack_${i}`));

  return entries;
}
