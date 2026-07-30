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

// Szerokość nierozciąganego brzegu.
//
// Sześć pikseli, a nie trzy. Trzy wystarczały na kreskę z cieniem, ale **nie
// mieszczą ornamentu w rogu** — a to on odróżnia ramkę zdobną od prostokąta.
// Róg 6×6 daje miejsce na okucie z wąsem wchodzącym na oba boki.
export const SLICE = 6;

// Rampa ramki: ciemne drewno z mosiężnym okuciem. Bliżej złota z gier fantasy
// niż stalowoszarego panelu, a dalej od interfejsu systemowego.
// Profil brzegu **zmierzony z obrazka odniesienia** (`Assets/hud.png`), a nie
// dobrany na oko. Przekrój poziomy przez ramkę panelu gracza dał tam kolejno:
//
//   #010000 #060101  — czarny obrys, dwa piksele
//   #31251c #403122 #4a3b29 #544533  — drewno rosnące ku środkowi listwy
//   #463a2c #2d2922  — i opadające
//   #030203  — czarna kreska od wewnątrz
//   #0e1011  — wypełnienie panelu, prawie czarne i lekko chłodne
//
// Najciekawszy wynik pomiaru: **nasza rampa `wood` już w to trafia**. `#7a5738`
// z palety wobec `#79634b` z obrazka to różnica niewidoczna w grze. Nie trzeba
// więc niczego dokładać do palety — wystarczyło ułożyć warstwy w tej kolejności
// i grubości, co odniesienie.
//
// Okucie narożne jest tam wyraźnie jaśniejsze i **szarozłote**, nie pomarańczowe
// (`#8b7e60`, `#927861`). Stąd `stone 3` zamiast `ember`: pierwsza wersja świeciła
// jak neon właśnie dlatego, że wzięła pomarańcz z ognia.
const FRAME_EDGE = () => c('soot', 0);
const FRAME_DARK = () => c('wood', 0);
const FRAME_MID = () => c('wood', 2);
const FRAME_LIGHT = () => c('wood', 3);
const FRAME_BRASS = () => c('stone', 3);
const FRAME_FILL = () => c('soot', 0);

/**
 * Ramka dziewięciodzielna.
 *
 * Płótno ma 3×3 pola po `SLICE` pikseli. Gra bierze z niego dziewięć kawałków
 * i układa je wokół dowolnego prostokąta.
 *
 * @param tone  `iron` — panele bojowe, `wood` — okna i menu
 * @param fill  czy środek ma być wypełniony (panel), czy pusty (sama ramka)
 */
export function frame9(name, { fill = true } = {}) {
  const size = SLICE * 3;
  const t = new Canvas(size, size);

  if (fill) t.rect(0, 0, size, size, FRAME_FILL());

  // **Faza, nie równa obwódka.**
  //
  // Porównanie z odniesieniem pokazało to od razu: ramka rysowana jednym kolorem
  // dookoła czyta się jak obramowanie tabelki, choćby miała pięć warstw. Wzór ma
  // **światło od góry i z lewej, cień od dołu i z prawej** — dopiero to sprawia,
  // że deska wygląda na grubą.
  t.frame(0, 0, size, size, FRAME_EDGE());
  t.frame(1, 1, size - 2, size - 2, FRAME_DARK());

  // Listwa: jasna u góry i po lewej, ciemna u dołu i po prawej.
  t.hline(2, size - 3, 2, FRAME_LIGHT());
  t.vline(2, 2, size - 3, FRAME_LIGHT());
  t.hline(2, size - 3, size - 3, FRAME_DARK());
  t.vline(size - 3, 2, size - 3, FRAME_DARK());

  t.hline(3, size - 4, 3, FRAME_MID());
  t.vline(3, 3, size - 4, FRAME_MID());
  t.hline(3, size - 4, size - 4, FRAME_EDGE());
  t.vline(size - 4, 3, size - 4, FRAME_EDGE());

  t.frame(4, 4, size - 8, size - 8, FRAME_EDGE());

  // Okucie narożne: jasny kwadrat z wąsami wchodzącymi na oba boki. Na obrazku
  // odniesienia to najjaśniejszy punkt całej ramki i to on odróżnia ramę zdobną
  // od prostokąta. Mieści się wyłącznie dlatego, że róg ma sześć pikseli.
  const brass = FRAME_BRASS();
  const dark = FRAME_DARK();
  const corner = (cx, cy, sx, sy) => {
    t.rect(Math.min(cx, cx + sx), Math.min(cy, cy + sy), 2, 2, brass);
    t.px(cx + sx * 2, cy, brass);
    t.px(cx, cy + sy * 2, brass);
    t.px(cx + sx * 3, cy, dark);
    t.px(cx, cy + sy * 3, dark);
    t.px(cx + sx, cy + sy, dark);
  };
  corner(1, 1, 1, 1);
  corner(size - 2, 1, -1, 1);
  corner(1, size - 2, 1, -1);
  corner(size - 2, size - 2, -1, -1);

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
/**
 * Znacznik uniku — romb 19×19.
 *
 * Poprzednia wersja miała jedenaście pikseli i użytkownik **w ogóle jej nie
 * zauważył**. To jest właściwa lekcja o HUD-zie: element czytany kątem oka musi
 * być wyraźnie większy, niż wydaje się potrzebne, gdy patrzy się na niego wprost.
 */
export function dodgePip(name, { filled = false } = {}) {
  const R = 9;
  const size = R * 2 + 1;
  const t = new Canvas(size, size);
  const outline = c('soot', 0);
  const rim = c('wood', 1);
  const shell = c('stone', 0);
  const hot = c('ember', 2);
  const bright = c('ember', 3);
  const glow = c('ember', 4);

  for (let y = 0; y < size; y++) {
    const span = R - Math.abs(y - R);
    if (span < 0) continue;
    for (let x = R - span; x <= R + span; x++) {
      const d = Math.abs(x - R) + Math.abs(y - R);
      if (d >= R) t.px(x, y, outline);
      else if (d >= R - 1) t.px(x, y, rim);
      else if (!filled) t.px(x, y, shell);
      // Gorący rdzeń jaśnieje ku górze — płaski romb wygląda jak naklejka.
      else t.px(x, y, y < R - 1 ? bright : hot);
    }
  }
  if (filled) {
    t.px(R - 2, R - 3, glow);
    t.px(R - 1, R - 4, glow);
    t.px(R - 3, R - 2, glow);
  }
  return t;
}

/**
 * Wypełnienie paska — **wypukłe, nie płaskie**.
 *
 * Porównanie z odniesieniem pokazało, że paski w grach tego rodzaju nie są
 * prostokątami w kolorze: mają jasny połysk w górnej jednej trzeciej, ciemniejszy
 * spód i ściętą górną krawędź. Bez tego pasek wygląda jak wykres słupkowy.
 *
 * Zwracamy **jeden pionowy plasterek**, który gra rozciąga na dowolną długość —
 * kolor jest stały wzdłuż paska, więc szerokość nie ma tu nic do rzeczy.
 */
export function barSlice(name, ramp) {
  const H = 10;
  const t = new Canvas(1, H);
  for (let y = 0; y < H; y++) {
    const k = y / (H - 1);
    let shade;
    if (k < 0.12) shade = 3;        // górna krawędź: najjaśniejsza
    else if (k < 0.38) shade = 4;   // połysk
    else if (k < 0.72) shade = 2;
    else shade = 1;                 // spód w cieniu
    t.px(0, y, c(ramp, shade));
  }
  return t;
}

export function buildUi() {
  const entries = [];
  const add = (name, canvas) => entries.push({ name, canvas });

  add('frame_panel', frame9('frame_panel', { fill: true }));
  // Ramka bez wypełnienia — do paska życia, którego środek maluje gra.
  add('frame_slot', frame9('frame_slot', { fill: false }));

  add('bar_cap_life', barCap('bar_cap_life', { tone: 'goblin' }));
  add('bar_cap_low', barCap('bar_cap_low', { tone: 'ember' }));

  // Plasterki wypełnień. Rozciągane w poziomie przez grę.
  add('bar_life', barSlice('bar_life', 'goblin'));
  add('bar_hurt', barSlice('bar_hurt', 'ember'));
  add('bar_empty', barSlice('bar_empty', 'soot'));

  add('pip_empty', dodgePip('pip_empty', { filled: false }));
  add('pip_full', dodgePip('pip_full', { filled: true }));

  return entries;
}
