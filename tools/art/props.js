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

/**
 * Drzewo. `damage` 0-2 to **nacięcie w pniu**, nie ubytek w koronie.
 *
 * Rąbie się pień, więc to on ma pokazywać postęp. Pierwsza myśl — przerzedzać
 * koronę — jest gorsza z dwóch powodów: korona zmienia się w miejscu, w które
 * gracz nie celuje, a przerzedzone drzewo z daleka czyta się jako **inny gatunek
 * drzewa**, nie jako drzewo nadcięte.
 *
 * Klin wchodzi od lewej, bo tak stoi drwal. Przy drugim etapie sięga za oś pnia
 * i widać, że jeszcze jeden cios go obali.
 */
function tree(damage = 0) {
  const rng = rngFor(`tree${damage}`);
  const t = new Canvas(34, 46);
  // Pień z korzeniami.
  t.rect(14, 30, 6, 15, c('wood', 1));
  t.rect(15, 30, 3, 15, c('wood', 2));
  t.vline(16, 32, 44, c('wood', 3));
  t.line(14, 42, 10, 45, c('wood', 1));
  t.line(19, 42, 23, 45, c('wood', 1));

  if (damage > 0) {
    // Klin wycięty z pnia. **Świeże drewno jest najjaśniejsze w całym drzewie**
    // i o to chodzi: pień ma 6 px szerokości, więc różnicy odcienia w obrębie
    // kory nikt z zoomu nie zobaczy. Widać dopiero jasną plamę na ciemnym pniu.
    //
    // Pierwsza wersja miała klin głęboki na 3 px w jednym rzędzie pikseli
    // i etapy były nierozróżnialne — trzeba było je porównywać obok siebie,
    // a gracz ogląda je jeden po drugim.
    const glebokosc = damage === 1 ? 4 : 6;   // pień jest szeroki na 6 px
    const wysokosc = damage === 1 ? 4 : 6;
    for (let i = 0; i < glebokosc; i++) {
      const h = Math.round((wysokosc / 2) * (1 - i / glebokosc));
      for (let j = -h; j <= h; j++) {
        const x = 13 + i;
        const y = 38 + j;
        // Dno klina ciemne, reszta świeżym drewnem — sam jasny klin czyta się
        // jak naklejka, sam ciemny jak dziura na wylot.
        t.px(x, y, c('wood', i >= glebokosc - 1 ? 1 : 4));
      }
    }
    // Górna i dolna warga nacięcia — kora odchodzi.
    t.px(13, 38 - Math.round(wysokosc / 2) - 1, c('wood', 3));
    t.px(13, 38 + Math.round(wysokosc / 2) + 1, c('wood', 3));

    // Wióry rozsypane u podstawy. Drugi sygnał, niezależny od pnia: nawet gdy
    // postać zasłoni nacięcie, po wiórach widać, że ktoś tu rąbał.
    for (let i = 0; i < 4 + damage * 4; i++) {
      const x = 8 + rng.int(12);
      const y = 42 + rng.int(4);
      t.px(x, y, c('wood', rng.chance(0.5) ? 3 : 4));
      if (rng.chance(0.4)) t.px(x + 1, y, c('wood', 2));
    }
  }
  if (damage > 1) {
    // Korona przerzedzona od brzegów. Nie zmienia gatunku drzewa, bo sylwetka
    // zostaje — ubywa tylko obrzeża, tak jak przy drzewie, którym się szarpie.
    for (let x = 0; x < 34; x++) {
      for (let y = 0; y < 30; y++) {
        if (t.alphaAt(x, y) === 0) continue;
        const brzeg = t.alphaAt(x - 2, y) === 0 || t.alphaAt(x + 2, y) === 0
          || t.alphaAt(x, y - 2) === 0;
        if (brzeg && rng.chance(0.4)) t.set(x, y, [0, 0, 0, 0]);
      }
    }
  }

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

/**
 * Głaz. `damage` 0-2 to **pęknięcia i ubytki**, nie mniejszy kamień.
 *
 * Zmniejszanie bryły z każdym ciosem wyglądało jak wymiana obiektu na inny,
 * mniejszy — z daleka nie widać, że to ten sam głaz. Pęknięcie zostaje na miejscu
 * i rośnie, więc widać postęp bez zmiany sylwetki.
 */
function boulder(damage = 0) {
  const rng = rngFor(`boulder${damage}`);
  const t = new Canvas(17, 14);
  t.ellipse(8, 9, 8, 5, c('stone', 1));
  t.ellipse(8, 8, 7, 4, c('stone', 2));
  t.ellipse(6, 6, 4, 2, c('stone', 3));
  t.speckle(rng, c('stone', 0), 0.12, { x: 1, y: 5, w: 15, h: 9 });

  if (damage > 0) {
    // Rysa biegnie przez całą bryłę, z jasną krawędzią po jednej stronie —
    // to ona robi głębokość. Sama ciemna kreska czyta się jak zadrapanie.
    let x = 4 + rng.int(3);
    for (let y = 4; y < 13; y++) {
      if (t.alphaAt(x, y) === 0) { x += rng.chance(0.5) ? 1 : -1; continue; }
      t.px(x, y, c('soot', 0));
      t.px(x + 1, y, c('stone', 3));
      if (rng.chance(0.4)) x += rng.chance(0.5) ? 1 : -1;
    }
  }
  if (damage > 1) {
    // Druga rysa i wyszczerbiony górny narożnik — brakujący kawałek jest tym,
    // co mówi „jeszcze jeden cios".
    let x = 10 + rng.int(3);
    for (let y = 5; y < 12; y++) {
      if (t.alphaAt(x, y) === 0) { x += 1; continue; }
      t.px(x, y, c('soot', 0));
      t.px(x - 1, y, c('stone', 3));
      if (rng.chance(0.45)) x += rng.chance(0.5) ? 1 : -1;
    }
    for (let i = 0; i < 5; i++) t.set(11 + rng.int(4), 4 + rng.int(2), [0, 0, 0, 0]);
  }
  return finish(t);
}

/**
 * Pniak po ściętym drzewie.
 *
 * Zostaje na miejscu do czasu, aż las odrośnie, i to on niesie informację
 * „tu już byłem". Bez niego wyrąbany kawałek lasu wygląda jak polana, czyli
 * jak coś, co tam było od zawsze.
 */
function stump() {
  const rng = rngFor('stump');
  const t = new Canvas(18, 15);

  // Korzenie najpierw, żeby trzon je przykrył u nasady.
  for (const [dx, dy] of [[-8, 13], [-5, 14], [4, 14], [8, 13]]) {
    t.line(9, 11, 9 + dx, dy, c('wood', 1));
    t.px(9 + dx, dy, c('wood', 0));
  }

  // Trzon: walec kory, wyraźnie wyższy niż szeroki u góry. Pierwsza wersja była
  // płaskim krążkiem 14x12, w którym jasne przecięcie zajmowało kilka pikseli —
  // z zoomu wychodziła z tego brązowa kropka, nie pniak.
  t.rect(3, 6, 13, 7, c('wood', 1));
  t.vline(3, 6, 12, c('wood', 0));
  t.vline(15, 6, 12, c('wood', 0));
  t.ellipse(9, 12, 6, 2, c('wood', 0));      // podstawa wtopiona w ziemię

  // Przecięcie: **najjaśniejsza plama w całym sprite'cie**. To jej kontrast
  // z ciemną korą mówi, że drzewo ścięto, a nie że uschło albo że to kamień.
  t.ellipse(9, 6, 6, 3, c('wood', 0));       // rant kory
  t.ellipse(9, 6, 5, 2, c('wood', 4));
  t.ellipse(9, 6, 3, 1, c('wood', 3));       // słój
  t.px(9, 6, c('wood', 4));
  // Pęknięcie w poprzek przecięcia — po nim widać, że to rąbane, nie cięte piłą.
  t.hline(6, 12, 6, c('wood', 2));

  t.speckle(rng, c('wood', 0), 0.14, { x: 4, y: 8, w: 11, h: 5 });   // faktura kory
  return finish(t);
}

/** Rzecz leżąca na ziemi — kłoda drewna. */
function itemWood() {
  const t = new Canvas(12, 8);
  t.rect(1, 3, 10, 4, c('wood', 2));
  t.hline(1, 10, 3, c('wood', 3));
  t.hline(1, 10, 6, c('wood', 0));
  // Czoło kłody z słojami — bez niego to prostokąt, nie kawałek drewna.
  t.ellipse(2, 5, 2, 2, c('wood', 3));
  t.ellipse(2, 5, 1, 1, c('wood', 1));
  return finish(t);
}

/** Rzecz leżąca na ziemi — odłupany kamień. */
function itemStone() {
  const t = new Canvas(10, 8);
  t.ellipse(5, 5, 4, 3, c('stone', 1));
  t.ellipse(5, 4, 3, 2, c('stone', 2));
  t.ellipse(4, 3, 2, 1, c('stone', 3));
  return finish(t);
}

// --- Ikony do plecaka ---------------------------------------------------------
//
// Rysowane **pod rozmiar w kratkach**, nie skalowane z rzeczy leżącej na ziemi.
// Kratka ma 16 px, więc kłoda 2x1 to obrazek 32x16. Skalowanie sprite'a z ziemi
// dałoby albo rozmyte piksele, albo ikonę, która nie wypełnia swojego pola —
// a w siatce, w której chodzi o zajmowane miejsce, ikona musi pokazywać
// dokładnie tyle, ile przedmiot zajmuje.
//
// Ikony rysujemy **z góry i płasko**, bez perspektywy 3/4. Przedmiot w plecaku
// leży na dnie i patrzy się na niego prosto — ten sam rysunek co w świecie
// wyglądałby w kratce jak coś, co zaraz się przewróci.

const CELL = 16;

/** Kłoda: 2x1. */
function iconWood() {
  const rng = rngFor('icon_wood');
  const t = new Canvas(CELL * 2, CELL);
  t.rect(2, 4, 28, 8, c('wood', 2));
  t.hline(2, 29, 4, c('wood', 3));
  t.hline(2, 29, 11, c('wood', 0));
  t.vline(2, 4, 11, c('wood', 0));
  // Czoło ze słojami po prawej — po nim widać, że to walec, a nie deska.
  t.ellipse(28, 8, 3, 4, c('wood', 3));
  t.ellipse(28, 8, 2, 2, c('wood', 1));
  t.px(28, 8, c('wood', 4));
  // Kora: krótkie kreski wzdłuż, nie kropki.
  for (let i = 0; i < 5; i++) {
    const x = 5 + rng.int(18);
    const y = 6 + rng.int(5);
    t.hline(x, x + 1 + rng.int(3), y, c('wood', rng.chance(0.5) ? 1 : 3));
  }
  return finish(t);
}

/** Kamień: 1x1. */
function iconStone() {
  const rng = rngFor('icon_stone');
  const t = new Canvas(CELL, CELL);
  t.ellipse(8, 8, 6, 5, c('stone', 1));
  t.ellipse(8, 7, 5, 4, c('stone', 2));
  t.ellipse(6, 6, 3, 2, c('stone', 3));
  t.speckle(rng, c('stone', 0), 0.12, { x: 3, y: 4, w: 11, h: 9 });
  return finish(t);
}

// --- Małe zasoby: to, co zbiera się gołą ręką --------------------------------
//
// **Ręką nie rozwalę skały i drzewa.** Duże zasoby wymagają narzędzia, małe idą
// bez niego — i to one domykają pętlę startową: zbierasz gałęzie i luźne kamienie,
// robisz z nich siekierę, dopiero teraz ścinasz drzewa.
//
// Muszą być **wyraźnie mniejsze i inne kształtem** od dużych. Mniejsze drzewo
// wygląda jak dalekie drzewo, a nie jak coś innego; leżąca gałąź nie da się
// pomylić ze stojącym pniem, bo leży.

/** Gałąź leżąca na ziemi. Poziomo, bo to odróżnia ją od pnia. */
function branch(name) {
  const rng = rngFor(name);
  const t = new Canvas(20, 10);
  // Główny konar biegnie skosem — prosta kreska czyta się jak deska.
  t.line(1, 7, 17, 4, c('wood', 2));
  t.line(1, 8, 17, 5, c('wood', 1));
  t.line(2, 6, 16, 3, c('wood', 3));
  // Odnogi: to one mówią „gałąź", a nie „kij".
  t.line(7, 6, 4, 2, c('wood', 2));
  t.line(7, 6, 5, 3, c('wood', 1));
  t.line(12, 5, 15, 1, c('wood', 2));
  t.px(4, 2, c('wood', 3));
  t.px(15, 1, c('wood', 3));
  // Kilka liści, żeby nie była samym patykiem.
  for (let i = 0; i < 4; i++) {
    const x = 3 + rng.int(14);
    const y = 1 + rng.int(5);
    t.px(x, y, c('foliage', rng.chance(0.5) ? 2 : 3));
  }
  return finish(t);
}

/** Kupka luźnych kamieni — mała, płaska, wyraźnie inna niż głaz. */
function pebbles(name) {
  const rng = rngFor(name);
  const t = new Canvas(14, 9);
  // Trzy kamyki zamiast jednej bryły: liczba mnoga jest tu całą informacją,
  // bo to ona odróżnia „zbierz" od „rozwal".
  const kamyki = [[4, 6, 3, 2], [9, 5, 2, 2], [6, 3, 2, 1]];
  for (const [cx, cy, rx, ry] of kamyki) {
    t.ellipse(cx, cy, rx, ry, c('stone', 1));
    t.ellipse(cx, cy - 1, Math.max(1, rx - 1), Math.max(1, ry - 1), c('stone', 2));
    t.px(cx - 1, cy - 1, c('stone', 3));
  }
  t.speckle(rng, c('stone', 0), 0.1, { x: 1, y: 2, w: 12, h: 6 });
  return finish(t);
}

// --- Narzędzia ---------------------------------------------------------------

/** Siekiera do drzew. Klin ostrza szeroki, żeby nie myliła się z kilofem. */
function axeIcon() {
  const t = new Canvas(CELL, CELL * 3);
  const cx = 8;
  // Trzonek na całą wysokość, lekko zwężony u góry.
  t.rect(cx - 1, 10, 3, 36, c('wood', 2));
  t.vline(cx - 1, 10, 45, c('wood', 3));
  t.vline(cx + 1, 10, 45, c('wood', 0));
  t.rect(cx - 1, 43, 3, 3, c('wood', 0));      // owinięcie u dołu
  // Głowica: obuch po jednej stronie, ostrze rozszerzające się po drugiej.
  t.rect(cx - 1, 6, 4, 7, c('iron', 1));
  for (let i = 0; i < 7; i++) {
    const w = 2 + Math.round(i * 0.7);
    t.rect(cx + 3, 3 + i, w, 1, c('iron', 2));
  }
  t.vline(cx + 8, 5, 10, c('iron', 4));        // błysk na krawędzi tnącej
  t.rect(cx - 3, 5, 2, 5, c('iron', 0));       // obuch
  t.px(cx, 7, c('iron', 3));
  return finish(t);
}

/** Kilof do skały. Dwa wąskie ostrza na boki — sylwetka litery T. */
function pickIcon() {
  const t = new Canvas(CELL, CELL * 3);
  const cx = 8;
  t.rect(cx - 1, 10, 3, 36, c('wood', 2));
  t.vline(cx - 1, 10, 45, c('wood', 3));
  t.vline(cx + 1, 10, 45, c('wood', 0));
  t.rect(cx - 1, 43, 3, 3, c('wood', 0));
  // Poprzeczka zwężająca się ku obu końcom — kilof rozpoznaje się po szpicach.
  for (let i = 0; i < 7; i++) {
    const y = 5 + Math.round(i * 0.35);
    t.px(cx - 1 - i, y, c('iron', 2));
    t.px(cx - 1 - i, y + 1, c('iron', 1));
    t.px(cx + 1 + i, y, c('iron', 2));
    t.px(cx + 1 + i, y + 1, c('iron', 1));
  }
  t.px(cx - 7, 7, c('iron', 4));
  t.px(cx + 7, 7, c('iron', 4));
  t.rect(cx - 2, 4, 5, 6, c('iron', 1));       // osada na trzonku
  t.px(cx, 5, c('iron', 3));
  return finish(t);
}

/** Narzędzie leżące na ziemi — mały rzut z góry, wspólny dla obu. */
function toolOnGround(name, ostrze) {
  const t = new Canvas(14, 9);
  t.line(2, 6, 11, 3, c('wood', 2));
  t.line(2, 7, 11, 4, c('wood', 1));
  t.rect(9, 1, 4, 4, ostrze);
  t.px(12, 1, c('iron', 4));
  void name;
  return finish(t);
}

/**
 * Podpowiedź „E" — **klawisz**, nie napis.
 *
 * Pierwsza wersja była zwykłym napisem z fontu gry, wstawionym w świat. Wyszła
 * gigantyczna i musiała: napis wielkości interfejsu, powiększony jeszcze przez
 * zoom kamery (2–4×), jest kilka razy większy niż postać. Podpowiedź stojąca
 * w świecie musi być rysowana **w skali świata**, czyli mieć kilkanaście pikseli,
 * a nie kilkadziesiąt.
 *
 * Kształt bierze się z dymka czatu: jasne pole, ciemny obrys, ścięte narożniki.
 * Dzięki temu czyta się jako „to samo, co mowa" — czyli jako coś doczepionego do
 * miejsca w świecie, a nie jako element panelu.
 */
function keyCap() {
  const t = new Canvas(11, 11);
  const obrys = c('soot', 0);
  const pole = c('parchment');

  // Pole ze ściętymi narożnikami — te same dwa piksele co w dymku czatu.
  t.rect(1, 0, 9, 11, pole);
  t.rect(0, 1, 11, 9, pole);
  t.frame(1, 0, 9, 1, obrys);
  t.hline(1, 9, 0, obrys);
  t.hline(1, 9, 10, obrys);
  t.vline(0, 1, 9, obrys);
  t.vline(10, 1, 9, obrys);
  t.px(1, 1, obrys);
  t.px(9, 1, obrys);
  t.px(1, 9, obrys);
  t.px(9, 9, obrys);

  // Spód ciemniejszy — klawisz ma grubość, inaczej jest naklejką.
  t.hline(2, 8, 9, c('stone', 3));

  // Litera E, 3x5, ręcznie. Font gry jest tu za duży i ma inne proporcje.
  const litera = ['###', '#..', '###', '#..', '###'];
  litera.forEach((row, y) => {
    for (let x = 0; x < 3; x++) if (row[x] === '#') t.px(4 + x, 3 + y, obrys);
  });
  return t;
}

/** Surowe mięso: 1x1. Czerwone z jasnym tłuszczem i kością — żeby nie było kamieniem. */
function iconMeat() {
  const rng = rngFor('icon_meat');
  const t = new Canvas(CELL, CELL);
  t.ellipse(8, 9, 6, 5, c('blood'));
  t.ellipse(8, 8, 5, 4, c('life', 3));
  t.ellipse(7, 7, 3, 2, c('life', 4));
  // Kość wystająca z jednej strony — sylwetka ma mówić „mięso", zanim zadziała kolor.
  t.rect(11, 3, 2, 5, c('parchment'));
  t.ellipse(12, 3, 2, 2, c('parchment'));
  t.px(12, 3, c('bone'));
  t.speckle(rng, c('life', 2), 0.14, { x: 3, y: 5, w: 11, h: 9 });
  return finish(t);
}

/** Mięso leżące na ziemi. */
function itemMeat() {
  const t = new Canvas(10, 7);
  t.ellipse(5, 4, 4, 3, c('life', 2));
  t.ellipse(5, 3, 3, 2, c('life', 3));
  t.px(4, 2, c('life', 4));
  t.rect(7, 1, 2, 3, c('parchment'));
  return finish(t);
}

/** Dzida: 1x4. Pion, bo tak leży w plecaku najkrótszym bokiem do przodu. */
function iconSpear() {
  const t = new Canvas(CELL, CELL * 4);
  const cx = 8;
  // Drzewce na całą wysokość.
  t.rect(cx - 1, 8, 3, 52, c('wood', 2));
  t.vline(cx - 1, 8, 59, c('wood', 3));
  t.vline(cx + 1, 8, 59, c('wood', 0));
  // Grot: trójkąt zwężający się ku górze, z żeberkiem.
  for (let i = 0; i < 10; i++) {
    const half = Math.max(0, Math.round(3 * (i / 9)));
    for (let j = -half; j <= half; j++) t.px(cx + j, 2 + i, c('iron', j < 0 ? 3 : 2));
  }
  t.vline(cx, 3, 11, c('iron', 4));
  // Osada grotu i przeciwwaga u dołu.
  t.hline(cx - 2, cx + 2, 12, c('iron', 1));
  t.hline(cx - 2, cx + 2, 13, c('iron', 0));
  t.rect(cx - 1, 60, 3, 3, c('iron', 1));
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

// --- Zwierzęta ------------------------------------------------------------------
//
// Pierwszy mieszkaniec lasu. Sylwetka budowana tą samą metodą co goblin —
// **wypisywana wierszami**, nie składana z prostokątów. Prostokątne zwierzę
// wygląda jak zabawka na kółkach; ta sama lekcja, która kazała odrzucić
// parametryzowane ludzkie postacie.
//
// Cztery cechy, po których poznaje się to zwierzę z odległości gry, i to one
// muszą być czytelne przy dwudziestu pikselach: **garb na karku**, **ryj przy
// ziemi**, **kły do góry** i **krótkie nogi**. Reszta to szczecina.

const BOAR_DARK = () => c('earth', 1);
const BOAR_BODY = () => c('earth', 3);
const BOAR_LIT = () => c('stone', 1);
const BOAR_TUSK = () => c('bone');

/**
 * @param dir  `side`, `down` albo `up`
 * @param step 0 albo 1 — faza chodu
 */
function boar(name, dir, step) {
  const rng = rngFor(name);
  const t = new Canvas(dir === 'side' ? 24 : 18, 18);

  if (dir === 'side') {
    // Tułów: garb nad łopatkami opadający ku zadowi. To on robi dzika.
    for (let x = 3; x < 21; x++) {
      const k = (x - 3) / 17;
      const gora = Math.round(4 + Math.sin(k * 2.6) * -2.2 + k * 3.5);
      for (let y = gora; y < 13; y++) {
        t.px(x, y, y < gora + 2 ? BOAR_LIT() : BOAR_BODY());
      }
      t.px(x, gora - 1, BOAR_DARK());
      t.px(x, 13, BOAR_DARK());
    }
    // Łeb pochylony do ziemi, z ryjem.
    for (let y = 6; y < 13; y++) t.hline(1, 5, y, BOAR_BODY());
    t.hline(0, 2, 11, BOAR_DARK());     // ryj
    t.px(0, 10, BOAR_LIT());
    t.px(4, 7, c('soot', 0));            // oko
    t.px(2, 9, BOAR_TUSK());             // kieł
    t.px(1, 8, BOAR_TUSK());
    t.px(6, 4, BOAR_DARK());             // ucho
    t.px(7, 3, BOAR_DARK());

    // Nogi: przednie i tylne w przeciwfazie.
    const przod = step === 0 ? 0 : 2;
    const tyl = step === 0 ? 2 : 0;
    t.rect(5, 13, 2, 4 - przod, BOAR_DARK());
    t.rect(8, 13, 2, 2 + przod, BOAR_DARK());
    t.rect(16, 13, 2, 4 - tyl, BOAR_DARK());
    t.rect(19, 13, 2, 2 + tyl, BOAR_DARK());
    // Ogon.
    t.px(22, 5, BOAR_DARK());
    t.px(23, 4 + step, BOAR_DARK());
  } else {
    // Z przodu i z tyłu: krępa bryła, szersza w barkach.
    for (let y = 4; y < 14; y++) {
      const half = Math.round(5 + Math.sin((y - 4) / 10 * Math.PI) * 2);
      for (let x = 9 - half; x <= 8 + half; x++) {
        t.px(x, y, y < 6 ? BOAR_LIT() : BOAR_BODY());
      }
      t.px(9 - half, y, BOAR_DARK());
      t.px(8 + half, y, BOAR_DARK());
    }
    if (dir === 'down') {
      t.hline(6, 11, 12, BOAR_DARK());   // ryj
      t.px(6, 8, c('soot', 0));          // oczy
      t.px(11, 8, c('soot', 0));
      t.px(5, 11, BOAR_TUSK());
      t.px(12, 11, BOAR_TUSK());
      t.px(4, 5, BOAR_DARK());           // uszy
      t.px(13, 5, BOAR_DARK());
    } else {
      t.hline(6, 11, 5, BOAR_DARK());    // kark
      t.px(8, 12, BOAR_DARK());          // ogon
    }
    const przod = step === 0 ? 1 : 0;
    t.rect(4, 14, 2, 3 - przod, BOAR_DARK());
    t.rect(12, 14, 2, 2 + przod, BOAR_DARK());
  }

  // Szczecina: pojedyncze jasne piksele na grzbiecie. Gładka sierść wygląda
  // jak plastik — ta sama zasada co przy drewnie i przy skórze goblina.
  for (let i = 0; i < 14; i++) {
    const x = rng.between(2, t.width - 3);
    const y = rng.between(3, 9);
    if (t.alphaAt(x, y)) t.px(x, y, rng.chance(0.5) ? BOAR_LIT() : BOAR_DARK());
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
  // Zasoby: etap 0 to nazwa bez numeru, bo tak stoją w `world.props`.
  add('tree', tree());
  add('boulder', boulder());
  for (let d = 1; d <= 2; d++) add(`tree${d}`, tree(d));
  for (let d = 1; d <= 2; d++) add(`boulder${d}`, boulder(d));
  add('stump', stump());
  add('item_wood', itemWood());
  add('item_stone', itemStone());
  add('item_meat', itemMeat());
  add('key_e', keyCap());

  // Małe zasoby: po dwa warianty, żeby las nie powtarzał jednego rysunku.
  for (let i = 0; i < 2; i++) add(`branch${i}`, branch(`branch${i}`));
  for (let i = 0; i < 2; i++) add(`pebbles${i}`, pebbles(`pebbles${i}`));

  // Narzędzia.
  add('item_axe', toolOnGround('item_axe', c('iron', 2)));
  add('item_pick', toolOnGround('item_pick', c('iron', 3)));
  add('icon_axe', axeIcon());
  add('icon_pick', pickIcon());
  add('icon_wood', iconWood());
  add('icon_stone', iconStone());
  add('icon_spear', iconSpear());
  add('icon_meat', iconMeat());
  add('fence', fence());
  add('campfire', campfire());
  add('gate', gateArch());
  add('gatepost', gatePost('gatepost'));
  for (const dir of ['side', 'down', 'up']) {
    for (let step = 0; step < 2; step++) add(`boar_${dir}${step}`, boar(`boar_${dir}${step}`, dir, step));
  }
  for (let i = 0; i < 3; i++) add(`bush${i}`, bush(`bush${i}`));
  for (let i = 0; i < 2; i++) add(`flowers${i}`, flowers(`flowers${i}`));

  for (let f = 0; f < 4; f++) {
    add(`flame_small_${f}`, flame(6, 9, f, 'small'));
    add(`flame_mid_${f}`, flame(12, 15, f, 'mid'));
    add(`flame_big_${f}`, flame(16, 18, f, 'big'));
  }

  return entries;
}


