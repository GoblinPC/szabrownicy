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
import { field, scatter, REGIONS, inClearing, Zajętość } from './terrain.js';
import { nodeKindOf } from './nodes.js';

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

/**
 * Zasięg pracy przy stanowisku rzemieślniczym.
 *
 * Z zapasem: gracz ma **stanąć przy warsztacie**, a nie trafić w piksel. Wspólny
 * dla obu stron, bo po tej samej liczbie klient zapala okno, a serwer pozwala
 * wykonać wyrób — rozjechane dawałyby okno, w którym nic nie działa.
 */
export const CRAFT_RANGE = 46;

/**
 * Gdzie się rzemieślniczy — **wyszukane w liście obiektów, nie wpisane liczbą**.
 *
 * Poprzednia wersja trzymała współrzędne kowadła wpisane na sztywno po stronie
 * serwera (`384, 208`). Kiedy wnętrze karczmy przebudowano na cztery
 * pomieszczenia, kowadło pojechało pod palenisko na (168, 176), a liczba
 * w serwerze została — i strefa kucia wisiała odtąd w powietrzu na środku sali
 * wspólnej. Objawiało się to dokładnie tak, jak zgłosił użytkownik: *podchodzę
 * do kowadła i nic*. To ten sam rodzaj błędu, przed którym ostrzega CLAUDE.md:
 * jeden fakt zapisany w dwóch miejscach, które przestały się zgadzać.
 *
 * Odpytanie listy obiektów kosztuje jedno przejście po tablicy przy starcie
 * i **nie da się go rozjechać** — jeśli warsztat się przesunie, strefa idzie
 * razem z nim.
 */
export function craftStation(world, key = 'workbench') {
  return world.props.find((p) => p.key === key) ?? null;
}

/**
 * Przy którym stanowisku stoi gracz — albo `null`.
 *
 * Stanowisk jest więcej niż jedno i **każde robi co innego**: przy stole się
 * struga i kuje, na stojaku wyprawia skóry. Zwracamy nazwę, a nie „tak/nie",
 * bo po niej klient wybiera listę wyrobów, a serwer sprawdza, czy dany wyrób
 * wolno wykonać tutaj.
 */
export const STATIONS = ['workbench', 'tanrack', 'cookpot'];

export function stationAt(world, x, y) {
  for (const key of STATIONS) if (atCraftStation(world, x, y, key)) return key;
  return null;
}

/** Czy punkt leży w zasięgu stanowiska. Oś Y ściśnięta jak wszędzie w rzucie 3/4. */
export function atCraftStation(world, x, y, key = 'workbench') {
  const bench = craftStation(world, key);
  if (!bench) return false;
  const dx = x - bench.x;
  // Warsztat obsługuje się **od frontu**, więc punkt odniesienia leży pół kroku
  // niżej niż zaczepienie rysunku — inaczej strefa kończyła się graczowi na
  // wysokości pasa i trzeba było wchodzić w blat.
  const dy = (y - (bench.y + 6)) * 1.5;
  return dx * dx + dy * dy <= CRAFT_RANGE * CRAFT_RANGE;
}

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
/**
 * Przesunięcie z układu miasta na wielką mapę.
 *
 * **Razem z `y` musi iść `depth`.** Głębokość obiektów to ich `y` w układzie
 * świata, więc płomień z głębokością wpisaną w układzie miasta lądował o `OFF_Y`
 * za nisko w kolejce rysowania — czyli za wszystkim, na czym płonął. Ognisko
 * zasłaniało własny ogień, dokładnie ten błąd, który CLAUDE.md opisuje od dawna,
 * tylko wprowadzony z drugiej strony: nie przez złą liczbę, tylko przez to, że
 * dobra liczba nie została przeliczona.
 */
const shift = (p) => ({
  ...p,
  x: p.x + OFF_X,
  y: p.y + OFF_Y,
  ...(typeof p.depth === 'number' ? { depth: p.depth + OFF_Y } : {}),
});

// Obrys budynku w kaflach.
const BUILDING = { x0: 5, x1: 42, y0: 2, y1: 19 };
// Prześwit bramy ma dokładnie dwa kafle, bo tyle samo ma otwór w jej rysunku.
const GATE = { x0: 23, x1: 24 };
// Kamienny przedpiecek wokół paleniska — jedyne miejsce w hali bez desek.
const APRON = { x0: 8, x1: 12, y0: 5, y1: 9 };

/**
 * Ścianki działowe — karczma to **cztery pomieszczenia**, nie jedna hala.
 *
 * Sala 37×15 kafli, umeblowana samymi meblami pod ścianami, czyta się jak
 * magazyn. Użytkownik nazwał to wprost i miał rację. Podział zrobiony według
 * reguł, których brakowało poprzedniemu podejściu:
 *
 * - **Prostokąty na siatce, kąty proste.** Żadnych kształtów „z tego, co zostało".
 * - **Najpierw powiązania, potem meble.** Kto tu wchodzi, po co i którędy wyjdzie.
 * - **Pusta przestrzeń jest narzędziem.** Przedsionek za bramą zostaje wolny,
 *   bo to z niego gracz odczytuje, gdzie jest i dokąd może pójść. Poprzednia
 *   wersja zapełniała go zapasami — dokładnie odwrotnie, niż trzeba.
 * - **Powiązane stanowiska razem.** Kowal ma wszystko w dwóch krokach, sklep ma
 *   ladę i półki w jednym pomieszczeniu, warsztaty stoją osobno od szynku.
 *
 * Diagram powiązań (brama na dole, w sali wspólnej):
 *
 *      KUŹNIA ──drzwi── SALA WSPÓLNA ──drzwi── SKLEP
 *                            │                (lada, karczmarz)
 *                          BRAMA
 *                            │
 *                        ──drzwi── WARSZTAT I POKOJE (schody na górę)
 *
 * Sala wspólna jest **węzłem**: z niej widać wszystkie troje drzwi i do niej
 * wraca się po każdej czynności. To jest ten jeden punkt, po którym gracz
 * orientuje się we wnętrzu.
 */
const PARTITIONS = [
  // Zachodnia ścianka: oddziela kuźnię. Drzwi na wysokości ogniska sali.
  { dir: 'v', x: 16, y0: BUILDING.y0 + 2, y1: BUILDING.y1 - 1, doors: [[10, 11]] },
  // Wschodnia ścianka: oddziela skrzydło sklepu i warsztatów. Dwoje drzwi,
  // po jednych do każdego z pomieszczeń — inaczej do warsztatu chodziłoby się
  // przez sklep, a to jest droga, której nikt nie projektuje naprawdę.
  // Drzwi do sklepu na wysokości y 9-10, czyli **poniżej lady** — wchodzący
  // ląduje po stronie klienta. Przy drzwiach wyżej wchodziłoby się karczmarzowi
  // za plecy, a wtedy lada niczego nie oddziela.
  { dir: 'v', x: 32, y0: BUILDING.y0 + 2, y1: BUILDING.y1 - 1, doors: [[9, 10], [14, 15]] },
  // Pozioma ścianka w skrzydle wschodnim: sklep na północy, warsztaty na południu.
  // Bez drzwi — to dwa osobne pomieszczenia, każde z własnym wejściem z sali.
  { dir: 'h', y: 11, x0: 33, x1: BUILDING.x1 - 1, doors: [] },
];

/** Czy pole zajmuje ścianka działowa, i jaki kafel na nim leży. */
function partitionAt(x, y) {
  for (const p of PARTITIONS) {
    if (p.dir === 'v') {
      if (x !== p.x || y < p.y0 || y > p.y1) continue;
      if (p.doors.some(([a, b]) => y >= a && y <= b)) return null;
      // Węzeł: z tej pionowej ścianki wychodzi w tym wierszu pozioma.
      const wychodzi = PARTITIONS.some((q) => q.dir === 'h' && q.y === y && q.x0 === x + 1);
      return wychodzi ? 'tr' : 'v';
    }
    if (x < p.x0 || x > p.x1) continue;
    if (p.doors.some(([a, b]) => x >= a && x <= b)) continue;
    // Ścianka pozioma ma **koronę i czoło**, tak samo jak ściana zewnętrzna —
    // sam pas widziany z góry czytałby się jako listwa na podłodze.
    if (y === p.y) return 'top';
    return null;
  }
  return null;
}

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

// Ścianki działowe **muszą tu być**. Bez nich nowy kafel wygląda jak ściana
// i przepuszcza gracza na wylot — a że gra nie zgłasza takiego błędu, wychodzi
// dopiero wtedy, gdy ktoś przejdzie przez mur. Złapane kontrolą świata:
// „sklep: ZA ladą — osiągalne, a nie powinno być".
const SOLID_TILES = new Set([
  'wall_face', 'wall_window', 'wall_top', 'wall_top_window', 'rock',
  'part_v', 'part_h', 'part_tr',
]);

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
    // Ścianki działowe przed podłogą — dzielą halę na cztery pomieszczenia.
    const ścianka = partitionAt(x, y);
    if (ścianka === 'tr') return 'part_tr';
    if (ścianka === 'v') return 'part_v';
    if (ścianka === 'top') return 'part_h';
    if (ścianka === 'face') return `wall_face_${rng.int(3)}`;

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
// Palenisko w układzie miasta. Sadza gęstnieje w jego stronę, a odległość liczy
// się na wielkiej mapie — stąd przesunięcie w jednym miejscu, nie w czterech.
const FORGE_HEARTH = { x: CITY_OX + 11, y: CITY_OY + 8 };

function buildDecals(tiles) {
  const rng = makeRng(seedFrom('forge-decals'));
  const decals = [];
  const tufts = [];

  // Pętla idzie po **całej mapie**, nie po wymiarach miasta.
  //
  // Kiedy świat urósł z 48x36 do 160x120, a miasto przesunęło się o `CITY_OX`,
  // ta pętla została na starych granicach i dekorowała lewy górny róg dziczy —
  // w 97% litą skałę. W całym świecie powstawało sześć dekali i dwie kępki trawy,
  // a kuźnia nie dostawała ani jednej plamy sadzy. Wyszło to dopiero z policzenia
  // ich po wygenerowaniu świata, bo na ekranie wygląda to jak „grafika jest słaba",
  // a nie jak „mechanizm nie działa".
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = tiles[y][x];
      const px = x * TILE;
      const py = y * TILE;
      const wCity = x >= CITY_OX && x < CITY_OX + CITY_W && y >= CITY_OY && y < CITY_OY + CITY_H;

      if (tile.startsWith('floor_stone')) {
        const d = Math.hypot(x - FORGE_HEARTH.x, y - FORGE_HEARTH.y);
        if (d < 9 && rng.chance(0.35 - d * 0.03)) {
          decals.push({ key: rng.chance(0.5) ? 'decal_soot_0' : 'decal_soot_1', x: px, y: py });
        }
        if (rng.chance(0.05)) decals.push({ key: `decal_crack_${rng.int(2)}`, x: px, y: py });
      } else if (tile.startsWith('floor_wood')) {
        // Sadza wysypana z paleniska na deski. To ona rozmywa styk kamiennego
        // przedpiecka z podłogą — bez niej granica jest linią prostą.
        const d = Math.hypot(x - (FORGE_HEARTH.x + 0.5), y - (FORGE_HEARTH.y + 0.5));
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
      } else if (tile.startsWith('path')) {
        if (rng.chance(0.15)) decals.push({ key: 'decal_rut', x: px, y: py });
      } else if (tile.startsWith('grass')) {
        // Kępki są **żywymi obiektami** — każda dostaje sprite'a i jest ruszana co
        // klatkę. W mieście jest ich czternaście razy mniej niż w dziczy, więc
        // gęstość dobrana na plac (0,55) dałaby na wielkiej mapie ponad siedem
        // tysięcy sprite'ów. W dziczy trawa jest tłem, po którym się biegnie;
        // na placu jest tym, po czym się chodzi i widać, jak się ugina.
        if (rng.chance(wCity ? 0.5 : 0.1)) {
          tufts.push({ key: `decal_tuft_${rng.int(3)}`, x: px, y: py });
        }
      }
    }
  }
  return { decals, tufts };
}

/**
 * Warstwa nakładkowa: podłoże bazowe plus komórki trawy i drogi.
 *
 * Siatka nakładek jest przesunięta o pół kafla, więc komórka `(cx, cy)` siedzi
 * na `(cx*16-8, cy*16-8)` i dotyka czterech pól świata — po jednym na róg.
 * Kształt wynika z tego, ile z nich jest danym materiałem; szczegóły geometrii
 * siedzą w `tools/art/tiles.js` przy `surfaceOverlay()`.
 *
 * `tiles` zostaje **niezmienione**: to dalej jedyna prawda o tym, po czym gracz
 * chodzi. Krok stawiany na polu `grass_1` ma brzmieć jak trawa niezależnie od
 * tego, ile trawy narysowała nakładka w tym rogu.
 */
function buildOverlay(tiles) {
  // Ziemia leży pod wszystkim, po czym się chodzi na dworze. Wariant z hasza
  // pozycji, nie z licznika — `(x + y) % n` układa kafle w ukośne pasy, które
  // przy jednorodnej ziemi widać jako mory.
  //
  // Dwanaście wariantów, tak jak `DIRT_VARIANTS` w `tools/art/tiles.js`.
  const dirtFor = (x, y) => `dirt_${(((x * 73856093) ^ (y * 19349663)) >>> 0) % 12}`;
  const base = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      const tile = tiles[y][x];
      // Ziemia też idzie przez hasz, nie tylko pola pod nakładką: `pickTile()`
      // i `terrainTile()` losują `dirt_0..3`, więc bez tego plac dostawał cztery
      // warianty zamiast dwunastu i rytm było widać mimo dosypanych kafli.
      const ziemia = tile.startsWith('grass') || tile.startsWith('path')
        || tile.startsWith('rock') || tile.startsWith('dirt');
      row.push(ziemia ? dirtFor(x, y) : tile);
    }
    base.push(row);
  }

  // Kolejność warstw: trawa, na niej wydeptana droga, na wszystkim skała.
  // Droga przecina trawę, bo to ludzie ją wydeptali; skała przecina jedno i drugie,
  // bo była tu pierwsza.
  const cells = [];
  for (const kind of ['grass', 'path', 'rock']) {
    const is = (x, y) => Boolean(tiles[y]?.[x]?.startsWith(kind));
    for (let cy = 0; cy <= MAP_H; cy++) {
      for (let cx = 0; cx <= MAP_W; cx++) {
        const mask = (is(cx - 1, cy - 1) ? 1 : 0) | (is(cx, cy - 1) ? 2 : 0)
          | (is(cx - 1, cy) ? 4 : 0) | (is(cx, cy) ? 8 : 0);
        if (!mask) continue;
        // Faza szumu z pozycji komórki. Cztery kafle okresu w każdą stronę —
        // przy dwóch skalna ściana miasta dostawała rząd jednakowych garbów.
        // Ta liczba musi się zgadzać z `PHASES` w `tools/art/tiles.js`.
        const phase = (cx & 3) | ((cy & 3) << 2);
        cells.push({ key: `ov_${kind}_${mask}_${phase}`, x: cx * TILE - 8, y: cy * TILE - 8 });
      }
    }
  }

  // Czoło skalnej ściany.
  //
  // Liczone na **siatce świata**, nie na przesuniętej siatce nakładek: czoło jest
  // pionową ścianką pod koroną, więc musi stać w całych kaflach, a nie w połówkach.
  // Dwa kafle wysokości — przy jednym korona zostawała szerokim płaskim pasem
  // i dalej czytała się jako kamienna podłoga.
  const skala = (x, y) => Boolean(tiles[y]?.[x]?.startsWith('rock'));
  const wariant = (x, y) => (((x * 2654435761) ^ (y * 40503)) >>> 0) % 3;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!skala(x, y)) continue;
      if (!skala(x, y + 1)) {
        // Ostatni rząd skały: dolna połowa czoła plus osypisko na ziemi pod nim.
        cells.push({ key: `rock_face_lo_${wariant(x, y)}`, x: x * TILE, y: y * TILE });
        cells.push({ key: `rock_scree_${wariant(x, y + 1)}`, x: x * TILE, y: (y + 1) * TILE });
      } else if (!skala(x, y + 2)) {
        cells.push({ key: `rock_face_hi_${wariant(x, y)}`, x: x * TILE, y: y * TILE });
      }
    }
  }

  return { base, cells };
}

/**
 * Obiekty świata. `x`/`y` to punkt zaczepienia na dole pośrodku, `body` opisuje
 * prostokąt kolizji liczony od tego punktu w górę.
 */
/**
 * Przedsionek — pas przy bramie, w którym **nic nie stoi**.
 *
 * Wpisany jako reguła, a nie jako dobre chęci, bo dobre chęci już raz zawiodły:
 * dosypywanie zapasów w wolne miejsca postawiło stos kłód wprost w wejściu.
 * Prostokąt jest sprawdzany po zbudowaniu listy obiektów i błąd wywala się
 * od razu, a nie po wejściu do gry.
 *
 * Sięga trzy kafle w głąb sali i po kaflu na boki od prześwitu bramy: tyle
 * potrzeba, żeby wchodzący widział salę, zanim w coś wejdzie.
 */
const ENTRANCE_CLEAR = { x0: 352, x1: 416, y0: 256, y1: 304 };

function buildProps() {
  const p = [];
  // Wszystkie współrzędne poniżej są **w układzie miasta**. Przesunięcie na
  // wielką mapę robimy tu, w jednym miejscu — inaczej trzeba by poprawić
  // sześćdziesiąt wpisów i pomylić się w kilku.
  const add = (key, x, y, body = null, extra = {}) =>
    p.push({ key, x: x + OFF_X, y: y + OFF_Y, body, ...extra });

  // --- Wnętrze karczmy: cztery strefy ---
  //
  // Hala miała wcześniej kowadło **na środku sali** i resztę sprzętu rozsypaną
  // po kątach. Użytkownik nazwał to wprost: *są porozrzucane jak po huraganie*.
  // Układ ma teraz jedną regułę, wziętą z tego, jak ludzie używają wnętrz:
  //
  //   **przy ścianach stoi to, co się obsługuje;
  //    na środku to, wokół czego się siada.**
  //
  // Kowal stoi między paleniskiem a kowadłem i robi dwa kroki — nie przechodzi
  // przez pół karczmy z rozgrzanym żelazem. Stąd kowadło wróciło pod palenisko.
  //
  // Wnętrze ma 38×15 kafli (x 80–688, y 64–304), a brama jest w południowej
  // ścianie na x=384. Oś wejścia zostaje przechodnia: idąc od bramy w górę
  // trafiasz między stół a ladę, a nie w mebel.

  // POMIESZCZENIE 1 — KUŹNIA. Kafle x 6-15 (px 96-255), drzwi w ściance na y 10-11.
  //
  // Kolejność na podłodze jest **kolejnością czynności**, nie estetyką: kowal
  // bierze żelazo z ognia, kładzie na kowadle, studzi w korycie. Wszystko
  // w dwóch krokach, plecami do ścianki.
  add('hearth', 168, 118, { w: 32, h: 14 }, { noShadow: true });
  add('bellows', 224, 116, { w: 20, h: 8 });
  add('coal', 112, 128, { w: 20, h: 6 });
  add('anvil', 168, 176, { w: 14, h: 8 });
  add('trough', 116, 186, { w: 20, h: 9 });
  add('rack', 232, 170, { w: 18, h: 8 });           // gotowe wyroby przy ściance
  add('logs', 124, 268, { w: 22, h: 8 });           // opał w kącie
  add('crate', 232, 268, { w: 14, h: 8 });
  add('barrel', 234, 244, { w: 12, h: 8 });

  // POMIESZCZENIE 2 — SALA WSPÓLNA. Kafle x 17-31 (px 272-511).
  //
  // **Węzeł całego wnętrza**: brama wchodzi tu na dole, a z sali widać wszystkie
  // troje drzwi. Ogień stoi na środku i jest punktem orientacyjnym — pierwszą
  // rzeczą, którą widzi wchodzący.
  //
  // Przedsionek (px 352-416, y 256-304) zostaje **pusty**. To nie jest dziura
  // do zapełnienia, tylko miejsce, z którego gracz odczytuje, gdzie jest.
  add('campfire', 392, 152, { w: 16, h: 7 }, { noShadow: true });
  add('cookpot', 424, 158, { w: 16, h: 8 });
  add('bench', 392, 122, { w: 26, h: 6 });          // za ogniem
  add('bench', 340, 168, { w: 26, h: 6 });          // z lewej
  add('bench', 444, 172, { w: 26, h: 6 });          // z prawej
  add('stool', 356, 186, { w: 10, h: 6 });
  add('stool', 428, 188, { w: 10, h: 6 });

  // Stół — po zachodniej stronie sali, poza osią wejścia.
  add('table', 316, 246, { w: 40, h: 10 });
  add('stool', 288, 264, { w: 10, h: 6 });
  add('stool', 344, 264, { w: 10, h: 6 });
  add('stool', 316, 210, { w: 10, h: 6 });

  // Zapasy szynku — w kącie północno-zachodnim sali, przy ściance kuźni.
  add('barrel', 288, 118, { w: 12, h: 8 });
  add('crate', 304, 130, { w: 14, h: 8 });

  // Schodów na razie nie ma. Trzy podejścia dały kolejno pochylnię, drabinę
  // i skrzynię z czarną dziurą — czytelne schody w rzucie 3/4 wymagają widoku
  // z boku i profilu, a nie stosu poziomych pasów. Wrócą razem z pokojem gracza.

  // POMIESZCZENIE 3 — SKLEP. Kafle x 33-41, y 4-10 (px 528-671, y 64-175).
  //
  // Lada **w poprzek pomieszczenia**, półki za nią: karczmarz stoi po swojej
  // stronie, gracz po swojej i nie wchodzi za ladę. Dopiero taki układ czyta się
  // jako sklep — sama lada pod ścianą to mebel.
  // Lada idzie **przez całe pomieszczenie**, bez przejścia.
  //
  // Pierwsza wersja miała jedną ladę na środku i dało się ją obejść z obu stron —
  // czyli nie była ladą, tylko stołem. Lada jest granicą: karczmarz stoi po
  // swojej stronie, gracz po swojej. Trzy segmenty zamykają szerokość pokoju,
  // a zostające po bokach szpary mają po kilka pikseli i stopa się w nie nie mieści.
  add('shelf', 556, 84, { w: 26, h: 8 });           // półki za ladą
  add('shelf', 616, 84, { w: 26, h: 8 });
  add('counter', 552, 128, { w: 44, h: 10 });
  add('counter', 597, 128, { w: 44, h: 10 });
  add('counter', 642, 128, { w: 44, h: 10 });
  add('barrel', 536, 100, { w: 12, h: 8 });         // zapasy po stronie karczmarza
  add('crate', 660, 104, { w: 14, h: 8 });
  add('crate', 540, 168, { w: 14, h: 8 });          // po stronie klienta
  add('barrel', 656, 168, { w: 12, h: 8 });

  // POMIESZCZENIE 4 — WARSZTATY I POKOJE. Kafle x 33-41, y 12-18 (px 528-671).
  //
  // Schody w rogu, najdalej od drzwi: pokoje są miejscem, do którego się idzie
  // celowo, a nie mija po drodze.
  add('workbench', 566, 224, { w: 30, h: 8 });
  add('tanrack', 640, 224, { w: 24, h: 8 });
  add('crate', 546, 282, { w: 14, h: 8 });
  add('barrel', 566, 292, { w: 12, h: 8 });
  add('bucket', 596, 286, { w: 10, h: 6 });

  // Pochodnie na ścianach — druga warstwa oświetlenia wnętrza.
  // Obiekty, które same świecą, nie rzucają cienia: nie ma czego rzucać, bo
  // źródło światła znajduje się w nich samych.
  // Wspornik musi wypaść na licu muru: ściana północna to pas 48-64 px,
  // ściany boczne to kolumny 80-96 px i 672-688 px.
  add('torch', 296, 63, null, { noShadow: true });
  add('torch', 500, 63, null, { noShadow: true });
  add('torch', 660, 63, null, { noShadow: true });
  // Pochodnie wiszą **wyłącznie na ścianach zwróconych do gracza**, czyli na
  // licach poziomych. Dwie wisiały wcześniej na ścianach bocznych i wyglądały,
  // jakby stały na ich grzbiecie — bo ścianę biegnącą północ-południe widzi się
  // w rzucie 3/4 od góry i nie ma na niej lica, na którym wspornik mógłby usiąść.
  // Jedna z nich siedziała dodatkowo na oknie.
  add('torch', 128, 63, null, { noShadow: true });      // kuźnia, ściana północna
  add('torch', 600, 191, null, { noShadow: true });     // warsztat, lico ścianki

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

  // Kontrola przedsionka. Liczona z prostokątów kolizji, nie z punktów zaczepienia —
  // stos kłód zaczepiony obok bramy i tak wchodziłby w nią bokiem.
  for (const prop of p) {
    if (!prop.body) continue;
    const x = prop.x - OFF_X;
    const y = prop.y - OFF_Y;
    const box = { x0: x - prop.body.w / 2, x1: x + prop.body.w / 2, y0: y - prop.body.h, y1: y };
    if (box.x1 > ENTRANCE_CLEAR.x0 && ENTRANCE_CLEAR.x1 > box.x0
      && box.y1 > ENTRANCE_CLEAR.y0 && ENTRANCE_CLEAR.y1 > box.y0) {
      throw new Error(`Obiekt "${prop.key}" (${x}, ${y}) stoi w przedsionku bramy`);
    }
  }

  return p;
}

/**
 * Co się na czym pali — **jedno źródło prawdy** dla ognia, światła i dźwięku.
 *
 * Wcześniej płomienie i światła były osobnymi listami współrzędnych wpisanych
 * ręcznie. Przy pierwszym przesunięciu paleniska płomień został na starym
 * miejscu, dwadzieścia pikseli obok, i nikt tego nie zauważył aż do gry.
 * To nie był błąd liczby, tylko **błąd konstrukcji**: fakt „palenisko stoi tutaj"
 * był zapisany w trzech miejscach naraz i nic nie sprawdzało, czy się zgadzają.
 *
 * Teraz ogień jest **cechą obiektu**. Przesunięcie paleniska zabiera ze sobą
 * płomień, światło i dźwięk, bo wszystkie trzy z niego wynikają.
 *
 * `flameDy` to ile pikseli nad punktem zaczepienia siedzi dolna krawędź płomienia,
 * `lights` to lampy liczone od tego samego punktu.
 */
const FIRE_KINDS = {
  hearth: {
    anim: 'flame_big',
    // Pięć, nie dwadzieścia cztery. Przy 24 płomień lądował o kafel za wysoko,
    // na kominie — bo przepisałem tu przez pomyłkę odsunięcie **światła**
    // paleniska, a nie jego ognia. Ogień pali się w otworze, tuż nad podstawą;
    // światło siedzi wyżej, w środku bryły.
    flameDy: 5,
    lights: [
      { dy: 24, radius: 132, color: [255, 150, 48], intensity: 1.0, flicker: 0.22 },
      { dy: 12, radius: 62, color: [255, 220, 130], intensity: 0.9, flicker: 0.3 },
    ],
    sound: { radius: 260, strength: 1.0 },
  },
  campfire: {
    anim: 'flame_mid',
    flameDy: 5,
    lights: [{ dy: 8, radius: 104, color: [255, 158, 55], intensity: 0.95, flicker: 0.26 }],
    sound: { radius: 220, strength: 0.75 },
  },
  torch: {
    anim: 'flame_small',
    flameDy: 10,
    lights: [{ dy: 7, radius: 76, color: [255, 165, 60], intensity: 0.78, flicker: 0.19 }],
  },
};

/** Obiekty, które się palą — w kolejności z listy `props`. */
function burningProps(props) {
  return props.filter((prop) => FIRE_KINDS[prop.key]);
}

/**
 * Animowane płomienie. Liczone z obiektów, nie wypisane.
 *
 * `depth` musi być większe niż obiektu, na którym płonie — inaczej palenisko
 * zasłania własny ogień. Stąd `y + 1`: głębokość obiektu to jego `y`.
 */
function buildFlames(props) {
  return burningProps(props).map((prop) => {
    const fire = FIRE_KINDS[prop.key];
    return { anim: fire.anim, x: prop.x, y: prop.y - fire.flameDy, depth: prop.y + 1 };
  });
}

/**
 * Źródła światła. `flicker` to siła migotania (0 = stabilne), `phase` rozsuwa
 * fazy, żeby pochodnie nie pulsowały zgodnie jak jedna.
 *
 * Faza bierze się z **położenia**, a nie z ręcznie wpisanej liczby: dwa ognie
 * nigdy nie stoją w tym samym miejscu, więc nigdy nie dostaną tej samej fazy,
 * a dołożenie pochodni nie wymaga wymyślania kolejnej wartości.
 */
function buildLights(props) {
  // `indoor` liczone z obrysu hali, nie wpisane ręcznie — inaczej przesunięcie
  // budynku zostawiłoby ogień „pod dachem" na środku placu. Decyduje o dwóch
  // rzeczach naraz: czy ogień przygasa w dzień i czy w dzień rzuca cień.
  // Obrys hali w **układzie świata**, bo obiekty są już przesunięte.
  const podDachem = (x, y) => x >= OFF_X + BUILDING.x0 * TILE && x <= OFF_X + (BUILDING.x1 + 1) * TILE
    && y >= OFF_Y + BUILDING.y0 * TILE && y <= OFF_Y + (BUILDING.y1 + 1) * TILE;

  const out = [];
  for (const prop of burningProps(props)) {
    for (const light of FIRE_KINDS[prop.key].lights) {
      out.push({
        ...light,
        x: prop.x,
        y: prop.y - light.dy,
        phase: ((prop.x * 0.37 + prop.y * 0.71) % (Math.PI * 2)),
        indoor: podDachem(prop.x, prop.y),
      });
    }
  }
  return out;
}

/**
 * Źródła dźwięku otoczenia. Osobne od świateł, bo zasięg słyszalności ognia
 * jest znacznie większy niż zasięg jego blasku — palenisko słychać z drugiego
 * końca hali, choć oświetla tylko swój kąt.
 */
function buildSoundSources(props) {
  // Też z obiektów. Pochodnia bez wpisu `sound` dostaje domyślny, cichy zasięg —
  // inaczej dołożenie pochodni cichłoby po niej samej.
  return burningProps(props).map((prop) => {
    const fire = FIRE_KINDS[prop.key];
    const sound = fire.sound ?? { radius: 110, strength: 0.3 };
    return { type: 'fire', x: prop.x, y: prop.y - fire.flameDy, ...sound };
  });
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
  // Droga musi **wychodzić dokładnie z bramy**, a nie obok niej.
  //
  // Pierwsza wersja liczyła wężyk od zera na całej długości, więc już przy samym
  // murze potrafił odbić o cztery kafle — brama była w jednym miejscu, a droga
  // zaczynała się w drugim. Wężyk **narasta z odległością**: przy bramie jest
  // zerowy, dalej pełny. Ta sama poprawka na wszystkich trzech drogach.
  const wobble = (odleglosc, faza, amplituda) =>
    Math.round(Math.sin(faza) * amplituda * Math.min(1, odleglosc / 10));

  for (const gate of GATES) {
    if (gate.key === 'south') {
      const d = y - (gate.y + gate.h - 1);
      if (d < 0) continue;
      const cx = gate.x + gate.w / 2 + wobble(d, y * 0.09, 4);
      if (Math.abs(x + 0.5 - cx) < gate.w / 2 + 0.5) return true;
    } else {
      const d = gate.key === 'west' ? gate.x - x : x - (gate.x + gate.w - 1);
      if (d < 0) continue;
      const cy = gate.y + gate.h / 2 + wobble(d, x * 0.08, 3);
      if (Math.abs(y + 0.5 - cy) < gate.h / 2 + 0.5) return true;
    }
  }
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

  // Zajętość jest **jedna na całą mapę**, nie jedna na warstwę i nie jedna na
  // obszar. Na styku lasu ze skaliskiem obiekty z dwóch obszarów stoją obok
  // siebie i muszą się widzieć tak samo jak wewnątrz jednego.
  const zajętość = new Zajętość();

  /**
   * Czy w tym miejscu wolno cokolwiek postawić.
   *
   * `margines` to odsunięcie od drogi, skały i muru — sprawdzane w czterech
   * rogach kwadratu wokół punktu, nie w samym punkcie. Punktowy test przepuszczał
   * głaz zaczepiony piksel od drogi: zaczepienie stało obok ścieżki, a rysunek
   * szeroki na czternaście pikseli leżał już na niej. Droga ma zostać drogą,
   * bo to po niej gracz wychodzi z miasta.
   */
  const wolne = (x, y, margines = 0) => {
    for (const [dx, dy] of [[0, 0], [-margines, -margines], [margines, -margines],
      [-margines, margines], [margines, margines]]) {
      if (!wolnyKafel(x + dx, y + dy)) return false;
    }
    return true;
  };

  const wolnyKafel = (x, y) => {
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
  // Słupy trafiają do zajętości razem z resztą — stoją przy samym przejściu,
  // więc bez tego drzewo mogło wyrosnąć w bramie.
  const słup = (x, y) => { zajętość.dodaj(x, y, 22); };

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
  for (const p of out) if (p.key === 'gatepost') słup(p.x, p.y);

  for (const region of REGIONS) {
    // Prostokąt obszaru: wszystko poza miastem po danej stronie.
    const box = region.dir === 'south'
      ? { x0: 3 * TILE, y0: (CITY_OY + CITY_H + 1) * TILE, x1: (MAP_W - 3) * TILE, y1: (MAP_H - 3) * TILE }
      : region.dir === 'west'
        ? { x0: 3 * TILE, y0: 3 * TILE, x1: (CITY_OX - 1) * TILE, y1: (CITY_OY + CITY_H) * TILE }
        : { x0: (CITY_OX + CITY_W + 1) * TILE, y0: 3 * TILE, x1: (MAP_W - 3) * TILE, y1: (CITY_OY + CITY_H) * TILE };

    // Drzewa. Promień 26 px, czyli dwa drzewa dzieli 52 px, a drzewo od głazu 56.
    //
    // Poprzednie 40 px między drzewami wyglądało rozsądnie na papierze i dawało
    // ścianę: przy pniu szerokim na 8 px zostawało 32 px przerwy, ale **głaz
    // o tym nie wiedział** i wchodził w tę przerwę, bo miał własną listę.
    // Korytarz robił się wtedy węższy od gracza. Dziś obie rzeczy siedzą w jednej
    // liście zajętości, więc przerwa jest pewna, a nie taka na oko.
    //
    // **Na polanach nie rosną**, gęstość steruje szumem — stąd gęstwiny.
    const drzewa = scatter(rng, box, 26, 2400, (x, y) =>
      wolne(x, y, 12)
      && !inClearing(x / TILE, y / TILE)
      && field(x / TILE, y / TILE, 1.3) < region.tree, zajętość);
    for (const p of drzewa) {
      out.push({ key: 'tree', x: Math.round(p.x), y: Math.round(p.y), body: { w: 8, h: 8 } });
    }

    // Głazy: rzadsze i większy promień, żeby nie robiły alei.
    const glazy = scatter(rng, box, 30, 1400, (x, y) =>
      wolne(x, y, 14) && field(x / TILE, y / TILE, 4.1) < region.rock, zajętość);
    for (const p of glazy) {
      out.push({ key: 'boulder', x: Math.round(p.x), y: Math.round(p.y), body: { w: 14, h: 7 } });
    }

    // Gałęzie i luźne kamienie — **to, po co wychodzi się z miasta pierwszy raz**.
    //
    // Gęste i z małym odstępem, bo mają być łatwe do znalezienia: to jest jedyne
    // źródło materiału na pierwsze narzędzie, a szukanie go po całej mapie nie
    // jest ciekawe, tylko żmudne. Trudność zaczyna się dopiero za nimi.
    //
    // Gałęzie leżą pod drzewami, kamienie przy skałach — jedno i drugie ma
    // wyglądać na **skutek czegoś**, a nie na posyp po mapie.
    //
    // Promień mały (10 px), bo to rzeczy **leżące**: nie zastawiają przejścia
    // i mają prawo leżeć tuż przy pniu. Wspólna lista i tak nie pozwoli im wejść
    // w sam pień, bo drzewo wnosi swoje 26 px.
    const gałęzie = scatter(rng, box, 10, 2200, (x, y) =>
      wolne(x, y, 6) && field(x / TILE, y / TILE, 1.3) < region.tree + 0.12, zajętość);
    for (const p of gałęzie) {
      out.push({ key: `branch${rng.int(2)}`, x: Math.round(p.x), y: Math.round(p.y) });
    }

    const kamyki = scatter(rng, box, 10, 2200, (x, y) =>
      wolne(x, y, 6) && field(x / TILE, y / TILE, 4.1) < region.rock + 0.18, zajętość);
    for (const p of kamyki) {
      out.push({ key: `pebbles${rng.int(2)}`, x: Math.round(p.x), y: Math.round(p.y) });
    }

    // Krzaki: **wchodzą także na polany** i to jest ich zadanie. Polana bez
    // niczego jest łysiną; polana z krzakami i kwiatami jest miejscem.
    // Nie zastawiają drogi ciałem — przez krzak da się przejść.
    const krzaki = scatter(rng, box, 11, 3000, (x, y) =>
      wolne(x, y, 6) && field(x / TILE, y / TILE, 6.2) < region.bush, zajętość);
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

  // **Numer zasobu stempluje się na obiekcie**, raz, tutaj.
  //
  // Ta liczba jest identyfikatorem w sieci, więc obie strony muszą ją wyliczyć
  // identycznie. Wcześniej ta sama reguła była wypisana w trzech pętlach i
  // trzymały się razem tylko przypadkiem — bo każdy zasób miał zaporę. Pierwszy
  // zasób bez kolizji (leżąca gałąź) rozjechałby numerację po cichu.
  let nodeId = 0;
  for (const prop of props) {
    if (nodeKindOf(prop.key)) prop.node = nodeId++;
  }

  const bodies = props
    .filter((prop) => prop.body)
    .map((prop) => ({
      x0: prop.x - prop.body.w / 2,
      x1: prop.x + prop.body.w / 2,
      y0: prop.y - prop.body.h,
      y1: prop.y,
      node: prop.node,
    }));

  // Zapory zasobów po numerze — po nich obie strony gaszą kolizję po ścięciu.
  // Małe zasoby zapory nie mają i nie potrzebują: przez gałąź się przechodzi.
  const nodeBody = new Map();
  for (const body of bodies) {
    if (body.node !== undefined) nodeBody.set(body.node, body);
  }

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
  const overlay = buildOverlay(tiles);

  return {
    tiles,
    base: overlay.base,
    overlay: overlay.cells,
    decals: ground.decals,
    tufts: ground.tufts,
    roof: buildRoof().map(shift),
    windows: WINDOWS,
    props,
    // Ogień, światło i dźwięk liczone z **gotowej listy obiektów**, która ma już
    // współrzędne świata — dlatego bez `shift`. Przesunięcie miasta jest w nich
    // zawarte, bo `add()` nakłada je przy tworzeniu obiektu.
    lights: buildLights(props),
    flames: buildFlames(props),
    soundSources: buildSoundSources(props),
    solid,
    bodies,
    // Zapora zasobu po numerze — po niej obie strony gaszą kolizję po ścięciu.
    nodeBody,
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
    // Ścięte drzewo i rozbity głaz przestają zawadzać. Flagę przestawia ta
    // strona, która wie o stanie zasobu: serwer z `hurtNodes`, klient z migawki.
    if (b.down) continue;
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





