// Font bitmapowy 5x7 z polskimi znakami diakrytycznymi.
//
// Układ komórki (5 x 11 pikseli):
//   wiersze 0-1   strefa znaków diakrytycznych nad wielkimi literami
//   wiersze 2-8   pas główny — tu mieści się właściwy rysunek litery (7 wierszy)
//   wiersze 9-10  strefa podcięć (g, j, p, q, y) i ogonków (ą, ę)
//
// Nad małymi literami akcent ląduje w wierszach 2-3, bo litery o wysokości x
// i tak zaczynają się dopiero w wierszu 4 — dzięki temu ć czy ó nie odstają
// od reszty tekstu.
//
// Litery zapisane są jako rysunek ASCII, wiersze rozdzielone ukośnikiem.

import { Canvas } from './canvas.js';

const CELL_W = 5;
const CELL_H = 11;
const BAND_TOP = 2;      // pierwszy wiersz pasa głównego
const BASELINE = 9;      // wiersz tuż pod pasem głównym
const DESC_TOP = 9;      // pierwszy wiersz strefy podcięć

// --- Pas główny: 7 wierszy po 5 pikseli --------------------------------------

const BAND = {
  ' ': '...../...../...../...../...../...../.....',

  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###../.#.../.#.../.#.../.#.../.#.../###..',
  J: '..###/....#/....#/....#/....#/#...#/.###.',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/##..#/#.#.#/#..##/#..##/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',

  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '...../...../.###./#..../#..../#..../.###.',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '..##./.#.../####./.#.../.#.../.#.../.#...',
  g: '...../...../.####/#...#/#...#/#...#/.####',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '.#.../...../##.../.#.../.#.../.#.../###..',
  j: '..#../...../..#../..#../..#../..#../..#..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#.',
  l: '##.../.#.../.#.../.#.../.#.../.#.../.###.',
  m: '...../...../##.##/#.#.#/#.#.#/#.#.#/#.#.#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/#...#/####.',
  q: '...../...../.####/#...#/#...#/#...#/.####',
  r: '...../...../#.##./##.../#..../#..../#....',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#.../.#.../###../.#.../.#.../.#.../..##.',
  u: '...../...../#...#/#...#/#...#/#...#/.####',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/#...#/.####',
  z: '...../...../#####/...#./..#../.#.../#####',

  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..##./....#/....#/#...#/.###.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',

  '!': '#..../#..../#..../#..../#..../...../#....',
  '"': '#.#../#.#../...../...../...../...../.....',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  '%': '##..#/##.#./...#./..#../.#.../#.##./..##.',
  '&': '.##../#..#./#..#./.##../#.#.#/#..#./.##.#',
  "'": '#..../#..../...../...../...../...../.....',
  '(': '.#.../#..../#..../#..../#..../#..../.#...',
  ')': '#..../.#.../.#.../.#.../.#.../.#.../#....',
  '*': '...../#.#../.#.../###../.#.../#.#../.....',
  '+': '...../...../.#.../###../.#.../...../.....',
  ',': '...../...../...../...../...../...../.#...',
  '-': '...../...../...../###../...../...../.....',
  '.': '...../...../...../...../...../...../#....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  ':': '...../...../...../#..../...../...../#....',
  ';': '...../...../...../#..../...../...../.#...',
  '<': '...../..#../.#.../#..../.#.../..#../.....',
  '=': '...../...../###../...../###../...../.....',
  '>': '...../#..../.#.../..#../.#.../#..../.....',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '[': '##.../#..../#..../#..../#..../#..../##...',
  '\\': '#..../#..../.#.../..#../...#./....#/....#',
  ']': '##.../.#.../.#.../.#.../.#.../.#.../##...',
  _: '...../...../...../...../...../...../#####',
  '|': '#..../#..../#..../#..../#..../#..../#....',

  // Ł i ł mają przekreślenie wtopione w rysunek, więc dostają własny wzór.
  'Ł': '#..../#..../#..../#.#../##.../#..../#####',
  'ł': '##.../.#.../.#.../.##../##.../.#.../.###.',
};

// --- Podcięcia i ogonki: 2 wiersze pod linią bazową ---------------------------

const DESCENDER = {
  g: '....#/.###.',
  j: '..#../##...',
  p: '#..../#....',
  q: '....#/....#',
  y: '....#/.###.',
  ',': '#..../.....',
  ';': '#..../.....',
};

const OGONEK_RIGHT = '....#/...##'; // pod prawą nogą A / a
const OGONEK_MID = '..#../..##.';   // pod środkiem E / e

// --- Znaki składane z litery bazowej i diakrytyku -----------------------------

const ACUTE = '...#./..#..'; // kreska pochylona w prawo
const DOT = '...../..#..';   // kropka nad literą (Ż, ż)

const COMPOSED = {
  'Ą': { base: 'A', below: OGONEK_RIGHT },
  'Ć': { base: 'C', above: ACUTE },
  'Ę': { base: 'E', below: OGONEK_MID },
  'Ń': { base: 'N', above: ACUTE },
  'Ó': { base: 'O', above: ACUTE },
  'Ś': { base: 'S', above: ACUTE },
  'Ź': { base: 'Z', above: ACUTE },
  'Ż': { base: 'Z', above: DOT },
  'ą': { base: 'a', below: OGONEK_RIGHT },
  'ć': { base: 'c', above: ACUTE },
  'ę': { base: 'e', below: OGONEK_MID },
  'ń': { base: 'n', above: ACUTE },
  'ó': { base: 'o', above: ACUTE },
  'ś': { base: 's', above: ACUTE },
  'ź': { base: 'z', above: ACUTE },
  'ż': { base: 'z', above: DOT },
};

const rows = (pattern) => pattern.split('/');
const isUpper = (ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase();

/** Składa pełną komórkę 5x11 dla pojedynczego znaku. */
function buildCell(ch) {
  const composed = COMPOSED[ch];
  const baseChar = composed ? composed.base : ch;
  const band = BAND[baseChar];
  if (band == null) throw new Error(`Brak wzoru litery dla '${ch}'`);

  const cell = Array.from({ length: CELL_H }, () => '.'.repeat(CELL_W));
  rows(band).forEach((row, i) => { cell[BAND_TOP + i] = row; });

  const descender = DESCENDER[baseChar] ?? composed?.below;
  if (descender) rows(descender).forEach((row, i) => { cell[DESC_TOP + i] = row; });
  if (composed?.below) rows(composed.below).forEach((row, i) => { cell[DESC_TOP + i] = row; });

  if (composed?.above) {
    // Nad wielkimi literami akcent idzie na sam szczyt komórki, nad małymi
    // spada o dwa wiersze — tuż nad wysokość x.
    const top = isUpper(ch) ? 0 : BAND_TOP;
    rows(composed.above).forEach((row, i) => { cell[top + i] = row; });
  }

  return cell;
}

/** Szerokość znaku = ostatnia zajęta kolumna plus odstęp. */
function advanceOf(cell) {
  let maxCol = -1;
  for (const row of cell) {
    for (let x = CELL_W - 1; x > maxCol; x--) {
      if (row[x] === '#') { maxCol = x; break; }
    }
  }
  if (maxCol < 0) return 4; // spacja
  return Math.max(3, maxCol + 2);
}

export const CHARSET = [
  ' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789', ...'!"#%&\'()*+,-./:;<=>?@[\\]_|',
  ...'ĄĆĘŁŃÓŚŹŻ', ...'ąćęłńóśźż',
];

/**
 * Buduje atlas fontu. Zwraca obrazek (białe piksele — do barwienia w grze)
 * oraz metryki każdego znaku.
 */
export function buildFont() {
  const columns = 16;
  const stepX = CELL_W + 1;
  const stepY = CELL_H + 1;
  const canvasRows = Math.ceil(CHARSET.length / columns);
  const canvas = new Canvas(columns * stepX, canvasRows * stepY);

  const glyphs = new Map();
  CHARSET.forEach((ch, i) => {
    const cell = buildCell(ch);
    const gx = (i % columns) * stepX;
    const gy = Math.floor(i / columns) * stepY;
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        if (cell[y][x] === '#') canvas.set(gx + x, gy + y, '#ffffff');
      }
    }
    glyphs.set(ch, { x: gx, y: gy, advance: advanceOf(cell) });
  });

  return { canvas, glyphs, cellW: CELL_W, cellH: CELL_H, baseline: BASELINE, lineHeight: CELL_H + 2 };
}

/** Szerokość napisu w pikselach (bez odstępu po ostatnim znaku). */
export function measureText(font, text) {
  let width = 0;
  for (const ch of text) {
    const glyph = font.glyphs.get(ch);
    if (glyph) width += glyph.advance;
  }
  return Math.max(0, width - 1);
}

/** Rysuje napis na obrazku — używane przez próbnik i generatory UI. */
export function drawText(target, font, x, y, text, tint = '#ffffff') {
  let cursor = x;
  for (const ch of text) {
    const glyph = font.glyphs.get(ch);
    if (!glyph) continue;
    target.blitTinted(font.canvas, cursor, y, tint, {
      sx: glyph.x, sy: glyph.y, sw: font.cellW, sh: font.cellH,
    });
    cursor += glyph.advance;
  }
  return cursor;
}

/** Metryki w formacie BMFont — Phaser wczytuje to jako bitmapowy font. */
export function fontToXml(font, pngName) {
  const entries = [...font.glyphs.entries()].map(([ch, g]) =>
    `    <char id="${ch.codePointAt(0)}" x="${g.x}" y="${g.y}" width="${font.cellW}" ` +
    `height="${font.cellH}" xoffset="0" yoffset="0" xadvance="${g.advance}" page="0" chnl="15"/>`
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<font>',
    '  <info face="goblin" size="11" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="0,0"/>',
    `  <common lineHeight="${font.lineHeight}" base="${font.baseline}" scaleW="${font.canvas.width}" scaleH="${font.canvas.height}" pages="1" packed="0"/>`,
    `  <pages><page id="0" file="${pngName}"/></pages>`,
    `  <chars count="${font.glyphs.size}">`,
    ...entries,
    '  </chars>',
    '</font>',
  ].join('\n');
}
