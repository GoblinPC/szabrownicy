// Arkusz kontrolny dymków czatu → docs/preview/dymek.png
//
// Geometria pochodzi z `client/src/render/bubble.js`, czyli z tego samego pliku,
// którego używa gra. Podgląd nie może więc pokazać czegoś innego, niż widzi gracz
// — a to była jedyna sensowna droga, żeby obejrzeć dymek bez odpalania
// przeglądarki i klikania po czacie.
//
// Tło jest ciemne jak wnętrze kuźni, bo dymek ma być czytelny właśnie na nim.
//
//   node tools/art/preview_bubble.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from './canvas.js';
import { buildFont, drawText, measureText } from './font.js';
import { encodePng } from './png.js';
import { AMBIENT, c } from './palette.js';
import { bubbleShape, bubbleWidth, BUBBLE_COLORS } from '../../client/src/render/bubble.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs', 'preview', 'dymek.png');

const SCALE = 3;          // powiększenie arkusza, żeby piksele było widać
const font = buildFont();

/** Łamanie takie samo jak w HUD — inaczej podgląd pokazywałby inne linie. */
function wrapText(text, limit) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    let rest = word;
    while (rest.length > limit) {
      if (line) { lines.push(line); line = ''; }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (!rest) continue;
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= limit) line += ` ${rest}`;
    else { lines.push(line); line = rest; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Wymiary napisu. Font jest generowany w rozmiarze 11 i w grze używany w tym
 * samym rozmiarze, więc miara jest ta sama co u Phasera: kolejne wiersze co
 * `lineHeight`, ale ostatni nie ciągnie za sobą odstępu.
 */
function measureBlock(lines) {
  let width = 0;
  for (const line of lines) width = Math.max(width, measureText(font, line));
  return {
    width,
    height: lines.length * font.lineHeight - (font.lineHeight - font.cellH),
  };
}

/**
 * Jeden dymek. `tailShift` udaje sytuację przy krawędzi ekranu, w której dymek
 * został wsunięty do kadru, a ogonek dalej wskazuje postać.
 */
function drawBubble(target, centerX, tipY, text, tailShift = 0) {
  const lines = wrapText(text, 28);
  const block = measureBlock(lines);

  const shape = bubbleShape(block.width, block.height, tailShift);
  const originX = Math.round(centerX - shape.width / 2);
  const originY = tipY - shape.tipY;

  for (const rect of shape.rects) {
    target.rect(originX + rect.x, originY + rect.y, rect.w, rect.h, BUBBLE_COLORS[rect.tone]);
  }

  // Napis: zaczepienie (0.5, 1), czyli środek dołu — tak samo jak w HUD.
  let y = originY + shape.textY - block.height;
  for (const line of lines) {
    const width = measureText(font, line);
    drawText(target, font, Math.round(originX + shape.textX - width / 2), y, line, BUBBLE_COLORS.text);
    y += font.lineHeight;
  }

  return { shape, originX, originY, lines };
}

/** Plakietka z nickiem pod dymkiem — po niej widać, czy odstęp jest dobry. */
function drawPlate(target, centerX, bottomY, label, tint) {
  const width = measureText(font, label);
  drawText(target, font, Math.round(centerX - width / 2), bottomY - font.cellH, label, tint);
}

const CASES = [
  { text: 'siemka co tam u ciebie', label: '★ Goblin', tint: c('ember', 3), shift: 0 },
  { text: 'no', label: 'Zenek', tint: c('stone', 4), shift: 0 },
  {
    text: 'ide do kuzni nabic kilofa i wracam na plac, czekajcie na mnie przy ognisku',
    label: 'Dlugonos',
    tint: c('stone', 4),
    shift: 0,
  },
  { text: 'stoje pod sciana wiec dymek wjechal w kadr', label: 'Kraweznik', tint: c('stone', 4), shift: 26 },
];

// Wysokość arkusza: liczona z rzeczywistych dymków, żeby nic się nie ucięło.
const measured = CASES.map((one) => {
  const block = measureBlock(wrapText(one.text, 28));
  return bubbleShape(block.width, block.height, one.shift);
});
const width = Math.max(300, ...measured.map((s) => s.width + 80));
const height = measured.reduce((sum, s) => sum + s.height + 34, 24);

const sheet = new Canvas(width, height);

// Dwa tła, bo dymek musi być czytelny w obu strefach: górna połowa to ciepły mrok
// wnętrza hali, dolna chłodny zmierzch placu z trawą. Na tym właśnie wyszło, że
// obrys w kolorze najciemniejszego drewna zlewa się z podłogą kuźni.
const split = Math.round(height * 0.5);
sheet.rect(0, 0, width, split, AMBIENT.forge);
sheet.rect(0, split, width, height - split, AMBIENT.yard);
sheet.rect(0, split, width, height - split, c('foliage', 1));
sheet.rect(12, split + 10, 52, 12, c('stone', 0));
sheet.rect(width - 70, 16, 52, 12, c('earth', 2));

let y = 24;
CASES.forEach((one, i) => {
  const shape = measured[i];
  const centerX = Math.round(width / 2);
  const tipY = y + shape.height;
  drawBubble(sheet, centerX + (one.shift ? -one.shift : 0), tipY, one.text, one.shift);
  drawPlate(sheet, centerX, tipY + 13, one.label, one.tint);
  y = tipY + 34;
});

const big = sheet.scale(SCALE);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodePng(big.width, big.height, big.data));
console.log(`dymek.png  ${width}x${height} (x${SCALE})  → docs/preview/dymek.png`);
