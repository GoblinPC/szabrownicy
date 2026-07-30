// Obiekty świata. Każdy ma punkt zaczepienia na dole pośrodku, żeby sortowanie
// po osi Y odpowiadało temu, co gracz widzi: kto stoi niżej, ten jest z przodu.
//
// Wspólne zasady: górna płaszczyzna dostaje najjaśniejszy odcień rampy, front
// średni, spód najciemniejszy, a całość obrys w kolorze sadzy — dzięki temu
// sylwetka czyta się nawet w mroku, gdy warstwa świetlna przygasi wnętrze.

import { Canvas } from './canvas.js';
import { c } from './palette.js';
import { makeRng, seedFrom } from './rng.js';

const rngFor = (name) => makeRng(seedFrom(name));
const OUTLINE = c('soot', 0);

/** Domyka obiekt obrysem — wywoływane na końcu każdego generatora. */
function finish(t) {
  return t.outline(OUTLINE);
}

/** Deski ułożone pionowo z okuciami — beczki, skrzynie, wiadra. */
function staves(t, x, y, w, h, ramp = 'wood') {
  t.rect(x, y, w, h, c(ramp, 2));
  for (let i = x + 2; i < x + w; i += 3) t.vline(i, y, y + h - 1, c(ramp, 1));
  t.vline(x, y, y + h - 1, c(ramp, 1));
  t.hline(x, x + w - 1, y + h - 1, c(ramp, 0));
}

// --- Kuźnia -------------------------------------------------------------------

/** Palenisko z okapem — główne źródło światła we wnętrzu. */
function hearth() {
  const rng = rngFor('hearth');
  const t = new Canvas(34, 40);

  // Okap zwężający się ku kominowi.
  for (let y = 0; y < 20; y++) {
    const half = Math.round(6 + (y / 20) * 9);
    t.hline(17 - half, 16 + half, y, c('stone', 2));
    t.hline(17 - half, 13 - half + 4, y, c('stone', 3)); // światło na lewej połaci
    t.px(17 - half, y, c('stone', 0));
    t.px(16 + half, y, c('stone', 0));
    if (y % 6 === 0) t.hline(17 - half, 16 + half, y, c('stone', 1));
  }
  // Osad dymu ciągnący się w górę okapu — przygaszenie, nie czarne plamy.
  for (let y = 0; y < 20; y++) {
    for (let x = 4; x < 30; x++) {
      if (rng.next() < 0.4 * (1 - y / 24)) t.px(x, y, [0x14, 0x10, 0x0f, 70]);
    }
  }

  // Kamienna podstawa.
  t.rect(1, 20, 32, 18, c('stone', 1));
  t.hline(1, 32, 20, c('stone', 3));
  for (let row = 0; row < 3; row++) {
    const y = 21 + row * 6;
    t.hline(1, 32, y, c('stone', 0));
    t.hline(1, 32, y + 1, c('stone', 2));
    t.vline(row % 2 === 0 ? 9 : 16, y, y + 5, c('stone', 0));
    t.vline(row % 2 === 0 ? 24 : 28, y, y + 5, c('stone', 0));
  }
  t.speckle(rng, c('stone', 0), 0.07, { x: 1, y: 20, w: 32, h: 18 });

  // Czeluść paleniska: ciemne wnętrze, żar u dołu, gorące kamienie przy krawędzi.
  t.rect(9, 22, 16, 13, c('soot', 0));
  t.rect(9, 22, 16, 2, c('soot', 1));
  for (let y = 28; y < 35; y++) {
    for (let x = 9; x < 25; x++) {
      const heat = (y - 27) / 7;
      if (rng.next() < heat * 0.8) {
        const shade = rng.next() < heat * 0.6 ? 3 : 1;
        t.px(x, y, c('ember', shade));
      }
    }
  }
  for (let x = 9; x < 25; x++) {
    if (rng.chance(0.5)) t.px(x, 34, c('ember', 4));
    t.px(x, 35, c('ember', 0));
  }
  t.frame(8, 21, 18, 15, c('iron', 1)); // okucie czeluści
  t.hline(8, 25, 21, c('iron', 2));
  return finish(t);
}

/** Kowadło na pniaku — punkt orientacyjny środka kuźni. */
function anvil() {
  const t = new Canvas(16, 17);
  // Pniak.
  t.rect(3, 10, 10, 6, c('wood', 2));
  t.hline(3, 12, 10, c('wood', 3));
  t.hline(3, 12, 15, c('wood', 0));
  t.vline(6, 11, 15, c('wood', 1));
  t.vline(10, 11, 15, c('wood', 1));

  // Korpus: płyta, przewężenie, stopa, róg po lewej.
  t.rect(2, 1, 12, 3, c('iron', 3));
  t.hline(2, 13, 1, c('iron', 4));
  t.hline(2, 13, 3, c('iron', 1));
  t.line(1, 2, 0, 3, c('iron', 2));
  t.rect(5, 4, 6, 3, c('iron', 2));
  t.rect(6, 5, 4, 2, c('iron', 1));
  t.rect(3, 7, 10, 3, c('iron', 2));
  t.hline(3, 12, 7, c('iron', 3));
  t.hline(3, 12, 9, c('iron', 0));
  return finish(t);
}

/** Kadź hartownicza — woda dostaje refleks, żeby łapała światło paleniska. */
function trough() {
  const t = new Canvas(20, 16);
  staves(t, 0, 4, 20, 11);
  t.rect(2, 2, 16, 4, c('night', 1)); // woda
  t.rect(2, 2, 16, 1, c('night', 3));
  t.hline(4, 9, 3, c('night', 4));
  t.hline(12, 15, 4, c('night', 2));
  t.frame(0, 2, 20, 13, c('wood', 1));
  t.hline(0, 19, 8, c('iron', 2)); // obręcz
  t.hline(0, 19, 13, c('iron', 2));
  return finish(t);
}

/** Miech przy palenisku — szeroki z tyłu, zwężający się ku dyszy. */
function bellows() {
  const t = new Canvas(24, 15);
  for (let x = 0; x < 19; x++) {
    const half = Math.round(6.5 * Math.sqrt(Math.max(0, 1 - (x / 18) ** 2)));
    if (half < 1) continue;
    t.vline(x, 7 - half, 7 + half, c('wood', 2));
    t.px(x, 7 - half, c('wood', 3)); // górna deska łapie światło
    t.px(x, 7 + half, c('wood', 0)); // spód w cieniu
  }
  for (let x = 2; x < 17; x += 3) t.vline(x, 4, 10, c('wood', 1)); // skórzane fałdy
  t.hline(0, 17, 7, c('wood', 4));   // szpara między deskami
  t.rect(18, 6, 6, 3, c('iron', 2)); // dysza
  t.hline(18, 23, 6, c('iron', 3));
  t.hline(18, 23, 8, c('iron', 1));
  t.rect(0, 1, 3, 4, c('wood', 3));  // rączka
  return finish(t);
}

/** Stół roboczy z narzędziami. */
function workbench() {
  const t = new Canvas(30, 18);
  t.rect(0, 2, 30, 4, c('wood', 3)); // blat
  t.hline(0, 29, 2, c('wood', 4));
  t.hline(0, 29, 5, c('wood', 1));
  t.rect(1, 6, 4, 11, c('wood', 1)); // nogi
  t.rect(25, 6, 4, 11, c('wood', 1));
  t.rect(5, 7, 20, 3, c('soot', 1)); // cień pod blatem
  // Narzędzia leżące na blacie.
  t.rect(4, 0, 2, 2, c('iron', 2));
  t.rect(3, 0, 4, 1, c('iron', 3));
  t.vline(5, 1, 2, c('wood', 2));
  t.rect(11, 0, 6, 2, c('iron', 1));
  t.hline(11, 16, 0, c('iron', 3));
  t.rect(21, 0, 3, 2, c('copper'));
  return finish(t);
}

/** Stojak z bronią — docelowo witryna sklepu. */
function rack() {
  const t = new Canvas(20, 28);
  t.rect(0, 24, 20, 3, c('wood', 1)); // podstawa
  t.rect(1, 2, 3, 23, c('wood', 2));  // słupki
  t.rect(16, 2, 3, 23, c('wood', 2));
  t.rect(0, 1, 20, 3, c('wood', 3));  // belka górna
  t.hline(0, 19, 1, c('wood', 4));

  // Trzy sztuki broni oparte o stojak.
  t.rect(6, 4, 2, 18, c('iron', 3));
  t.rect(6, 4, 2, 2, c('iron', 4));
  t.rect(5, 21, 4, 2, c('wood', 2));
  t.rect(10, 6, 2, 16, c('iron', 2));
  t.rect(9, 5, 4, 2, c('iron', 3));
  t.rect(10, 21, 2, 3, c('copper'));
  t.rect(13, 8, 3, 6, c('iron', 2)); // topór
  t.rect(14, 13, 1, 10, c('wood', 2));
  return finish(t);
}

/** Regał ze skrzyniami i słojami. */
function shelf() {
  const t = new Canvas(26, 24);
  t.rect(0, 0, 26, 24, c('wood', 1));
  for (let i = 0; i < 3; i++) {
    const y = 1 + i * 8;
    t.rect(1, y, 24, 6, c('soot', 1));
    t.hline(1, 24, y + 6, c('wood', 3));
  }
  t.rect(3, 2, 5, 5, c('wood', 3));   // skrzynka
  t.rect(12, 3, 4, 4, c('copper'));   // dzban
  t.rect(4, 10, 4, 5, c('night', 2)); // słoje
  t.rect(10, 11, 3, 4, c('ember', 1));
  t.rect(17, 10, 5, 5, c('wood', 2));
  t.rect(6, 18, 6, 5, c('wood', 3));
  t.rect(16, 19, 4, 4, c('iron', 2));
  return finish(t);
}

/**
 * Pochodnia ścienna. Kluczowy jest wspornik u dołu: to on wbija się w mur
 * i sprawia, że pochodnia wisi, a nie stoi oparta o ścianę. Trzonek jest krótki
 * i pochylony, bo długi kij czytał się jak włócznia postawiona przy murze.
 */
function torch() {
  const t = new Canvas(8, 12);
  t.rect(0, 8, 3, 4, c('iron', 1)); // stopa wbita w mur
  t.hline(0, 2, 8, c('iron', 2));
  t.vline(0, 8, 11, c('iron', 0));
  t.line(2, 10, 5, 6, c('iron', 2)); // ukośne ramię
  t.line(2, 9, 5, 5, c('iron', 3));

  t.rect(3, 3, 2, 6, c('wood', 2)); // trzonek
  t.vline(3, 3, 8, c('wood', 3));
  t.vline(4, 3, 8, c('wood', 1));

  t.rect(2, 1, 4, 3, c('iron', 2)); // czasza
  t.hline(2, 5, 1, c('iron', 3));
  t.hline(1, 6, 3, c('iron', 1));
  t.rect(3, 0, 2, 1, c('ember', 2)); // żar w czaszy
  return finish(t);
}

// --- Plac ---------------------------------------------------------------------

function barrel() {
  const t = new Canvas(12, 18);
  staves(t, 0, 3, 12, 14);
  t.ellipse(6, 4, 6, 3, c('wood', 3)); // wieko
  t.ellipse(6, 4, 4, 2, c('wood', 4));
  t.hline(0, 11, 8, c('iron', 2));
  t.hline(0, 11, 14, c('iron', 2));
  t.hline(0, 11, 9, c('iron', 1));
  return finish(t);
}

function crate() {
  const t = new Canvas(15, 16);
  t.rect(0, 3, 15, 12, c('wood', 2));
  t.rect(0, 3, 15, 2, c('wood', 3)); // górna płaszczyzna
  t.frame(0, 3, 15, 12, c('wood', 1));
  t.line(1, 13, 13, 5, c('wood', 1)); // zastrzał
  t.hline(0, 14, 14, c('wood', 0));
  t.vline(2, 4, 14, c('wood', 1));
  t.vline(12, 4, 14, c('wood', 1));
  return finish(t);
}

function bucket() {
  const t = new Canvas(10, 12);
  staves(t, 0, 3, 10, 8);
  t.hline(0, 9, 6, c('iron', 2));
  t.ellipse(5, 3, 5, 2, c('night', 2)); // woda
  t.line(0, 3, 5, 0, c('iron', 2));     // pałąk
  t.line(5, 0, 9, 3, c('iron', 2));
  return finish(t);
}

function well() {
  const t = new Canvas(24, 26);
  t.rect(2, 12, 20, 12, c('stone', 1)); // cembrowina
  t.ellipse(12, 13, 10, 4, c('stone', 2));
  t.ellipse(12, 13, 8, 3, c('soot', 0)); // otwór
  for (let row = 0; row < 2; row++) {
    const y = 16 + row * 4;
    t.hline(2, 21, y, c('stone', 0));
    t.hline(2, 21, y + 1, c('stone', 3));
  }
  t.rect(3, 2, 2, 11, c('wood', 2)); // słupki daszku
  t.rect(19, 2, 2, 11, c('wood', 2));
  for (let i = 0; i < 6; i++) { // daszek dwuspadowy
    t.hline(2 + i, 21 - i, i, c('wood', i % 2 ? 2 : 3));
  }
  t.rect(6, 8, 12, 2, c('wood', 1)); // wał
  t.rect(11, 9, 2, 4, c('iron', 2)); // łańcuch
  return finish(t);
}

function cart() {
  const t = new Canvas(30, 24);
  t.rect(2, 6, 26, 9, c('wood', 2)); // skrzynia
  t.rect(2, 6, 26, 2, c('wood', 3));
  for (let x = 4; x < 28; x += 4) t.vline(x, 8, 14, c('wood', 1));
  t.hline(2, 27, 14, c('wood', 0));
  t.rect(0, 4, 30, 2, c('wood', 1)); // burta
  // Koła z piastą i szprychami.
  for (const cx of [7, 22]) {
    t.ellipse(cx, 18, 6, 6, c('wood', 1));
    t.ellipse(cx, 18, 4, 4, c('soot', 1));
    t.ellipse(cx, 18, 2, 2, c('wood', 3));
    t.hline(cx - 5, cx + 5, 18, c('wood', 2));
    t.vline(cx, 13, 23, c('wood', 2));
  }
  t.rect(24, 2, 6, 2, c('foliage', 2)); // ładunek
  t.rect(4, 2, 8, 3, c('wood', 3));
  return finish(t);
}

function noticeBoard() {
  const t = new Canvas(22, 26);
  t.rect(3, 20, 3, 6, c('wood', 1)); // nogi
  t.rect(16, 20, 3, 6, c('wood', 1));
  t.rect(0, 2, 22, 19, c('wood', 2)); // tablica
  t.frame(0, 2, 22, 19, c('wood', 1));
  t.rect(2, 4, 18, 15, c('wood', 3));
  for (let i = 0; i < 8; i++) { // słoje desek
    t.hline(2, 19, 5 + i * 2, c('wood', 2));
  }
  // Przypięte kartki.
  t.rect(4, 6, 7, 6, c('parchment'));
  t.rect(4, 6, 7, 1, c('bone'));
  t.rect(13, 9, 6, 7, c('parchment'));
  t.px(7, 6, c('iron', 3));
  t.px(16, 9, c('iron', 3));
  for (let i = 0; i < 5; i++) t.hline(5, 9, 8 + i, i % 2 ? c('soot', 2) : c('soot', 1));
  for (let i = 0; i < 4; i++) t.hline(14, 18, 11 + i, i % 2 ? c('soot', 2) : c('soot', 1));
  for (let i = 0; i < 4; i++) { // daszek
    t.hline(i, 21 - i, i, c('wood', i % 2 ? 1 : 2));
  }
  return finish(t);
}

/**
 * Kukła treningowa: słup wbity w ziemię, snopek siana przewiązany powrozem,
 * worek zamiast głowy i poprzeczka udająca ramiona.
 *
 * Siano nie ma własnej rampy w palecie — bierzemy je z drewna od najjaśniejszej
 * strony (`wood 3` i `wood 4`), bo to najbliższy suchej trawie odcień, jaki mamy.
 * Sam snopek rysujemy krótkimi kreskami pod kątem, nie plamą: jednolity prostokąt
 * czyta się jak worek z piaskiem, a nie jak wiązka słomy.
 *
 * `damage` od 0 do 2 — im wyżej, tym więcej wyrwanych kłaków i tym mocniej kukła
 * przekrzywiona. Stan trzeci to kukła zwalona na ziemię.
 */
function dummy(damage = 0) {
  const rng = rngFor(`dummy${damage}`);
  const t = new Canvas(20, 32);
  const fallen = damage >= 3;

  const straw = [c('wood', 3), c('wood', 4)];
  const rope = c('copper');
  const sack = c('stone', 3);

  // Przekrzywienie rośnie z obiciem — kukła po kilku ciosach nie stoi już prosto.
  const tilt = fallen ? 0 : damage;

  if (fallen) {
    // Zwalona: słup leży na skos, snopek obok niego, worek z głową na końcu.
    // Rysowana nisko i szeroko, bo leżący obiekt musi się od stojącego różnić
    // sylwetką, a nie tylko szczegółem — sama deska w poprzek czytała się jak
    // porzucony bal drewna.
    for (let i = 0; i < 15; i++) {
      const y = 30 - Math.floor(i / 3);
      t.px(3 + i, y, c('wood', 1));
      t.px(3 + i, y - 1, c('wood', 2));
    }

    // Rozsypany snopek — wiązka, która się rozjechała po ziemi.
    for (let i = 0; i < 40; i++) {
      const x = 5 + rng.int(0, 12);
      const y = 24 + rng.int(0, 6);
      t.px(x, y, straw[rng.int(0, 1)]);
    }
    // Kilka pojedynczych słomek odrzuconych dalej.
    for (let i = 0; i < 6; i++) t.px(1 + rng.int(0, 17), 22 + rng.int(0, 9), straw[1]);

    // Worek: leży na boku, twarz przekrzywiona.
    t.rect(11, 22, 8, 6, sack);
    t.hline(11, 18, 22, c('stone', 4));
    t.hline(11, 18, 27, c('stone', 1));
    t.px(14, 24, c('soot', 1));
    t.px(17, 25, c('soot', 1));
    t.hline(2, 6, 30, rope); // powróz, który się zsunął

    return finish(t);
  }

  // Słup wbity w ziemię.
  t.rect(9, 18, 3, 14, c('wood', 1));
  t.vline(9, 18, 31, c('wood', 0));
  t.vline(11, 18, 31, c('wood', 2));

  // Poprzeczka na ramiona.
  t.rect(3 + tilt, 13, 15, 2, c('wood', 1));
  t.hline(3 + tilt, 17 + tilt, 13, c('wood', 2));

  // Snopek: tułów z krótkich kresek pod kątem.
  const bodyX = 4 + tilt;
  for (let row = 0; row < 12; row++) {
    const y = 12 + row;
    const inset = row > 9 ? 2 : 0;
    for (let x = bodyX + inset; x < bodyX + 12 - inset; x++) {
      // Ukośne pasma słomy — sąsiednie wiersze przesunięte, więc powstaje splot.
      const shade = (x + row) % 3 === 0 ? 1 : 0;
      t.px(x, y, straw[shade]);
    }
  }
  // Cień pod poprzeczką i przy dolnej krawędzi snopka.
  t.hline(bodyX, bodyX + 11, 12, c('wood', 2));
  t.hline(bodyX + 2, bodyX + 9, 23, c('wood', 2));

  // Powrozy: pas i przewiązanie pod workiem.
  t.hline(bodyX, bodyX + 11, 17, rope);
  t.hline(bodyX + 1, bodyX + 10, 18, c('wood', 1));
  t.hline(bodyX + 2, bodyX + 9, 11, rope);

  // Worek na głowę, z zaznaczonym miejscem na cios.
  t.rect(bodyX + 2, 4, 8, 7, sack);
  t.hline(bodyX + 3, bodyX + 8, 4, c('stone', 4));
  t.hline(bodyX + 2, bodyX + 9, 10, c('stone', 1));
  t.px(bodyX + 4, 7, c('soot', 1));
  t.px(bodyX + 7, 7, c('soot', 1));
  t.hline(bodyX + 4, bodyX + 7, 9, c('soot', 1));
  // Kłaki słomy wystające z worka.
  t.px(bodyX + 1, 5, straw[1]);
  t.px(bodyX + 10, 6, straw[1]);

  // Obicie musi **wygryzać sylwetkę**, nie tylko ją brudzić. Pierwsza wersja
  // dokładała ciemne kropki na snopku i trzy stany zużycia wyglądały identycznie —
  // na tle wielobarwnej słomy plamka po prostu ginie. Kontur widać zawsze.
  if (damage > 0) {
    // Wyrwy w krawędziach: kasujemy piksele, obrys dorysuje się na nowo w `finish`.
    for (let i = 0; i < damage * 7; i++) {
      const left = rng.chance(0.5);
      const x = left ? bodyX : bodyX + 11;
      const y = 13 + rng.int(0, 9);
      t.px(x, y, null);
      if (rng.chance(0.5)) t.px(left ? x + 1 : x - 1, y, null);
    }

    // Przetarcia w środku — kilka ciemniejszych, żeby snopek nie był równy.
    for (let i = 0; i < damage * 6; i++) {
      t.px(bodyX + 2 + rng.int(0, 7), 13 + rng.int(0, 9), c('wood', 2));
    }

    // Kłaki wystające na zewnątrz — po nich widać, że wiązka się pruje.
    for (let i = 0; i < damage * 4; i++) {
      const side = rng.chance(0.5) ? bodyX - 2 : bodyX + 13;
      t.px(side, 14 + rng.int(0, 8), straw[1]);
    }

    // Przy mocnym obiciu worek na głowie też dostaje: naddarty brzeg.
    if (damage >= 2) {
      t.px(bodyX + 2, 5, null);
      t.px(bodyX + 9, 6, null);
      t.px(bodyX + 3, 4, null);
    }
  }

  return finish(t);
}

function logPile() {
  const t = new Canvas(24, 16);
  const rng = rngFor('logs');
  for (let row = 0; row < 3; row++) {
    const y = 12 - row * 4;
    const inset = row * 3;
    for (let x = inset; x < 24 - inset; x += 5) {
      t.ellipse(x + 2, y, 3, 2, c('wood', 2));
      t.ellipse(x + 2, y - 1, 2, 1, c('wood', 3));
      t.px(x + 2, y - 1, c('wood', 1));
      if (rng.chance(0.4)) t.px(x + 3, y, c('wood', 4));
    }
  }
  return finish(t);
}

function tree() {
  const rng = rngFor('tree');
  const t = new Canvas(34, 46);
  // Pień z korzeniami.
  t.rect(14, 30, 6, 15, c('wood', 1));
  t.rect(15, 30, 3, 15, c('wood', 2));
  t.vline(16, 32, 44, c('wood', 3));
  t.line(14, 42, 10, 45, c('wood', 1));
  t.line(19, 42, 23, 45, c('wood', 1));

  // Korona z kilku zachodzących na siebie kęp.
  const blobs = [[17, 14, 15, 12], [9, 20, 9, 8], [25, 20, 9, 8], [17, 24, 12, 8], [12, 10, 7, 6], [23, 11, 7, 6]];
  for (const [cx, cy, rx, ry] of blobs) t.ellipse(cx, cy, rx, ry, c('foliage', 2));
  // Światło pada z góry z lewej, więc tam kładziemy jaśniejsze odcienie.
  for (const [cx, cy, rx, ry] of blobs) t.ellipse(cx - 1, cy - 2, rx - 2, ry - 2, c('foliage', 3));
  t.ellipse(13, 12, 6, 5, c('foliage', 4));
  t.ellipse(20, 16, 5, 4, c('foliage', 4));
  // Spód korony ciemnieje.
  for (const [cx, cy, rx, ry] of blobs) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      for (let y = cy + Math.floor(ry * 0.4); y <= cy + ry; y++) {
        if (t.alphaAt(x, y) > 0 && rng.chance(0.5)) t.px(x, y, c('foliage', 1));
      }
    }
  }
  t.speckle(rng, c('foliage', 0), 0.05, { x: 2, y: 4, w: 30, h: 28 });
  return finish(t);
}

function boulder() {
  const rng = rngFor('boulder');
  const t = new Canvas(17, 14);
  t.ellipse(8, 9, 8, 5, c('stone', 1));
  t.ellipse(8, 8, 7, 4, c('stone', 2));
  t.ellipse(6, 6, 4, 2, c('stone', 3));
  t.speckle(rng, c('stone', 0), 0.12, { x: 1, y: 5, w: 15, h: 9 });
  return finish(t);
}

function fence() {
  const t = new Canvas(16, 18);
  t.rect(1, 4, 3, 13, c('wood', 2));
  t.rect(11, 4, 3, 13, c('wood', 2));
  t.hline(1, 3, 4, c('wood', 3));
  t.hline(11, 13, 4, c('wood', 3));
  t.rect(0, 7, 16, 2, c('wood', 2));
  t.rect(0, 12, 16, 2, c('wood', 2));
  t.hline(0, 15, 7, c('wood', 3));
  t.hline(0, 15, 12, c('wood', 3));
  return finish(t);
}

/** Ognisko na placu — miejsce, przy którym gracze naturalnie się zbierają. */
function campfire() {
  const rng = rngFor('campfire');
  const t = new Canvas(20, 16);
  // Wieniec kamieni.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = 10 + Math.cos(a) * 8;
    const y = 11 + Math.sin(a) * 4;
    t.ellipse(x, y, 2.4, 1.8, c('stone', 1));
    t.ellipse(x, y - 0.5, 1.8, 1.2, c('stone', 2));
  }
  // Skrzyżowane polana i żar pod nimi.
  t.line(4, 12, 15, 7, c('wood', 1));
  t.line(4, 11, 15, 6, c('wood', 2));
  t.line(5, 6, 16, 12, c('wood', 1));
  t.line(5, 7, 16, 13, c('wood', 2));
  for (let i = 0; i < 20; i++) {
    const x = rng.between(5, 14);
    const y = rng.between(8, 12);
    t.px(x, y, c('ember', rng.chance(0.4) ? 3 : 1));
  }
  return finish(t);
}

/**
 * Brama w murze — przejście z kuźni na plac. Prześwit ma 32 piksele, czyli
 * dokładnie dwa kafle, żeby dziura w murze pokrywała się z rysunkiem.
 */
/**
 * Wrota karczmy: drewniana odrzwia z belek, w środku otwarte przejście.
 *
 * Poprzednia wersja była kamiennym łukiem z czarnym prześwitem i czytała się
 * jak wejście do jaskini, a nie jak drzwi do budynku z drewna. Prześwit musi
 * mieć dokładnie 32 px, bo tyle wynosi dziura w kaflach muru.
 */
function gateArch() {
  const rng = rngFor('gate');
  const t = new Canvas(48, 32);

  // Ościeżnica: dwa grube słupy i nadproże z ciosanego drewna.
  const post = (x) => {
    t.rect(x, 6, 8, 26, c('wood', 2));
    t.vline(x, 6, 31, c('wood', 3));          // światło na lewej krawędzi słupa
    t.vline(x + 7, 6, 31, c('wood', 0));      // cień na prawej
    t.speckle(rng, c('wood', 1), 0.16, { x, y: 6, w: 8, h: 26 });   // słoje
    // Okucia.
    for (const y of [12, 24]) {
      t.hline(x, x + 7, y, c('iron', 2));
      t.px(x + 2, y, c('iron', 4));
      t.px(x + 5, y, c('iron', 4));
    }
  };
  post(0);
  post(40);

  // Nadproże — gruba belka na całej szerokości.
  t.rect(0, 0, 48, 7, c('wood', 2));
  t.hline(0, 47, 0, c('wood', 4));
  t.hline(0, 47, 6, c('soot', 0));
  t.speckle(rng, c('wood', 1), 0.18, { x: 0, y: 1, w: 48, h: 5 });
  // Zastrzały pod nadprożem — bez nich belka wisi w powietrzu.
  for (const [x, dir] of [[8, 1], [39, -1]]) {
    for (let i = 0; i < 4; i++) t.px(x + i * dir, 7 + i, c('wood', 3));
    for (let i = 0; i < 4; i++) t.px(x + i * dir, 8 + i, c('wood', 1));
  }

  // Przejście: ciemne, ale nie czarne — widać, że za nim jest wnętrze, nie dziura.
  t.rect(8, 7, 32, 25, c('soot', 1));
  t.rect(8, 7, 32, 3, c('soot', 0));         // cień pod nadprożem
  t.hline(8, 39, 31, c('wood', 1));          // próg

  // Wrota odchylone do wewnątrz, po jednym skrzydle z każdej strony.
  const leaf = (x0, x1) => {
    t.rect(x0, 9, x1 - x0, 22, c('wood', 1));
    t.vline(x0, 9, 30, c('wood', 3));
    for (let x = x0 + 2; x < x1; x += 3) t.vline(x, 10, 30, c('wood', 0)); // styk desek
    t.hline(x0, x1 - 1, 14, c('iron', 1));   // pas okuwający
    t.hline(x0, x1 - 1, 26, c('iron', 1));
  };
  leaf(8, 13);
  leaf(35, 40);

  // Szyld nad wejściem — kawałek blachy na dwóch ogniwach.
  t.rect(21, 7, 6, 5, c('iron', 2));
  t.hline(21, 26, 7, c('iron', 3));
  t.px(22, 12, c('iron', 1));
  t.px(25, 12, c('iron', 1));
  return finish(t);
}

/**
 * Słup bramy — kamienny filar z okuciem i pochodnią u szczytu.
 *
 * Stoi po obu stronach każdego przejścia przez mur. Bez niego wyjście z miasta
 * jest **dziurą w skale**: gracz nie widzi, gdzie kończy się strefa bezpieczna,
 * a przekroczenie granicy PvP ma być decyzją, nie przypadkiem. Dwa filary robią
 * z otworu bramę i to one niosą całą informację.
 */
function gatePost(name) {
  const rng = rngFor(name);
  const t = new Canvas(12, 34);

  // Trzon z ciosanego kamienia, warstwami — równy filar wygląda jak słupek.
  for (let y = 4; y < 34; y++) {
    const warstwa = Math.floor((y - 4) / 5);
    const wcięcie = warstwa % 2 === 0 ? 0 : 1;
    for (let x = 1 + wcięcie; x < 11 - wcięcie; x++) {
      const jasne = x < 4;
      t.px(x, y, c('stone', jasne ? 2 : 1));
    }
    // Spoina między warstwami.
    if ((y - 4) % 5 === 0) t.hline(1 + wcięcie, 10 - wcięcie, y, c('stone', 0));
  }
  t.speckle(rng, c('stone', 3), 0.08, { x: 1, y: 4, w: 10, h: 30 });

  // Głowica: szersza płyta z okuciem.
  t.rect(0, 2, 12, 4, c('stone', 2));
  t.hline(0, 11, 2, c('stone', 3));
  t.hline(0, 11, 5, c('stone', 0));
  t.rect(4, 0, 4, 3, c('iron', 2));
  t.px(5, 1, c('iron', 4));

  return finish(t.outline(c('soot', 0)));
}

/**
 * Krzak — kępa liści bez pnia, przez którą da się przejść.
 *
 * Sam las z drzew jest ścianą i jednym rodzajem kształtu. Krzaki wypełniają
 * poziom, na którym nic nie było: między trawą przy ziemi a koronami wysoko.
 * To one, a nie drzewa, sprawiają, że polana przestaje być łysiną.
 */
function bush(name) {
  const rng = rngFor(name);
  const w = rng.between(14, 20);
  const h = rng.between(10, 14);
  const t = new Canvas(w, h);

  // **Krzak to pęk gałązek, nie kula liści.**
  //
  // Pierwsza wersja składała się z nachodzących elips i użytkownik nazwał to
  // wprost: wyglądało jak slime. Gładki, zamknięty obrys zawsze będzie czytał się
  // jak galareta — kształt roślinny poznaje się po **postrzępionej sylwetce**
  // i po prześwitach, przez które widać tło.
  //
  // Stąd budowa od gałązek: każda wychodzi z jednego punktu przy ziemi i niesie
  // kilka listków. Obrys robi się nierówny sam z siebie.
  const rootX = Math.floor(w / 2);
  const galezie = rng.between(5, 8);

  for (let i = 0; i < galezie; i++) {
    // Wachlarz od pionu w obie strony.
    const kat = -Math.PI / 2 + (i / (galezie - 1) - 0.5) * 2.1 + rng.range(-0.2, 0.2);
    const dlugosc = rng.between(5, h - 2);
    let x = rootX;
    let y = h - 1;

    for (let s = 0; s < dlugosc; s++) {
      x += Math.cos(kat) * 0.9;
      y += Math.sin(kat) * 0.9;
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || px >= w || py < 0 || py >= h) break;
      // Galazka ciemna, listki jasniejsze - inaczej pek zlewa sie w plame.
      // Galazke rysujemy CO DRUGI KROK: pelna linia dominowala nad listkami
      // i krzak wychodzil ciemny mimo zdjecia obrysu.
      if (s % 2 === 0) t.px(px, py, c('foliage', 1));
      if (s > 0) {
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, -1]]) {
          if (!rng.chance(0.62)) continue;
          t.px(px + ox, py + oy, c('foliage', rng.chance(0.45) ? 4 : 3));
        }
      }
    }
  }

  // Zagęszczenie u nasady — tam gałązki naprawdę się schodzą.
  for (let i = 0; i < 6; i++) {
    t.px(rootX + rng.between(-2, 2), h - 1 - rng.between(0, 2), c('foliage', 1));
  }

  // Światło od góry: listki na wierzchu jaśnieją. Bez tego pęk jest płaski.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!t.alphaAt(x, y)) continue;
      if (!t.alphaAt(x, y - 1) && y < h * 0.5 && rng.chance(0.6)) t.px(x, y, c('foliage', 4));
    }
  }

  // **Bez obrysu.**
  //
  // Reguła „obrys z najciemniejszego odcienia materiału" obowiązuje dla brył —
  // beczki, muru, postaci. Przy pęku gałązek obrys dokłada ciemny piksel wokół
  // **każdej gałązki z osobna**, więc podwaja masę i z ażurowego krzaka robi
  // ciemną plamę. Tu rolę obrysu pełni sama gałązka, ciemniejsza od listków.
  return finish(t);
}

/** Kwiaty — kilka łodyg z barwnymi główkami. Drobiazg, ale to on daje kolor. */
function flowers(name) {
  const rng = rngFor(name);
  const t = new Canvas(12, 9);
  const barwy = [c('ember', 4), c('parchment'), c('ember', 3), c('night', 4)];

  for (let i = 0; i < rng.between(3, 5); i++) {
    const x = rng.between(1, 10);
    const h = rng.between(3, 6);
    for (let y = 0; y < h; y++) t.px(x, 8 - y, c('foliage', 2));
    t.px(x, 8 - h, rng.pick(barwy));
    if (rng.chance(0.5)) t.px(x + 1, 8 - h + 1, c('foliage', 3));
  }
  return finish(t);
}

// --- Ogień (klatki animacji) --------------------------------------------------

/**
 * Płomień jako 4 klatki. Kształt liczony z funkcji falującej w czasie, więc
 * animacja zapętla się gładko i nie widać, gdzie zaczyna się pętla.
 */
function flame(width, height, frame, seedName) {
  const rng = makeRng(seedFrom(`${seedName}${frame}`));
  const t = new Canvas(width, height);
  const phase = (frame / 4) * Math.PI * 2;
  const cx = width / 2;

  for (let y = 0; y < height; y++) {
    const up = 1 - y / height;                       // 1 u wierzchołka, 0 przy podstawie
    const sway = Math.sin(phase + up * 3) * up * (width * 0.12);
    const halfWidth = (width / 2) * Math.pow(1 - up, 0.55) * (0.85 + 0.15 * Math.sin(phase * 2 + up * 5));
    for (let x = 0; x < width; x++) {
      const d = Math.abs(x - cx - sway) / Math.max(0.6, halfWidth);
      if (d > 1) continue;
      // Rdzeń jest najjaśniejszy, brzegi schodzą ku czerwieni.
      const heat = (1 - d) * (0.45 + up * 0.75);
      let shade;
      if (heat > 0.85) shade = 4;
      else if (heat > 0.6) shade = 3;
      else if (heat > 0.35) shade = 2;
      else shade = 1;
      if (heat < 0.18 && rng.chance(0.5)) continue; // postrzępiony brzeg
      t.px(x, y, c('ember', shade));
    }
  }
  // Odrywające się iskry nad płomieniem.
  for (let i = 0; i < 3; i++) {
    const x = Math.round(cx + rng.range(-width * 0.3, width * 0.3));
    const y = rng.int(Math.max(1, Math.floor(height * 0.35)));
    t.px(x, y, c('ember', 4));
  }
  return t;
}

// --- Zestaw -------------------------------------------------------------------

export function buildProps() {
  const entries = [];
  const add = (name, canvas) => entries.push({ name, canvas });

  add('hearth', hearth());
  add('anvil', anvil());
  add('trough', trough());
  add('bellows', bellows());
  add('workbench', workbench());
  add('rack', rack());
  add('shelf', shelf());
  add('torch', torch());
  add('barrel', barrel());
  add('crate', crate());
  add('bucket', bucket());
  add('well', well());
  add('cart', cart());
  add('board', noticeBoard());
  add('logs', logPile());
  // Kukła w czterech stanach zużycia: cała, obita, mocno obita, zwalona.
  for (let d = 0; d <= 3; d++) add(`dummy${d}`, dummy(d));
  add('tree', tree());
  add('boulder', boulder());
  add('fence', fence());
  add('campfire', campfire());
  add('gate', gateArch());
  add('gatepost', gatePost('gatepost'));
  for (let i = 0; i < 3; i++) add(`bush${i}`, bush(`bush${i}`));
  for (let i = 0; i < 2; i++) add(`flowers${i}`, flowers(`flowers${i}`));

  for (let f = 0; f < 4; f++) {
    add(`flame_small_${f}`, flame(6, 9, f, 'small'));
    add(`flame_mid_${f}`, flame(12, 15, f, 'mid'));
    add(`flame_big_${f}`, flame(16, 18, f, 'big'));
  }

  return entries;
}

