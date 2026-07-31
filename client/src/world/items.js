// Przedmioty i siatka plecaka.
//
// **Jeden plik, dwie strony**, tak samo jak `movement.js` i `nodes.js`. Klient
// rysuje siatkę i prosi o przełożenie; o tym, czy przedmiot się zmieścił i czy
// w ogóle był, rozstrzyga serwer. Przy grze, w której łupi się innych graczy,
// nie ma innej możliwości — a dwie kopie reguł układania rozjechałyby się przy
// pierwszej zmianie kształtu.
//
// Zasada nadrzędna: **miejsce w plecaku jest zasobem**, nie licznikiem sztuk.
// Dlatego nie ma tu stosów. Cztery kłody to cztery prostokąty do ułożenia, a nie
// liczba przy ikonie — decyzja „co zostawiam" ma zapadać na łupie, przy otwartym
// worku, a nie w tabelce.

/**
 * Rodzaje przedmiotów.
 *
 * `w` i `h` to rozmiar w kratkach przy obrocie 0. Obrót zamienia je miejscami.
 * `icon` to klatka w atlasie `props` — ta sama grafika, z której powstaje rzecz
 * leżąca na ziemi, tylko narysowana pod kratki.
 */
export const ITEMS = {
  // Kłoda leży, więc jest szeroka. Dwie kratki to dużo jak na drewno i tak ma być:
  // po trzech drzewach widać, że plecak się kończy.
  wood: { w: 2, h: 1, icon: 'icon_wood', name: 'kłoda' },
  stone: { w: 1, h: 1, icon: 'icon_stone', name: 'kamień' },
  // Mięso zajmuje jedną kratkę i to jest celowo tanio: głód ma być rozwiązywalny,
  // ale **musisz je najpierw upolować**. Trudność siedzi w zdobyciu, nie w noszeniu.
  meat: { w: 1, h: 1, icon: 'icon_meat', name: 'mięso', food: 42 },
  // Dzida zajmuje pół plecaka i to jest jej koszt. Nosisz broń albo nosisz łup.
  spear: { w: 1, h: 4, icon: 'icon_spear', name: 'dzida' },
};

/** Rozmiar plecaka startowego. Rośnie później — pokój w karczmie ma go zwiększać. */
export const BAG_W = 8;
export const BAG_H = 5;

/** Rozmiar przedmiotu po obrocie. `rot` to 0 albo 1 (ćwierć obrotu). */
export function sizeOf(kind, rot = 0) {
  const spec = ITEMS[kind];
  if (!spec) return null;
  return rot ? { w: spec.h, h: spec.w } : { w: spec.w, h: spec.h };
}

/**
 * Czy przedmiot zmieści się w danym miejscu.
 *
 * `ignore` to identyfikator przedmiotu pomijanego przy sprawdzaniu — bez tego
 * przeciąganie rzeczy o jedną kratkę w bok zawsze zderzałoby się z nią samą.
 */
export function fits(bag, kind, rot, x, y, ignore = null) {
  const size = sizeOf(kind, rot);
  if (!size) return false;
  if (x < 0 || y < 0 || x + size.w > bag.w || y + size.h > bag.h) return false;

  for (const item of bag.items) {
    if (item.id === ignore) continue;
    const other = sizeOf(item.kind, item.rot);
    if (!other) continue;
    if (x >= item.x + other.w || item.x >= x + size.w) continue;
    if (y >= item.y + other.h || item.y >= y + size.h) continue;
    return false;
  }
  return true;
}

/**
 * Pierwsze wolne miejsce, w obu obrotach.
 *
 * Szukamy wierszami od góry, bo przedmioty mają się **zbierać przy górnej
 * krawędzi**, a nie rozsypywać po całej siatce. Rozsypane wyglądają jak bałagan,
 * którego gracz nie robił, i po każdym łupie trzeba je układać od nowa.
 *
 * Obrót zerowy sprawdzamy w całości przed obróconym: kłoda ma leżeć poziomo,
 * dopóki jest na to miejsce.
 */
export function findSpot(bag, kind) {
  for (const rot of [0, 1]) {
    const size = sizeOf(kind, rot);
    if (!size) return null;
    // Kwadratowego przedmiotu nie ma sensu sprawdzać dwa razy.
    if (rot === 1 && size.w === size.h) break;
    for (let y = 0; y + size.h <= bag.h; y++) {
      for (let x = 0; x + size.w <= bag.w; x++) {
        if (fits(bag, kind, rot, x, y)) return { x, y, rot };
      }
    }
  }
  return null;
}

/** Pusty plecak. */
export function makeBag(w = BAG_W, h = BAG_H) {
  return { w, h, items: [], nextId: 1 };
}

/** Dokłada przedmiot, jeśli jest miejsce. Zwraca wpis albo `null`. */
export function addItem(bag, kind) {
  if (!ITEMS[kind]) return null;
  const spot = findSpot(bag, kind);
  if (!spot) return null;
  const item = { id: bag.nextId++, kind, x: spot.x, y: spot.y, rot: spot.rot };
  bag.items.push(item);
  return item;
}
