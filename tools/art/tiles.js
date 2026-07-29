// Kafle terenu, 16x16, perspektywa 3/4.
//
// Ściany składają się z dwóch kafli: `wall_top` (widok na koronę muru z góry)
// i `wall_face_*` (front muru pod nią). Dzięki temu mur ma grubość i widać,
// że gracz chodzi przed nim, a nie po nim.
//
// Teren placu nie używa autokafli — zamiast przejść między trawą a ziemią
// kładziemy jednolitą ziemię i sypiemy na wierzch dekale (kępki trawy, kałuże).
// Wygląda organiczniej i oszczędza kilkudziesięciu kafli narożnikowych.

import { Canvas } from './canvas.js';
import { c } from './palette.js';
import { makeRng, seedFrom } from './rng.js';

export const TILE = 16;

const rngFor = (name) => makeRng(seedFrom(name));

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

  // Otwór: 8x6 px pośrodku kafla, z ościeżnicą z belek.
  const x0 = 4;
  const y0 = 4;
  t.rect(x0 - 1, y0 - 1, 10, 8, c('wood', 0));       // rama
  t.rect(x0, y0, 8, 6, c('night', 0));               // ciemny prześwit
  // Górna krawędź otworu łapie światło z zewnątrz, dolna jest w cieniu.
  t.hline(x0, x0 + 7, y0, c('night', 1));
  t.hline(x0, x0 + 7, y0 + 5, c('soot', 0));
  // Krzyżak: dwie listwy dzielące otwór.
  t.vline(x0 + 3, y0, y0 + 5, c('wood', 1));
  t.hline(x0, x0 + 7, y0 + 2, c('wood', 1));
  // Parapet.
  t.hline(x0 - 1, x0 + 8, y0 + 6, c('wood', 3));
  t.speckle(rng, c('wood', 1), 0.1, { x: x0 - 1, y: y0 + 6, w: 10, h: 1 });
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

/** Ubita ziemia — baza całego placu. */
function dirt(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('earth', 2));
  t.speckle(rng, c('earth', 1), 0.18);
  t.speckle(rng, c('earth', 3), 0.12);
  t.speckle(rng, c('earth', 0), 0.05);
  // Kilka kamyków z podkreśleniem od spodu — drobny relief.
  for (let i = 0; i < 3; i++) {
    const x = rng.int(TILE - 1);
    const y = rng.int(TILE - 1);
    t.px(x, y, c('stone', 2));
    t.px(x, y + 1, c('earth', 0));
  }
  return t;
}

/** Wydeptana ścieżka — jaśniejsza i gładsza od reszty placu. */
function path(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('earth', 3));
  t.speckle(rng, c('earth', 2), 0.2);
  t.speckle(rng, c('earth', 4), 0.1);
  t.speckle(rng, c('stone', 1), 0.04);
  return t;
}

/** Trawa poza obrębem placu. */
function grass(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('foliage', 2));
  t.speckle(rng, c('foliage', 1), 0.2);
  t.speckle(rng, c('foliage', 3), 0.15);
  // Źdźbła: krótkie pionowe kreski z ciemniejszą podstawą.
  for (let i = 0; i < 6; i++) {
    const x = rng.int(TILE);
    const y = rng.between(2, TILE - 3);
    t.px(x, y, c('foliage', 4));
    t.px(x, y + 1, c('foliage', 1));
  }
  return t;
}

/** Lita skała — nieprzekraczalna granica mapy. */
function rockWall(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('stone', 0));
  t.speckle(rng, c('stone', 1), 0.25);
  t.speckle(rng, c('soot', 1), 0.15);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(TILE - 4);
    const y = rng.int(TILE - 4);
    const w = rng.between(3, 6);
    t.hline(x, x + w, y, c('stone', 2));
    t.hline(x, x + w, y + 1, c('soot', 0));
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

function puddle(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  const rx = rng.between(5, 7);
  const ry = rng.between(3, 4);
  t.ellipse(8, 9, rx, ry, c('night', 1));
  t.ellipse(8, 8, rx - 1, ry - 1, c('night', 2));
  // Refleks nieba na powierzchni.
  t.hline(6, 9, 7, c('night', 4));
  t.ellipse(8, 9, rx, ry, c('earth', 0), { fill: false });
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
  add('wall_top', wallTop('wall_top'));

  for (let i = 0; i < 2; i++) add(`roof_${i}`, roofShingles(`roof_${i}`, { offset: i }));
  add('roof_beam', roofBeam('roof_beam'));
  add('roof_ridge', roofRidge('roof_ridge'));

  for (let i = 0; i < 4; i++) add(`dirt_${i}`, dirt(`dirt_${i}`));
  for (let i = 0; i < 2; i++) add(`path_${i}`, path(`path_${i}`));
  for (let i = 0; i < 3; i++) add(`grass_${i}`, grass(`grass_${i}`));
  for (let i = 0; i < 3; i++) add(`rock_${i}`, rockWall(`rock_${i}`));

  add('decal_soot_0', sootSplat('decal_soot_0', 0.6));
  add('decal_soot_1', sootSplat('decal_soot_1', 0.32));
  for (let i = 0; i < 3; i++) add(`decal_tuft_${i}`, grassTuft(`decal_tuft_${i}`));
  for (let i = 0; i < 2; i++) add(`decal_puddle_${i}`, puddle(`decal_puddle_${i}`));
  add('decal_rut', wheelRut('decal_rut'));
  for (let i = 0; i < 2; i++) add(`decal_crack_${i}`, crack(`decal_crack_${i}`));

  return entries;
}
