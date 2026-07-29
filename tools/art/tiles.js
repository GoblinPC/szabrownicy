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

  t.speckle(rng, c('stone', 0), 0.06);
  t.speckle(rng, c('stone', 3), 0.05);
  if (soot > 0) {
    // Przygaszenie, nie zaprószenie: kryjące piksele sadzy czytały się z daleka
    // jako żwir rozsypany po podłodze zamiast jako osad wżarty w kamień.
    t.speckle(rng, [0x14, 0x10, 0x0f, 60], soot * 0.3);
    t.speckle(rng, [0x14, 0x10, 0x0f, 130], soot * 0.08);
  }
  return t;
}

/** Podłoga z desek — strefa warsztatowa przy stole i regałach. */
function woodFloor(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('wood', 2));
  for (let plank = 0; plank < 4; plank++) {
    const y = plank * 4;
    t.hline(0, TILE - 1, y, c('wood', 1));
    t.hline(0, TILE - 1, y + 1, c('wood', 3));
    // Styk desek co drugi rząd, żeby układ nie był regularny jak krata.
    const joint = plank % 2 === 0 ? 6 : 13;
    t.vline(joint, y, y + 3, c('wood', 1));
  }
  t.speckle(rng, c('wood', 1), 0.08); // słoje
  t.speckle(rng, c('wood', 4), 0.03);
  return t;
}

/** Front muru — kamienne bloki z zaprawą, przyciemnione przy dolnej krawędzi. */
function wallFace(name, { soot = 0 } = {}) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('stone', 2));

  for (let row = 0; row < 3; row++) {
    const y = row * 6 - 1;
    t.hline(0, TILE - 1, y, c('stone', 0));
    t.hline(0, TILE - 1, y + 1, c('stone', 3));
    const shift = row % 2 === 0 ? 5 : 12;
    t.vline(shift, Math.max(0, y), y + 5, c('stone', 0));
  }

  t.speckle(rng, c('stone', 1), 0.1);
  t.speckle(rng, c('stone', 3), 0.06);

  // Kontaktowy cień przy podłodze — mur nie "pływa" nad posadzką.
  t.hline(0, TILE - 1, TILE - 1, c('soot', 0));
  t.hline(0, TILE - 1, TILE - 2, c('soot', 1));

  if (soot > 0) {
    for (let x = 0; x < TILE; x++) {
      for (let y = 0; y < TILE; y++) {
        // Osad ciągnie się od góry w dół, jak dym po ścianie.
        if (rng.next() < soot * (1 - y / TILE) * 0.6) t.px(x, y, c('soot', 1));
      }
    }
  }
  return t;
}

/** Korona muru widziana z góry. */
function wallTop(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('stone', 1));
  t.hline(0, TILE - 1, 0, c('stone', 3)); // światło z góry na krawędzi
  t.hline(0, TILE - 1, TILE - 1, c('stone', 0));
  for (let x = 3; x < TILE; x += 6) t.vline(x, 1, TILE - 2, c('stone', 0));
  t.speckle(rng, c('stone', 2), 0.12);
  t.speckle(rng, c('stone', 0), 0.05);
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

  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    t.hline(0, TILE - 1, y, c('iron', 3));       // światło na krawędzi rzędu
    t.hline(0, TILE - 1, y + 1, c('iron', 2));
    t.hline(0, TILE - 1, y + 3, c('iron', 0));   // cień rzucany na rząd niżej
    // Styki płytek przesunięte co rząd — inaczej dach czyta się jak krata.
    const shift = (row + offset) % 2 === 0 ? 4 : 11;
    t.vline(shift, y + 1, y + 3, c('iron', 0));
    t.vline((shift + 8) % TILE, y + 1, y + 3, c('iron', 0));
  }

  t.speckle(rng, c('iron', 0), 0.08);
  t.speckle(rng, c('iron', 3), 0.04);
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

/**
 * Okap — dolna krawędź dachu. Wystaje poza mur i rzuca cień, dzięki czemu dach
 * czyta się jako coś położonego NAD budynkiem, a nie jako kolejna warstwa gruntu.
 */
function roofEave(name) {
  const rng = rngFor(name);
  const t = new Canvas(TILE, TILE);
  t.fill(c('iron', 1));
  t.hline(0, TILE - 1, 0, c('iron', 3));
  t.hline(0, TILE - 1, 3, c('iron', 0));
  t.rect(0, 4, TILE, 4, c('iron', 2));
  t.hline(0, TILE - 1, 8, c('wood', 2));     // deska okapowa
  t.hline(0, TILE - 1, 9, c('wood', 1));
  t.hline(0, TILE - 1, 10, c('soot', 0));    // cień rzucany na ścianę
  t.hline(0, TILE - 1, 11, `${c('soot', 0)}88`);
  t.speckle(rng, c('iron', 0), 0.06, { x: 0, y: 0, w: TILE, h: 8 });
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
  for (let i = 0; i < 2; i++) add(`floor_wood_${i}`, woodFloor(`floor_wood_${i}`));

  for (let i = 0; i < 3; i++) add(`wall_face_${i}`, wallFace(`wall_face_${i}`));
  add('wall_face_soot', wallFace('wall_face_soot', { soot: 0.5 }));
  add('wall_top', wallTop('wall_top'));

  for (let i = 0; i < 2; i++) add(`roof_${i}`, roofShingles(`roof_${i}`, { offset: i }));
  add('roof_beam', roofBeam('roof_beam'));
  add('roof_ridge', roofRidge('roof_ridge'));
  add('roof_eave', roofEave('roof_eave'));

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
