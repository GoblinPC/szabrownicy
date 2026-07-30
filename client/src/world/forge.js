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
import { field, scatter, REGIONS, inClearing } from './terrain.js';

/**
 * Kukła treningowa na placu, na prawo od bramy.
 *
 * Miejsce **sprawdzone z listą obiektów**, nie wybrane na oko: pierwsza próba
 * (456, 404) wchodziła wprost na głaz stojący na (470, 396). Najbliżsi sąsiedzi
 * tego punktu to głaz 50 px w lewo, skrzynia 52 px w dół i wóz 84 px w prawo.
 *
 * Trzymana w tym pliku, a nie po stronie serwera, bo korzystają z niego obie
 * strony i pozycja celu musi być u nich identyczna.
 */
export const TRAINING_DUMMY = { x: 520 + 56 * 16, y: 400 + 8 * 16 };

export const TILE = 16;

// Miasto ma **własny układ współrzędnych** i to jest tu sedno.
//
// Cała kuźnia — mury, palenisko, okna, każdy prop — jest opisana liczbami
// wpisanymi na sztywno w siatce 48×36. Powiększenie świata przez przeliczenie
// tych liczb oznaczałoby przejrzenie każdej z nich i pomyłkę w co dziesiątej.
// Zamiast tego miasto powstaje **dalej w swoim układzie**, a na wielką mapę
// wchodzi w całości, przesunięte o `CITY_OX`/`CITY_OY`. Jedno miejsce
// przesunięcia zamiast dwustu.
const CITY_W = 48;
const CITY_H = 36;
export const CITY_OX = 56;
export const CITY_OY = 8;
const OFF_X = CITY_OX * TILE;
const OFF_Y = CITY_OY * TILE;

export const MAP_W = 160;
export const MAP_H = 120;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Przesunięcie punktu z układu miasta na wielką mapę. */
const shift = (p) => ({ ...p, x: p.x + OFF_X, y: p.y + OFF_Y });

// Obrys budynku w kaflach.
const BUILDING = { x0: 5, x1: 42, y0: 2, y1: 19 };
// Prześwit bramy ma dokładnie dwa kafle, bo tyle samo ma otwór w jej rysunku.
const GATE = { x0: 23, x1: 24 };
// Kamienny przedpiecek wokół paleniska — jedyne miejsce w hali bez desek.
const APRON = { x0: 8, x1: 15, y0: 6, y1: 11 };

/**
 * Okienka w ścianach. Każde opisane jest **odcinkiem otworu** (`a` i `b`)
 * w pikselach świata — z niego liczy się klin widoczności: co widać przez okno,
 * zależy od tego, gdzie stoi gracz, dokładnie jak przy rzucaniu cienia.
 *
 * Ten sam mechanizm obsłuży potem okna w domkach graczy, więc opis okna jest
 * czystą geometrią, bez wiedzy o tym, że chodzi o karczmę.
 */
// Okien w ścianie północnej nie ma celowo: stoi ona dwa kafle od krawędzi mapy,
// a rzędy 0-1 to skalna grań — przez takie okno widać wprost skałę i nic więcej.
// Ściana południowa jest najciekawsza, bo za nią jest plac.
const WINDOW_TILES = [
  { x: BUILDING.x0, y: 6, side: 'left' },
  { x: BUILDING.x0, y: 11, side: 'left' },
  { x: BUILDING.x0, y: 16, side: 'left' },
  { x: BUILDING.x1, y: 6, side: 'right' },
  { x: BUILDING.x1, y: 11, side: 'right' },
  { x: BUILDING.x1, y: 16, side: 'right' },
  { x: 19, y: BUILDING.y1, side: 'bottom' },
  { x: 28, y: BUILDING.y1, side: 'bottom' },
  { x: 12, y: BUILDING.y1, side: 'bottom' },
  { x: 35, y: BUILDING.y1, side: 'bottom' },
];

const WINDOW_KEYS = new Set(WINDOW_TILES.map((w) => `${w.x},${w.y}`));

export const WINDOWS = WINDOW_TILES.map((w) => {
  // Otwor w rysunku kafla ma 12 px, liczac od 2 do 14. Wynik od razu przesuwamy
  // na wielka mape, bo okna sa uzywane wylacznie w jej ukladzie.
  if (w.side === 'bottom') {
    const y = OFF_Y + (w.y + 1) * TILE;
    return { a: { x: OFF_X + w.x * TILE + 2, y }, b: { x: OFF_X + w.x * TILE + 14, y } };
  }
  const x = OFF_X + (w.side === 'left' ? w.x * TILE : (w.x + 1) * TILE);
  return { a: { x, y: OFF_Y + w.y * TILE + 2 }, b: { x, y: OFF_Y + w.y * TILE + 14 } };
});

/**
 * Miasto — **cała strefa bezpieczna**: hala kuźni razem z placem.
 *
 * Decyzja z 2026-07-30: PvP zaczyna się dopiero **za murami**, po wyjściu jedną
 * z trzech bram (południe, wschód, zachód). Miasto jest miejscem, do którego się
 * wraca: handel, odpoczynek, pokój w karczmie.
 *
 * Prostokąt obejmuje dziś cały grywalny teren, bo cały grywalny teren to na razie
 * miasto. Gdy dojdzie świat za bramami, znajdzie się **poza** tym prostokątem
 * i stanie się wrogi bez zmiany choćby jednej linii — o to w tym opisie chodzi.
 */
export const CITY_PX = {
  x: OFF_X + 3 * TILE,
  y: OFF_Y + 2 * TILE,
  w: (CITY_W - 6) * TILE,
  h: (CITY_H - 4) * TILE,
};

export const INTERIOR_PX = {
  x: OFF_X + (BUILDING.x0 + 1) * TILE,
  y: OFF_Y + (BUILDING.y0 + 2) * TILE,
  w: (BUILDING.x1 - BUILDING.x0 - 1) * TILE,
  h: (BUILDING.y1 - BUILDING.y0 - 2) * TILE,
};

/**
 * Miejsce wejścia do gry i odrodzenia po śmierci — **wewnątrz hali**, kilka kafli
 * za bramą.
 *
 * Wewnątrz, a nie na placu, i to jest decyzja o rozgrywce, nie o wygodzie: punkt
 * odrodzenia leżący na otwartym terenie zaprasza do kampienia go. Tu odrodzony
 * wychodzi ze strefy bezpiecznej **wtedy, kiedy sam zdecyduje**, a czekający na
 * niego stoi za bramą i jest widoczny.
 *
 * Przechodniość sprawdzona `isWalkable`, nie policzona z siatki na oko.
 */
export const SPAWN = { x: 384 + 56 * 16, y: 288 + 8 * 16 };

/**
 * Drzewa na placu, w pikselach (podstawa pnia).
 *
 * Wyniesione tu z `buildProps()`, bo potrzebuje ich też `pickTile()`: **pod
 * drzewami rośnie trawa**. Bez tego cały plac był ubitą ziemią, kępki trawy stały
 * na brązowym i nie było ich widać — dokładnie tak, jak zgłosił użytkownik.
 *
 * Pnie muszą stać po wewnętrznej stronie skalnej granicy (y < 544, x w 60–706),
 * inaczej korony wychodzą poza mapę.
 */
const TREES = [[78, 392], [64, 470], [698, 404], [700, 488], [110, 534], [664, 536], [432, 538], [300, 532]];

/** Odległość w kaflach do najbliższego drzewa. */
function nearestTree(x, y) {
  let best = Infinity;
  for (const [tx, ty] of TREES) {
    best = Math.min(best, Math.hypot(x - tx / TILE, y - ty / TILE));
  }
  return best;
}

const SOLID_TILES = new Set(['wall_face', 'wall_window', 'wall_top', 'wall_top_window', 'rock']);

/** Nazwa kafla bez numeru wariantu — po niej rozpoznajemy kolizję. */
const baseName = (name) => name.replace(/_\d+$/, '').replace(/_soot\d?$/, '');

function buildGround() {
  const rng = makeRng(seedFrom('forge-ground'));
  const tiles = [];

  for (let y = 0; y < CITY_H; y++) {
    const row = [];
    for (let x = 0; x < CITY_W; x++) {
      row.push(pickTile(x, y, rng));
    }
    tiles.push(row);
  }
  smoothGreen(tiles, rng);
  return tiles;
}

/**
 * Zasypuje samotne kafle na granicy trawy z ziemią.
 *
 * Losowanie kafel po kaflu zostawia pojedyncze brązowe kwadraty w środku trawy
 * i odwrotnie. Same w sobie nie byłyby groźne, ale każdy taki kafel dostaje
 * obwódkę z czterech stron i przez to czyta się jako celowa łata, a nie jako
 * nierówność terenu. Jeden przebieg wystarczy — chodzi o usunięcie osobliwości,
 * nie o wygładzenie krawędzi, która ma zostać poszarpana.
 */
function smoothGreen(tiles, rng) {
  const isGreen = (x, y) => Boolean(tiles[y]?.[x]?.startsWith('grass'));
  const changes = [];

  for (let y = 0; y < CITY_H; y++) {
    for (let x = 0; x < CITY_W; x++) {
      const tile = tiles[y][x];
      const grassHere = tile.startsWith('grass');
      if (!grassHere && !tile.startsWith('dirt')) continue;

      const around = Number(isGreen(x - 1, y)) + Number(isGreen(x + 1, y))
        + Number(isGreen(x, y - 1)) + Number(isGreen(x, y + 1));

      if (!grassHere && around >= 3) changes.push([x, y, `grass_${rng.int(3)}`]);
      else if (grassHere && around === 0) changes.push([x, y, `dirt_${rng.int(4)}`]);
    }
  }

  // Podmiana dopiero po przejrzeniu całości — inaczej kafel zmieniony na początku
  // wiersza wpływa na decyzję o kaflu obok i łata się rozlewa.
  for (const [x, y, tile] of changes) tiles[y][x] = tile;
}

function pickTile(x, y, rng) {
  const border = x < 3 || x >= CITY_W - 3 || y < 2 || y >= CITY_H - 2;
  if (border) return `rock_${rng.int(3)}`;

  const inBuildingSpan = x >= BUILDING.x0 && x <= BUILDING.x1;

  // Ściany hali.
  if (inBuildingSpan) {
    if (y === BUILDING.y0) return 'wall_top';
    if (y === BUILDING.y0 + 1) {
      if (WINDOW_KEYS.has(`${x},${y}`)) return 'wall_window';
      // Ściana nad paleniskiem jest zakopcona.
      return x >= 8 && x <= 16 ? 'wall_face_soot' : `wall_face_${rng.int(3)}`;
    }
    if (y === BUILDING.y1) {
      const inGate = x >= GATE.x0 && x <= GATE.x1;
      if (inGate) return 'floor_stone_1';
      return WINDOW_KEYS.has(`${x},${y}`) ? 'wall_top_window' : 'wall_top';
    }
  }
  if (y > BUILDING.y0 && y < BUILDING.y1 && (x === BUILDING.x0 || x === BUILDING.x1)) {
    if (WINDOW_KEYS.has(`${x},${y}`)) return 'wall_window';
    return `wall_face_${rng.int(3)}`;
  }

  // Wnętrze hali.
  if (inBuildingSpan && y > BUILDING.y0 + 1 && y < BUILDING.y1) {
    // Kamień tylko na przedpiecku, gdzie ma sens ogniowy — na desce pod kuźnią
    // nikt by ognia nie rozpalał. Reszta hali to deski.
    //
    // Krawędź przedpiecka jest NIEREGULARNA: część kafli brzegowych wypada,
    // część wychodzi poza obrys. Równy prostokąt czytał się jak wklejona łata.
    const inApron = x >= APRON.x0 && x <= APRON.x1 && y >= APRON.y0 && y <= APRON.y1;
    const onEdge = inApron
      && (x === APRON.x0 || x === APRON.x1 || y === APRON.y0 || y === APRON.y1);

    if (inApron && !(onEdge && rng.chance(0.4))) {
      const core = x >= APRON.x0 + 1 && x <= APRON.x1 - 1
        && y >= APRON.y0 + 1 && y <= APRON.y1 - 1;
      if (core) return rng.chance(0.6) ? 'floor_stone_soot' : 'floor_stone_soot2';
      return `floor_stone_${rng.int(4)}`;
    }
    // Pojedyncze płyty wysunięte na deski — rozmywają linię styku.
    const besideApron = x >= APRON.x0 - 1 && x <= APRON.x1 + 1
      && y >= APRON.y0 - 1 && y <= APRON.y1 + 1;
    if (besideApron && rng.chance(0.3)) return `floor_stone_${rng.int(4)}`;

    return `floor_wood_${(x + y) % 3}`;
  }

  // Trawa w szczelinach między budynkiem a skałą.
  if (y >= 2 && y < BUILDING.y1 && !inBuildingSpan) return `grass_${rng.int(3)}`;

  // Kamienny próg po zewnętrznej stronie bramy. Bez niego wyjście z hali
  // rozmywało się wprost w ubitej ziemi i nie było widać, gdzie kończy się
  // budynek, a zaczyna dwór.
  if (x >= GATE.x0 - 1 && x <= GATE.x1 + 1 && y === BUILDING.y1 + 1) {
    return `floor_stone_${rng.int(4)}`;
  }

  // Plac: wydeptana ścieżka od bramy do ogniska, reszta ubita ziemia.
  const onPath = Math.abs(x - 23.5) < 3.5 && y >= BUILDING.y1 && y < 28;
  if (onPath) return `path_${rng.int(2)}`;
  if (Math.hypot(x - 24, y - 27) < 4) return `path_${rng.int(2)}`;

  // Trawa tam, gdzie ludzie nie chodzą: pod drzewami i wzdłuż skalnej granicy.
  //
  // Środek placu zostaje ubitą ziemią i to jest sens tego układu — plac jest
  // wydeptany dlatego, że coś go wydeptuje, a pod drzewem i przy skale nikt nie
  // staje. Granica jest rozmyta losowo, żeby nie było widać okręgu ani paska.
  const toTree = nearestTree(x, y);
  const toEdge = Math.min(x - 3, CITY_W - 4 - x, CITY_H - 3 - y);
  const green = Math.max(
    1 - toTree / 4.2,
    y > BUILDING.y1 + 2 ? 1 - toEdge / 3.4 : 0
  );
  if (green > 0 && rng.chance(green * 0.92)) return `grass_${rng.int(3)}`;

  return `dirt_${rng.int(4)}`;
}

/**
 * Ślady na podłożu.
 *
 * Zwraca **dwie listy**, i to jest istotne: `decals` wypalamy raz w jedną wielką
 * teksturę podłoża, a `tufts` zostają osobnymi obiektami, bo kępki trawy gną się
 * pod przechodzącą postacią. Wypalone w teksturę nie dałyby się ruszyć, a robienie
 * sprite'a z każdej plamy sadzy byłoby marnotrawstwem — sadza się nie rusza.
 */
// Strona sąsiada i przesunięcie do niego. Nazwa opisuje, gdzie leży TRAWA,
// bo obwódkę rysujemy od tej właśnie strony kafla ziemi.
const EDGES = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

function buildDecals(tiles) {
  const rng = makeRng(seedFrom('forge-decals'));
  const decals = [];
  const tufts = [];

  for (let y = 0; y < CITY_H; y++) {
    for (let x = 0; x < CITY_W; x++) {
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
      } else if (tile.startsWith('floor_wood')) {
        // Sadza wysypana z paleniska na deski. To ona rozmywa styk kamiennego
        // przedpiecka z podłogą — bez niej granica jest linią prostą.
        const d = Math.hypot(x - 11.5, y - 8.5);
        if (d < 10 && rng.chance(0.3 - d * 0.026)) {
          decals.push({ key: rng.chance(0.5) ? 'decal_soot_0' : 'decal_soot_1', x: px, y: py });
        }
      } else if (tile.startsWith('dirt')) {
        if (rng.chance(0.07)) tufts.push({ key: `decal_tuft_${rng.int(3)}`, x: px, y: py });
        // Małe kałuże są częstsze od dużych — rozlewisko na pół kafla jest
        // wydarzeniem, zastoina w kolenie nie.
        if (rng.chance(0.035)) {
          const size = rng.chance(0.55) ? rng.int(2) : 2 + rng.int(2);
          decals.push({ key: `decal_puddle_${size}`, x: px, y: py });
        }
        // Postrzępiona obwódka trawy wchodząca na ziemię od strony sąsiada.
        //
        // Kładziemy ją na kaflu ZIEMI, nie trawy — inaczej trzeba by kompletu
        // kafli przejściowych na każdą kombinację sąsiadów, czyli szesnastu sztuk
        // zamiast ośmiu śladów. Bez tego łata trawy ma prostą krawędź co
        // szesnaście pikseli i czyta się jako szachownica, a nie jako teren.
        for (const [side, dx, dy] of EDGES) {
          const neighbour = tiles[y + dy]?.[x + dx];
          if (!neighbour?.startsWith('grass')) continue;
          decals.push({ key: `decal_fringe_${side}_${rng.int(2)}`, x: px, y: py });
        }
      } else if (tile.startsWith('path')) {
        if (rng.chance(0.15)) decals.push({ key: 'decal_rut', x: px, y: py });
      } else if (tile.startsWith('grass')) {
        // Gęsto, bo to jedyne miejsce, gdzie kępki mają się w co wtopić — i to
        // one, gnąc się pod postacią, robią cały efekt żywej trawy.
        if (rng.chance(0.55)) tufts.push({ key: `decal_tuft_${rng.int(3)}`, x: px, y: py });
      }
    }
  }
  return { decals, tufts };
}

/**
 * Obiekty świata. `x`/`y` to punkt zaczepienia na dole pośrodku, `body` opisuje
 * prostokąt kolizji liczony od tego punktu w górę.
 */
function buildProps() {
  const p = [];
  // Wszystkie współrzędne poniżej są **w układzie miasta**. Przesunięcie na
  // wielką mapę robimy tu, w jednym miejscu — inaczej trzeba by poprawić
  // sześćdziesiąt wpisów i pomylić się w kilku.
  const add = (key, x, y, body = null, extra = {}) =>
    p.push({ key, x: x + OFF_X, y: y + OFF_Y, body, ...extra });

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
  for (const [x, y] of TREES) {
    add('tree', x, y, { w: 8, h: 8 });
  }
  for (const [x, y] of [[140, 500], [640, 380], [340, 476], [470, 396], [560, 520], [220, 528]]) {
    add('boulder', x, y, { w: 14, h: 7 });
  }
  for (let x = 60; x < 200; x += 16) add('fence', x, 356, { w: 16, h: 5 });
  for (let x = 600; x < 720; x += 16) add('fence', x, 356, { w: 16, h: 5 });

  // Portali tu nie ma i nie będzie. Decyzja z 2026-07-30: jedna wielka otwarta
  // mapa jak w Tibii, wszystko do przejścia na piechotę. Stojące tu wcześniej
  // słupki były zaszłością po pomyśle osobnych stref za przejściami.

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
    // Trzy niebieskie światła przy portalach zeszły razem z nimi. Jedynym źródłem
    // światła na placu jest teraz ognisko — i tak ma zostać, dopóki nie stanie tam
    // coś, co naprawdę świeci.
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
// Dach kończy się WYŻEJ niż mur południowy. Gdy sięgał aż na koronę muru,
// gracz podchodzący do niego od placu wchodził głową pod wystający okap i było
// to widać jako niebieski pas nad postacią. Do muru ma się po prostu podchodzić.
export const ROOF = {
  x0: BUILDING.x0,
  x1: BUILDING.x1,
  y0: BUILDING.y0,
  y1: BUILDING.y1 - 2,
};

/** Prostokąt samego rysunku dachu — używany wyłącznie do jego narysowania. */
export const ROOF_PX = {
  x: OFF_X + ROOF.x0 * TILE,
  y: OFF_Y + ROOF.y0 * TILE,
  w: (ROOF.x1 - ROOF.x0 + 1) * TILE,
  h: (ROOF.y1 - ROOF.y0 + 1) * TILE,
};

/**
 * Obrys całego budynku razem z murami. **To po nim poznajemy, czy gracz jest
 * w środku** — i to jest osobna rzecz niż `ROOF_PX`.
 *
 * Pomylenie tych dwóch kosztowało błąd: gdy dach skrócono o dwa kafle, żeby nie
 * wystawał nad mur, test wejścia skrócił się razem z nim i trzeba było wejść
 * dwa kafle w głąb hali, zanim widoczność się przełączyła. Próg jest przy
 * bramie, a nie tam, gdzie akurat kończy się rysunek dachu.
 */
export const BUILDING_PX = {
  x: OFF_X + BUILDING.x0 * TILE,
  y: OFF_Y + BUILDING.y0 * TILE,
  w: (BUILDING.x1 - BUILDING.x0 + 1) * TILE,
  h: (BUILDING.y1 - BUILDING.y0 + 1) * TILE,
};

/**
 * Dach jest **jednolity i szczelny** — bez wnęki, bez świetlika, bez pasa nad
 * wejściem. Dwie próby oznaczenia tam wejścia okazały się gorsze od niczego:
 *
 * - wycięcie dachu na wylot (cztery kafle od góry do dołu) odsłaniało wnętrze
 *   hali stojącemu na placu, co psuło też ograniczoną widoczność;
 * - pas innego pokrycia na całej długości czytał się jak przypadkowa łata.
 *
 * Oznaczenie jest zbędne, bo dach kończy się dwa kafle nad murem: łuk bramy
 * i tak jest widoczny z placu i on sam wskazuje wejście.
 */

function buildRoof() {
  const rng = makeRng(seedFrom('forge-roof'));
  const tiles = [];
  // Kalenica biegnie w poziomie środkiem hali — hala jest szersza niż głębsza.
  const ridge = Math.round((ROOF.y0 + ROOF.y1) / 2);

  for (let y = ROOF.y0; y <= ROOF.y1; y++) {
    for (let x = ROOF.x0; x <= ROOF.x1; x++) {
      let key;
      if (y === ridge) key = 'roof_ridge';
      // Krokwie przesunięte o trzy kafle w lewo — przy poprzednim rozstawie
      // jedna z nich trafiała dokładnie w oś bramy i ucinała się na jej krawędzi.
      else if ((x - ROOF.x0) % 7 === 0) key = 'roof_beam';
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

/**
 * Składa wielką mapę: teren za murami, a na nim miasto w całości.
 *
 * Miasto jest generowane we własnym układzie 48×36 i **wstawiane** przesunięte,
 * zamiast przeliczać dwieście wpisanych na sztywno współrzędnych. Jedno miejsce
 * przesunięcia zamiast dwustu okazji do pomyłki.
 */
function composeTiles() {
  const rng = makeRng(seedFrom('teren'));
  const tiles = [];

  // Warstwa 1: biomy. Trzy obszary za trzema bramami, rozdzielone tym, po której
  // stronie miasta leży dany punkt.
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      // Nieprzekraczalna grań na krawędzi świata — dopóki mapa nie rośnie dalej.
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) {
        row.push(`rock_${rng.int(3)}`);
        continue;
      }
      row.push(terrainTile(x, y, rng));
    }
    tiles.push(row);
  }

  // Miasto wchodzi na wierzch, w całości.
  const city = buildGround();
  for (let y = 0; y < CITY_H; y++) {
    for (let x = 0; x < CITY_W; x++) tiles[CITY_OY + y][CITY_OX + x] = city[y][x];
  }

  carveGates(tiles, rng);
  return tiles;
}

/**
 * Kafel terenu poza miastem — z biomu i z miękkiej plamy gęstości.
 *
 * Biom bierze się z tego, po której stronie miasta leży punkt, bo tak samo
 * bierze się z tego brama, którą się tam dociera. Gracz uczy się „na zachód są
 * skały" po jednym wyjściu i to jest cała nawigacja, jakiej potrzeba.
 */
function terrainTile(x, y, rng) {
  const region = regionAt(x, y);
  const n = field(x, y, 3.7);

  // Droga: pas prowadzący od bramy w głąb obszaru. Powstaje **przed** obiektami
  // i to ona decyduje, co gdzie stoi.
  if (onRoad(x, y)) return `path_${rng.int(2)}`;

  if (region === 'skalisko') {
    if (n > 0.62) return `rock_${rng.int(3)}`;
    return n > 0.4 ? `dirt_${rng.int(4)}` : `grass_${rng.int(3)}`;
  }
  if (region === 'mokradla') {
    return n > 0.52 ? `dirt_${rng.int(4)}` : `grass_${rng.int(3)}`;
  }
  // Las i okolice miasta: przewaga trawy, łysiny ubitej ziemi.
  return n > 0.68 ? `dirt_${rng.int(4)}` : `grass_${rng.int(3)}`;
}

/** Który obszar leży w tym punkcie. */
export function regionAt(x, y) {
  if (y > CITY_OY + CITY_H) return 'las';
  if (x < CITY_OX) return 'skalisko';
  if (x > CITY_OX + CITY_W) return 'mokradla';
  return 'przedmiescie';
}

// Bramy w murze miasta: południowa, zachodnia i wschodnia. Każda ma dwa kafle
// prześwitu, tak samo jak brama kuźni — jedna szerokość w całej grze.
export const GATES = [
  { key: 'south', x: CITY_OX + 23, y: CITY_OY + CITY_H - 2, w: 2, h: 2 },
  { key: 'west', x: CITY_OX, y: CITY_OY + 26, w: 3, h: 2 },
  { key: 'east', x: CITY_OX + CITY_W - 3, y: CITY_OY + 26, w: 3, h: 2 },
];

/** Wycina prześwity w skalnej granicy miasta i kładzie przed nimi próg. */
function carveGates(tiles, rng) {
  for (const gate of GATES) {
    for (let dy = 0; dy < gate.h; dy++) {
      for (let dx = 0; dx < gate.w; dx++) {
        tiles[gate.y + dy][gate.x + dx] = `path_${rng.int(2)}`;
      }
    }
  }
}

/**
 * Czy punkt leży na drodze wychodzącej z bramy.
 *
 * Droga jest **kręgosłupem obszaru**, nie ozdobą: powstaje przed obiektami,
 * a wszystko inne układa się względem niej. Wyjście z miasta prowadzi na drogę,
 * a nie w losowy krzak.
 */
function onRoad(x, y) {
  // Południowa: prosto w dół od bramy, z lekkim wężykiem.
  const southX = CITY_OX + 24 + Math.round(Math.sin(y * 0.09) * 4);
  if (y > CITY_OY + CITY_H - 2 && Math.abs(x - southX) < 2) return true;
  // Zachodnia i wschodnia: w bok od bramy, też wężykiem.
  const sideY = CITY_OY + 27 + Math.round(Math.sin(x * 0.08) * 3);
  if (x < CITY_OX && Math.abs(y - sideY) < 2) return true;
  if (x > CITY_OX + CITY_W - 1 && Math.abs(y - sideY) < 2) return true;
  return false;
}

/**
 * Obiekty poza murami: drzewa, głazy i krzaki.
 *
 * Warstwa czwarta, więc **wszystko, co tu powstaje, zależy od poprzednich**.
 * Gęstość bierze się z biomu i z miękkiej plamy szumu, a rozstawienie
 * z próbkowania z minimalnym odstępem — dlatego są gęstwiny i polany, a nie
 * równy posyp. Nic nie stanie na drodze ani na skale.
 */
function buildWildProps(tiles) {
  const rng = makeRng(seedFrom('dzicz'));
  const out = [];

  const wolne = (x, y) => {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const tile = tiles[ty]?.[tx];
    if (!tile) return false;
    // Nie na skale, nie na drodze, nie w mieście i nie na progu bramy.
    if (tile.startsWith('rock') || tile.startsWith('path')) return false;
    if (tx >= CITY_OX - 1 && tx <= CITY_OX + CITY_W && ty >= CITY_OY - 1 && ty <= CITY_OY + CITY_H) return false;
    return true;
  };

  // Słupy przy każdej bramie — po jednym z każdej strony przejścia. To one robią
  // z otworu w skale bramę: bez nich nie widać, gdzie kończy się miasto.
  for (const gate of GATES) {
    const px = gate.x * TILE;
    const py = gate.y * TILE;
    if (gate.key === 'south') {
      out.push({ key: 'gatepost', x: px - 6, y: py + gate.h * TILE, body: { w: 12, h: 8 } });
      out.push({ key: 'gatepost', x: px + gate.w * TILE + 6, y: py + gate.h * TILE, body: { w: 12, h: 8 } });
    } else {
      out.push({ key: 'gatepost', x: px + gate.w * TILE / 2, y: py - 4, body: { w: 12, h: 8 } });
      out.push({ key: 'gatepost', x: px + gate.w * TILE / 2, y: py + gate.h * TILE + 16, body: { w: 12, h: 8 } });
    }
  }

  for (const region of REGIONS) {
    // Prostokąt obszaru: wszystko poza miastem po danej stronie.
    const box = region.dir === 'south'
      ? { x0: 3 * TILE, y0: (CITY_OY + CITY_H + 1) * TILE, x1: (MAP_W - 3) * TILE, y1: (MAP_H - 3) * TILE }
      : region.dir === 'west'
        ? { x0: 3 * TILE, y0: 3 * TILE, x1: (CITY_OX - 1) * TILE, y1: (CITY_OY + CITY_H) * TILE }
        : { x0: (CITY_OX + CITY_W + 1) * TILE, y0: 3 * TILE, x1: (MAP_W - 3) * TILE, y1: (CITY_OY + CITY_H) * TILE };

    // Drzewa: minimalny odstęp 40 px, więc korony się nie zlewają, a gęstość
    // steruje szumem — stąd biorą się gęstwiny. **Na polanach nie rosną.**
    const drzewa = scatter(rng, box, 40, 2400, (x, y) =>
      wolne(x, y)
      && !inClearing(x / TILE, y / TILE)
      && field(x / TILE, y / TILE, 1.3) < region.tree);
    for (const p of drzewa) {
      out.push({ key: 'tree', x: Math.round(p.x), y: Math.round(p.y), body: { w: 8, h: 8 } });
    }

    // Głazy: rzadsze i większy odstęp, żeby nie robiły alei.
    const glazy = scatter(rng, box, 52, 1400, (x, y) =>
      wolne(x, y) && field(x / TILE, y / TILE, 4.1) < region.rock);
    for (const p of glazy) {
      out.push({ key: 'boulder', x: Math.round(p.x), y: Math.round(p.y), body: { w: 14, h: 7 } });
    }

    // Krzaki: **wchodzą także na polany** i to jest ich zadanie. Polana bez
    // niczego jest łysiną; polana z krzakami i kwiatami jest miejscem.
    // Nie zastawiają drogi ciałem — przez krzak da się przejść.
    const krzaki = scatter(rng, box, 22, 3000, (x, y) =>
      wolne(x, y) && field(x / TILE, y / TILE, 6.2) < region.bush);
    for (const p of krzaki) {
      const kind = rng.chance(0.75) ? `bush${rng.int(3)}` : `flowers${rng.int(2)}`;
      out.push({ key: kind, x: Math.round(p.x), y: Math.round(p.y) });
    }
  }

  return out;
}

export function buildWorld() {
  const tiles = composeTiles();
  const props = [...buildProps(), ...buildWildProps(tiles)];

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

  // Kukła treningowa nie jest obiektem z listy `props` — jej stan prowadzi serwer —
  // ale stoi na placu i ma być zaporą jak każdy inny sprzęt. Przez pierwszą wersję
  // dało się przechodzić na wylot.
  //
  // Prostokąt stoi nieruchomo w miejscu spoczynku, choć sama kukła wychyla się po
  // ciosie o kilka pikseli. Świadomie: ruchoma zapora musiałaby być przesyłana po
  // sieci i uwzględniana we wspólnej fizyce, a przy wychyleniu rzędu pięciu pikseli
  // nikt tego nie zauważy. Chodzące moby dostaną prawdziwą zaporę razem z chodzeniem.
  bodies.push({
    x0: TRAINING_DUMMY.x - 7,
    x1: TRAINING_DUMMY.x + 7,
    y0: TRAINING_DUMMY.y - 9,
    y1: TRAINING_DUMMY.y,
    // Zapora żywego celu — odskok przez nią przelatuje. Beczki i kowadło takiego
    // znacznika nie mają, więc zostają twarde.
    creature: true,
  });

  const ground = buildDecals(tiles);

  return {
    tiles,
    decals: ground.decals,
    tufts: ground.tufts,
    roof: buildRoof().map(shift),
    windows: WINDOWS,
    props,
    lights: buildLights().map(shift),
    flames: buildFlames().map(shift),
    soundSources: buildSoundSources().map(shift),
    solid,
    bodies,
  };
}

/**
 * Czy prostokąt stóp gracza mieści się w przechodnim terenie.
 *
 * `ghost` znaczy „przelatuj przez żywe" — używane w odskoku. Przez beczkę ani
 * kowadło przeskoczyć się nie da i nie powinno: to sprzęt, nie przeciwnik.
 * Rozróżnia je znacznik `creature` na zaporze.
 */
export function isWalkable(world, x0, y0, x1, y1, ghost = false) {
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
    if (ghost && b.creature) continue;
    if (x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1) return false;
  }
  return true;
}

/**
 * Zapora żywego celu, w której stoi ten prostokąt — albo `null`.
 *
 * Potrzebna, odkąd odskok przelatuje przez przeciwników: skacząc **w** kogoś
 * lądujesz w środku jego zapory, a gdy odskok się kończy, kolizja wraca i każdy
 * ruch jest zablokowany. Postać utyka. Rozwiązanie wymaga najpierw wiedzy o tym,
 * że w ogóle w czymś stoimy.
 */
export function creatureAt(world, x0, y0, x1, y1) {
  for (const b of world.bodies) {
    if (!b.creature) continue;
    if (x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1) return b;
  }
  return null;
}





