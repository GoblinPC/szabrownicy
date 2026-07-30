// Grafika interfejsu: ramki, paski i znaczniki.
//
// Wszystko z tej samej zamkniętej palety co świat i z tą samą regułą obrysu —
// najciemniejszy odcień materiału, nigdy czysta czerń. Interfejs ma wyglądać,
// jakby był z tego samego świata co kuźnia: **kute żelazo i ciemne drewno**,
// a nie jak okienko systemowe położone na grze.
//
// Kluczowa decyzja: **ramki są dziewięciodzielne (9-slice)**.
//
// Jeden mały sprite — cztery rogi, cztery boki i środek — rozciąga się na dowolny
// rozmiar bez rozmycia rogów, bo rozciągane są tylko boki i środek. Dzięki temu
// ta sama ramka obsłuży pasek życia, panel plecaka i okno opcji, a wszystko będzie
// wyglądać jak jeden przedmiot zamiast trzech różnych paneli. Alternatywa —
// rysowanie każdego panelu osobno w jego rozmiarze — kończy się tym, że po
// pierwszej zmianie układu połowa okien wygląda inaczej niż druga.

import { Canvas } from './canvas.js';
import { c } from './palette.js';
import { makeRng, seedFrom } from './rng.js';

const rngFor = (name) => makeRng(seedFrom(name));

// Szerokość nierozciąganego brzegu. Trzy piksele to minimum, przy którym mieści
// się obrys, jasna krawędź i cień — czyli tyle, ile trzeba, żeby ramka wyglądała
// na kutą, a nie narysowaną kreską.
export const SLICE = 3;

/**
 * Ramka dziewięciodzielna.
 *
 * Płótno ma 3×3 pola po `SLICE` pikseli. Gra bierze z niego dziewięć kawałków
 * i układa je wokół dowolnego prostokąta.
 *
 * @param tone  `iron` — panele bojowe, `wood` — okna i menu
 * @param fill  czy środek ma być wypełniony (panel), czy pusty (sama ramka)
 */
export function frame9(name, { tone = 'iron', fill = true } = {}) {
  const rng = rngFor(name);
  const size = SLICE * 3;
  const t = new Canvas(size, size);

  const dark = c(tone, 0);
  const mid = c(tone, 2);
  const light = c(tone, 3);
  const inner = tone === 'wood' ? c('soot', 1) : c('soot', 0);

  if (fill) t.rect(0, 0, size, size, inner);

  // Brzeg: ciemny obrys na zewnątrz, metal w środku brzegu, jasna krawędź od góry
  // i od lewej. Światło pada z góry z lewej — tak samo jak w całej reszcie grafiki.
  t.frame(0, 0, size, size, dark);
  t.frame(1, 1, size - 2, size - 2, mid);
  t.hline(1, size - 2, 1, light);
  t.vline(1, 1, size - 2, light);
  t.hline(1, size - 2, size - 2, dark);
  t.vline(size - 2, 1, size - 2, dark);

  // Nit w rogu. Jeden piksel, a to on odróżnia kutą ramkę od prostokąta.
  t.px(1, 1, c(tone, 4));
  t.px(size - 2, 1, c(tone, 4));
  t.px(1, size - 2, c(tone, 4));
  if (rng.chance(0.5)) t.px(size - 2, size - 2, c(tone, 4));

  return t;
}

/**
 * Zakończenie paska — ząbki zamiast równej krawędzi.
 *
 * Wypełnienie ucięte pionową linijką czyta się jak wykres, nie jak zapas sił.
 * Ząbki są tanie i to one robią całą różnicę.
 */
export function barCap(name, { tone = 'goblin' } = {}) {
  const rng = rngFor(name);
  const t = new Canvas(3, 9);
  for (let y = 0; y < 9; y++) {
    const bite = rng.chance(0.45) ? 1 : 0;
    for (let x = 0; x < 3 - bite; x++) t.px(x, y, c(tone, x === 0 ? 3 : 2));
  }
  return t;
}

/**
 * Znacznik uniku — romb.
 *
 * Trzy stany w jednym sprite'cie byłyby wygodne, ale ładowanie musi być **płynne**,
 * więc gra rysuje wypełnienie sama, przycinając ten kształt. Tutaj powstaje sama
 * skorupa: obrys i wnętrze do wypełnienia.
 */
export function dodgePip(name, { filled = false } = {}) {
  const t = new Canvas(11, 11);
  const outline = c('soot', 0);
  const shell = c('stone', 1);
  const hot = c('ember', 3);
  const glow = c('ember', 4);

  for (let y = 0; y < 11; y++) {
    // Romb: |x-5| + |y-5| <= 5. Rysowany wierszami, żeby krawędź była schodkowa
    // i pikselowa, a nie wygładzona.
    const span = 5 - Math.abs(y - 5);
    if (span < 0) continue;
    for (let x = 5 - span; x <= 5 + span; x++) {
      const edge = Math.abs(x - 5) + Math.abs(y - 5) >= 5;
      if (edge) t.px(x, y, outline);
      else t.px(x, y, filled ? hot : shell);
    }
  }
  // Błysk na gotowym znaczniku — po nim widać z daleka, że unik jest naładowany.
  if (filled) {
    t.px(4, 4, glow);
    t.px(5, 3, glow);
  }
  return t;
}

export function buildUi() {
  const entries = [];
  const add = (name, canvas) => entries.push({ name, canvas });

  add('frame_iron', frame9('frame_iron', { tone: 'iron' }));
  add('frame_wood', frame9('frame_wood', { tone: 'wood' }));
  // Ramka bez wypełnienia — do paska życia, którego środek maluje gra.
  add('frame_slot', frame9('frame_slot', { tone: 'iron', fill: false }));

  add('bar_cap_life', barCap('bar_cap_life', { tone: 'goblin' }));
  add('bar_cap_low', barCap('bar_cap_low', { tone: 'ember' }));

  add('pip_empty', dodgePip('pip_empty', { filled: false }));
  add('pip_full', dodgePip('pip_full', { filled: true }));

  return entries;
}
