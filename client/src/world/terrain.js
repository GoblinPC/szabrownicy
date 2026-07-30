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
 * Rozrzut z **wymuszonym minimalnym odstępem**.
 *
 * To jest ta jedna funkcja, która naprawia połowę problemu z wyglądem. Losowanie
 * pozycji niezależnie od siebie daje kępki i pustki — oko czyta to jako bałagan,
 * a nie jako naturę. Odrzucanie punktów, które wypadły za blisko już przyjętych,
 * daje rozkład, który wygląda na rozstawiony ręcznie.
 *
 * Prosta wersja Poissona: losujemy kandydatów i odrzucamy zbyt bliskich. Przy
 * kilkuset obiektach na obszar nie ma sensu nic mądrzejszego.
 */
export function scatter(rng, { x0, y0, x1, y1 }, spacing, tries, accept) {
  const taken = [];
  const min2 = spacing * spacing;

  for (let i = 0; i < tries; i++) {
    const x = rng.range(x0, x1);
    const y = rng.range(y0, y1);
    if (!accept(x, y)) continue;

    let free = true;
    for (const p of taken) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < min2) { free = false; break; }
    }
    if (free) taken.push({ x, y });
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
