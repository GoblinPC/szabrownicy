// Definicja świata: kuźnia i plac przed nią.
//
// Mapa jest opisana w kodzie, a nie w edytorze — skoro grafikę i tak generujemy
// programistycznie, dodatkowy format pośredni tylko by przeszkadzał.
//
// Układ pionowy (w kaflach):
//   0-1    skalna granica
//   2-3    północna ściana kuźni (korona + front)
//   4-18   wnętrze hali
//   19     południowa ściana z bramą
//   20-33  plac na zewnątrz
//   34-35  skalna granica

import { makeRng, seedFrom } from '../util/rng.js';

export const TILE = 16;
export const MAP_W = 48;
export const MAP_H = 36;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

// Obrys budynku w kaflach.
const BUILDING = { x0: 5, x1: 42, y0: 2, y1: 19 };
// Prześwit bramy ma dokładnie dwa kafle, bo tyle samo ma otwór w jej rysunku.
const GATE = { x0: 23, x1: 24 };

export const INTERIOR_PX = {
  x: (BUILDING.x0 + 1) * TILE,
  y: (BUILDING.y0 + 2) * TILE,
  w: (BUILDING.x1 - BUILDING.x0 - 1) * TILE,
  h: (BUILDING.y1 - BUILDING.y0 - 2) * TILE,
};

export const SPAWN = { x: 384, y: 352 };

const SOLID_TILES = new Set(['wall_face', 'wall_top', 'rock']);

/** Nazwa kafla bez numeru wariantu — po niej rozpoznajemy kolizję. */
const baseName = (name) => name.replace(/_\d+$/, '').replace(/_soot\d?$/, '');

function buildGround() {
  const rng = makeRng(seedFrom('forge-ground'));
  const tiles = [];

  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      row.push(pickTile(x, y, rng));
    }
    tiles.push(row);
  }
  return tiles;
}

function pickTile(x, y, rng) {
  const border = x < 3 || x >= MAP_W - 3 || y < 2 || y >= MAP_H - 2;
  if (border) return `rock_${rng.int(3)}`;

  const inBuildingSpan = x >= BUILDING.x0 && x <= BUILDING.x1;

  // Ściany hali.
  if (inBuildingSpan) {
    if (y === BUILDING.y0) return 'wall_top';
    if (y === BUILDING.y0 + 1) {
      // Ściana nad paleniskiem jest zakopcona.
      return x >= 8 && x <= 16 ? 'wall_face_soot' : `wall_face_${rng.int(3)}`;
    }
    if (y === BUILDING.y1) {
      const inGate = x >= GATE.x0 && x <= GATE.x1;
      return inGate ? 'floor_stone_1' : 'wall_top';
    }
  }
  if (y > BUILDING.y0 && y < BUILDING.y1 && (x === BUILDING.x0 || x === BUILDING.x1)) {
    return `wall_face_${rng.int(3)}`;
  }

  // Wnętrze hali.
  if (inBuildingSpan && y > BUILDING.y0 + 1 && y < BUILDING.y1) {
    // Deski w kącie warsztatowym, sadza wokół paleniska.
    if (x >= 32 && x <= 40 && y >= 4 && y <= 9) return `floor_wood_${rng.int(2)}`;
    const nearHearth = Math.hypot(x - 11, y - 8) < 5;
    if (nearHearth) return rng.chance(0.6) ? 'floor_stone_soot' : 'floor_stone_soot2';
    return `floor_stone_${rng.int(4)}`;
  }

  // Trawa w szczelinach między budynkiem a skałą.
  if (y >= 2 && y < BUILDING.y1 && !inBuildingSpan) return `grass_${rng.int(3)}`;

  // Plac: wydeptana ścieżka od bramy do ogniska, reszta ubita ziemia.
  const onPath = Math.abs(x - 23.5) < 3.5 && y >= BUILDING.y1 && y < 28;
  if (onPath) return `path_${rng.int(2)}`;
  if (Math.hypot(x - 24, y - 27) < 4) return `path_${rng.int(2)}`;
  return `dirt_${rng.int(4)}`;
}

function buildDecals(tiles) {
  const rng = makeRng(seedFrom('forge-decals'));
  const decals = [];

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = tiles[y][x];
      const px = x * TILE;
      const py = y * TILE;

      if (tile.startsWith('floor_stone')) {
        // Sadza gęstnieje w stronę paleniska.
        const d = Math.hypot(x - 11, y - 8);
        if (d < 9 && rng.chance(0.35 - d * 0.03)) {
          decals.push({ key: rng.chance(0.5) ? 'decal_soot_0' : 'decal_soot_1', x: px, y: py });
        }
        if (rng.chance(0.05)) decals.push({ key: `decal_crack_${rng.int(2)}`, x: px, y: py });
      } else if (tile.startsWith('dirt')) {
        if (rng.chance(0.07)) decals.push({ key: `decal_tuft_${rng.int(3)}`, x: px, y: py });
        if (rng.chance(0.02)) decals.push({ key: `decal_puddle_${rng.int(2)}`, x: px, y: py });
      } else if (tile.startsWith('path')) {
        if (rng.chance(0.15)) decals.push({ key: 'decal_rut', x: px, y: py });
      } else if (tile.startsWith('grass')) {
        if (rng.chance(0.25)) decals.push({ key: `decal_tuft_${rng.int(3)}`, x: px, y: py });
      }
    }
  }
  return decals;
}

/**
 * Obiekty świata. `x`/`y` to punkt zaczepienia na dole pośrodku, `body` opisuje
 * prostokąt kolizji liczony od tego punktu w górę.
 */
function buildProps() {
  const p = [];
  const add = (key, x, y, body = null, extra = {}) => p.push({ key, x, y, body, ...extra });

  // --- Wnętrze kuźni ---
  add('hearth', 176, 142, { w: 32, h: 14 }, { noShadow: true });
  add('bellows', 236, 138, { w: 20, h: 8 });
  add('anvil', 384, 208, { w: 14, h: 8 });
  add('trough', 300, 250, { w: 20, h: 9 });
  add('workbench', 566, 148, { w: 30, h: 8 });
  add('shelf', 470, 118, { w: 26, h: 8 });
  add('rack', 646, 176, { w: 18, h: 8 });
  add('barrel', 120, 236, { w: 12, h: 8 });
  add('barrel', 136, 248, { w: 12, h: 8 });
  add('crate', 600, 252, { w: 14, h: 8 });
  add('crate', 618, 264, { w: 14, h: 8 });
  add('bucket', 332, 268, { w: 10, h: 6 });
  add('logs', 210, 286, { w: 22, h: 8 });
  add('crate', 156, 176, { w: 14, h: 8 });

  // Pochodnie na ścianach — druga warstwa oświetlenia wnętrza.
  // Obiekty, które same świecą, nie rzucają cienia: nie ma czego rzucać, bo
  // źródło światła znajduje się w nich samych.
  // Wspornik musi wypaść na licu muru: ściana północna to pas 48-64 px,
  // ściany boczne to kolumny 80-96 px i 672-688 px.
  add('torch', 296, 63, null, { noShadow: true });
  add('torch', 500, 63, null, { noShadow: true });
  add('torch', 660, 63, null, { noShadow: true });
  add('torch', 90, 190, null, { noShadow: true });
  add('torch', 678, 230, null, { noShadow: true });

  // Brama nie ma własnej kolizji — dziura w kaflach muru pokrywa się co do piksela
  // z prześwitem w jej rysunku, więc mur wystarczy.
  add('gate', 384, 320);

  // --- Plac ---
  add('campfire', 384, 434, { w: 16, h: 7 }, { noShadow: true });
  add('well', 184, 424, { w: 22, h: 10 });
  add('cart', 604, 396, { w: 28, h: 10 });
  add('board', 296, 372, { w: 20, h: 7 });
  add('logs', 664, 452, { w: 22, h: 8 });
  add('barrel', 250, 400, { w: 12, h: 8 });
  add('barrel', 264, 412, { w: 12, h: 8 });
  add('crate', 520, 452, { w: 14, h: 8 });
  add('bucket', 200, 444, { w: 10, h: 6 });

  // Drzewa i głazy przy krawędziach — domykają kadr. Pnie muszą stać po
  // wewnętrznej stronie skalnej granicy (y < 544, x między 60 a 706), inaczej
  // korony wychodzą poza mapę.
  for (const [x, y] of [[78, 392], [64, 470], [698, 404], [700, 488], [110, 534], [664, 536], [432, 538], [300, 532]]) {
    add('tree', x, y, { w: 8, h: 8 });
  }
  for (const [x, y] of [[140, 500], [640, 380], [340, 476], [470, 396], [560, 520], [220, 528]]) {
    add('boulder', x, y, { w: 14, h: 7 });
  }
  for (let x = 60; x < 200; x += 16) add('fence', x, 356, { w: 16, h: 5 });
  for (let x = 600; x < 720; x += 16) add('fence', x, 356, { w: 16, h: 5 });

  // --- Portale (na razie wygaszone) ---
  add('portal_off', 120, 512, { w: 26, h: 10 }, { portal: 'Arena', noShadow: true });
  add('portal_off', 384, 528, { w: 26, h: 10 }, { portal: 'Wyprawa', noShadow: true });
  add('portal_off', 652, 512, { w: 26, h: 10 }, { portal: 'Sklep', noShadow: true });

  return p;
}

/**
 * Źródła światła. `flicker` to siła migotania (0 = stabilne), `phase` rozsuwa
 * fazy, żeby pochodnie nie pulsowały zgodnie jak jedna.
 */
function buildLights() {
  return [
    { x: 176, y: 118, radius: 132, color: [255, 150, 48], intensity: 1.0, flicker: 0.22, phase: 0 },
    { x: 176, y: 130, radius: 62, color: [255, 220, 130], intensity: 0.9, flicker: 0.3, phase: 1.4 },
    { x: 296, y: 56, radius: 78, color: [255, 165, 60], intensity: 0.8, flicker: 0.18, phase: 2.1 },
    { x: 500, y: 56, radius: 78, color: [255, 165, 60], intensity: 0.8, flicker: 0.18, phase: 3.7 },
    { x: 660, y: 56, radius: 78, color: [255, 165, 60], intensity: 0.8, flicker: 0.18, phase: 5.2 },
    { x: 90, y: 183, radius: 72, color: [255, 165, 60], intensity: 0.75, flicker: 0.2, phase: 0.9 },
    { x: 678, y: 223, radius: 72, color: [255, 165, 60], intensity: 0.75, flicker: 0.2, phase: 4.4 },
    { x: 384, y: 426, radius: 104, color: [255, 158, 55], intensity: 0.95, flicker: 0.26, phase: 2.8 },
    { x: 120, y: 496, radius: 42, color: [79, 195, 247], intensity: 0.45, flicker: 0.1, phase: 1.1 },
    { x: 384, y: 512, radius: 42, color: [79, 195, 247], intensity: 0.45, flicker: 0.1, phase: 3.3 },
    { x: 652, y: 496, radius: 42, color: [79, 195, 247], intensity: 0.45, flicker: 0.1, phase: 5.5 },
  ];
}

/** Animowane płomienie doklejone do paleniska, pochodni i ogniska. */
function buildFlames() {
  // `y` to dolna krawędź płomienia, `depth` musi być większe niż obiektu, na
  // którym płonie — inaczej palenisko zasłania własny ogień.
  return [
    { anim: 'flame_big', x: 176, y: 137, depth: 143 },
    { anim: 'flame_mid', x: 384, y: 429, depth: 435 },
    { anim: 'flame_small', x: 296, y: 53, depth: 64 },
    { anim: 'flame_small', x: 500, y: 53, depth: 64 },
    { anim: 'flame_small', x: 660, y: 53, depth: 64 },
    { anim: 'flame_small', x: 90, y: 180, depth: 191 },
    { anim: 'flame_small', x: 678, y: 220, depth: 231 },
  ];
}

/**
 * Źródła dźwięku otoczenia. Osobne od świateł, bo zasięg słyszalności ognia
 * jest znacznie większy niż zasięg jego blasku — palenisko słychać z drugiego
 * końca hali, choć oświetla tylko swój kąt.
 */
function buildSoundSources() {
  return [
    { type: 'fire', x: 176, y: 130, radius: 260, strength: 1.0 },  // palenisko
    { type: 'fire', x: 384, y: 426, radius: 220, strength: 0.75 }, // ognisko na placu
    { type: 'fire', x: 296, y: 56, radius: 110, strength: 0.3 },
    { type: 'fire', x: 500, y: 56, radius: 110, strength: 0.3 },
    { type: 'fire', x: 660, y: 56, radius: 110, strength: 0.3 },
    { type: 'fire', x: 90, y: 183, radius: 110, strength: 0.3 },
    { type: 'fire', x: 678, y: 223, radius: 110, strength: 0.3 },
  ];
}

/**
 * Dach hali. Osobna warstwa kafli rysowana NAD postaciami — z zewnątrz zasłania
 * wnętrze, a gdy gracz wejdzie pod spód, zanika.
 *
 * Kryje cały obrys budynku razem z murami, bo dach wsparty na koronie muru musi
 * ją przykrywać — inaczej widać szew między krawędzią dachu a ścianą.
 */
export const ROOF = {
  x0: BUILDING.x0,
  x1: BUILDING.x1,
  y0: BUILDING.y0,
  y1: BUILDING.y1,
};

/** Prostokąt dachu w pikselach — po nim poznajemy, czy gracz jest pod dachem. */
export const ROOF_PX = {
  x: ROOF.x0 * TILE,
  y: ROOF.y0 * TILE,
  w: (ROOF.x1 - ROOF.x0 + 1) * TILE,
  h: (ROOF.y1 - ROOF.y0 + 1) * TILE,
};

/**
 * Wnęka wejściowa: dach jest wycięty nad bramą i o kafel po bokach, więc z placu
 * widać, że tam się wchodzi. Bez tego budynek był zamkniętą płytą i nie dało się
 * odgadnąć, gdzie jest wejście.
 */
const PORCH = { x0: GATE.x0 - 1, x1: GATE.x1 + 1, y0: 17, y1: 19 };

function buildRoof() {
  const rng = makeRng(seedFrom('forge-roof'));
  const tiles = [];
  // Kalenica biegnie w poziomie środkiem hali — hala jest szersza niż głębsza.
  const ridge = Math.round((ROOF.y0 + ROOF.y1) / 2);

  for (let y = ROOF.y0; y <= ROOF.y1; y++) {
    for (let x = ROOF.x0; x <= ROOF.x1; x++) {
      const inPorch = x >= PORCH.x0 && x <= PORCH.x1 && y >= PORCH.y0 && y <= PORCH.y1;
      if (inPorch) continue;

      let key;
      // Okap na dolnej krawędzi dachu oraz na krawędziach wnęki — to on sprawia,
      // że dach czyta się jako coś nad budynkiem, a nie kolejna warstwa gruntu.
      const atPorchEdge = y === PORCH.y0 - 1 && x >= PORCH.x0 - 1 && x <= PORCH.x1 + 1;
      if (y === ROOF.y1 || atPorchEdge) key = 'roof_eave';
      else if (y === ridge) key = 'roof_ridge';
      else if ((x - ROOF.x0) % 7 === 3) key = 'roof_beam';   // krokwie co siedem kafli
      else key = `roof_${rng.int(2)}`;
      tiles.push({ key, x: x * TILE, y: y * TILE });
    }
  }
  return tiles;
}

/** Rodzaj gruntu pod podanym punktem — decyduje, jak brzmi krok. */
export function surfaceAt(world, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 'dirt';
  const tile = world.tiles[ty][tx];
  if (tile.startsWith('floor_wood')) return 'wood';
  if (tile.startsWith('floor_stone')) return 'stone';
  if (tile.startsWith('grass')) return 'grass';
  return 'dirt';
}

export function buildWorld() {
  const tiles = buildGround();
  const props = buildProps();

  // Siatka kolizji: najpierw kafle, potem prostokąty pod obiektami.
  const solid = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push(SOLID_TILES.has(baseName(tiles[y][x])));
    solid.push(row);
  }

  const bodies = props
    .filter((prop) => prop.body)
    .map((prop) => ({
      x0: prop.x - prop.body.w / 2,
      x1: prop.x + prop.body.w / 2,
      y0: prop.y - prop.body.h,
      y1: prop.y,
    }));

  return {
    tiles,
    decals: buildDecals(tiles),
    roof: buildRoof(),
    props,
    lights: buildLights(),
    flames: buildFlames(),
    soundSources: buildSoundSources(),
    solid,
    bodies,
  };
}

/** Czy prostokąt stóp gracza mieści się w przechodnim terenie. */
export function isWalkable(world, x0, y0, x1, y1) {
  const tx0 = Math.floor(x0 / TILE);
  const tx1 = Math.floor(x1 / TILE);
  const ty0 = Math.floor(y0 / TILE);
  const ty1 = Math.floor(y1 / TILE);

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
      if (world.solid[ty][tx]) return false;
    }
  }
  for (const b of world.bodies) {
    if (x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1) return false;
  }
  return true;
}
