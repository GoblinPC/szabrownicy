// Teren za murami miasta.
//
// Zasady spisane w `docs/TEREN.md`. Najważniejsza jest kolejność warstw:
// **każda ogranicza następną**. Rozrzut wygląda źle nie dlatego, że jest losowy,
// tylko dlatego, że jest jednorodny — nic nie zależy od niczego. Drzewo ma stać
// na skraju polany przy drodze w danym biomie, a nie gdziekolwiek.
//
// Warstwy, w tej kolejności:
//   1. biomy — trzy obszary, po jednym za każdą bramą,
//   2. drogi z bram, schodzące się przed miastem,
//   3. polany i gęstwiny — skupiska, nie równy posyp,
//   4. obiekty przez próbkowanie z minimalnym odstępem.

import { makeRng, seedFrom } from '../util/rng.js';

/**
 * Trzy obszary za bramami. Każdy ma **własny punkt orientacyjny i własny
 * surowiec** — dwa obozy bandytów obok siebie to jeden obóz widziany dwa razy.
 */
export const REGIONS = [
  { key: 'las', dir: 'south', ground: 'grass', tree: 0.62, rock: 0.06, bush: 0.5 },
  { key: 'skalisko', dir: 'west', ground: 'dirt', tree: 0.12, rock: 0.7, bush: 0.2 },
  { key: 'mokradla', dir: 'east', ground: 'dirt', tree: 0.34, rock: 0.1, bush: 0.62 },
];

/**
 * Polany.
 *
 * Las o równej gęstości jest ścianą, po której się chodzi, a nie miejscem, przez
 * które się idzie — użytkownik nazwał to wprost: „gęsto te drzewa". Polana daje
 * trzy rzeczy naraz: **prześwit dla oka**, miejsce, w którym da się walczyć,
 * i kontrast, który przyciąga — bo jest jaśniejsza od otoczenia.
 *
 * Osobne, rzadsze pole szumu: duże plamy, w których nic nie rośnie.
 */
export function inClearing(x, y) {
  return field(x, y, 8.9) > 0.66;
}

/**
 * Wspólna lista zajętości dla **wszystkich** warstw rozrzutu.
 *
 * Poprzednia wersja pilnowała odstępu osobno w każdym wywołaniu `scatter()`:
 * drzewa nie wchodziły na drzewa, głazy na głazy — ale głaz o drzewie nie
 * wiedział nic. Zgłoszone z gry: *głazy nachodzą na inne obiekty, a zagęszczenie
 * jest takie, że ledwo da się przejść przez mapę*. Jedna wspólna lista usuwa
 * przyczynę zamiast łatać skutki.
 *
 * Każdy obiekt wnosi **własny promień zajętości**, a odległość sprawdzamy jako
 * sumę dwóch promieni. Dzięki temu jedna reguła obsługuje wszystkie pary: dwa
 * drzewa muszą stać daleko od siebie, ale gałąź wolno położyć tuż przy pniu,
 * bo jej promień jest prawie zerowy. Wspólne `spacing` dla całej mapy dałoby
 * albo zlewające się korony, albo rozrzucone pojedynczo patyki.
 *
 * Szukanie po siatce, nie po całej liście: obiektów na mapie 160×120 kafli jest
 * kilka tysięcy, a bez siatki każdy kandydat porównywałby się z każdym przyjętym.
 */
export class Zajętość {
  constructor(cell = 64) {
    this.cell = cell;
    this.grid = new Map();
  }

  klucz(cx, cy) { return cy * 100000 + cx; }

  /** Czy punkt o danym promieniu nie wchodzi na nic postawionego wcześniej. */
  wolne(x, y, radius) {
    // Zasięg przeszukania musi objąć **największy promień, jaki gdziekolwiek
    // wystąpił**, a nie tylko własny: drzewo postawione wcześniej sięga dalej
    // niż kamyk, który właśnie sprawdzamy.
    const zasięg = radius + (this.maxR ?? 0);
    const c0x = Math.floor((x - zasięg) / this.cell);
    const c1x = Math.floor((x + zasięg) / this.cell);
    const c0y = Math.floor((y - zasięg) / this.cell);
    const c1y = Math.floor((y + zasięg) / this.cell);

    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const kubełek = this.grid.get(this.klucz(cx, cy));
        if (!kubełek) continue;
        for (const p of kubełek) {
          const dx = p.x - x;
          const dy = p.y - y;
          const min = radius + p.r;
          if (dx * dx + dy * dy < min * min) return false;
        }
      }
    }
    return true;
  }

  dodaj(x, y, radius) {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const k = this.klucz(cx, cy);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push({ x, y, r: radius });
    this.maxR = Math.max(this.maxR ?? 0, radius);
  }
}

/**
 * Rozrzut z **wymuszonym minimalnym odstępem**.
 *
 * To jest ta jedna funkcja, która naprawia połowę problemu z wyglądem. Losowanie
 * pozycji niezależnie od siebie daje kępki i pustki — oko czyta to jako bałagan,
 * a nie jako naturę. Odrzucanie punktów, które wypadły za blisko już przyjętych,
 * daje rozkład, który wygląda na rozstawiony ręcznie.
 *
 * Prosta wersja Poissona: losujemy kandydatów i odrzucamy zbyt bliskich. Odstęp
 * jest teraz **promieniem obiektu** wnoszonym do wspólnej listy zajętości, więc
 * dwa drzewa dzieli suma ich promieni, a drzewo od gałęzi — znacznie mniej.
 */
export function scatter(rng, { x0, y0, x1, y1 }, radius, tries, accept, zajętość) {
  const taken = [];

  for (let i = 0; i < tries; i++) {
    const x = rng.range(x0, x1);
    const y = rng.range(y0, y1);
    if (!accept(x, y)) continue;
    if (!zajętość.wolne(x, y, radius)) continue;
    zajętość.dodaj(x, y, radius);
    taken.push({ x, y });
  }
  return taken;
}

/**
 * Wartość szumu w punkcie — suma trzech fal o niewspółmiernych okresach.
 *
 * Zamiast prawdziwego szumu Perlina, którego tu nie potrzeba: chodzi o miękkie
 * plamy gęstości, a nie o wierny teren. Trzy fale wystarczą, żeby nigdzie nie
 * było widać rytmu.
 */
export function field(x, y, seed) {
  const a = Math.sin(x * 0.031 + seed) * Math.cos(y * 0.027 - seed);
  const b = Math.sin((x + y) * 0.014 + seed * 2.3);
  const c = Math.cos(x * 0.008 - y * 0.011 + seed * 0.7);
  return (a * 0.5 + b * 0.3 + c * 0.2 + 1) / 2;   // 0..1
}
