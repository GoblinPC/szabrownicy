// Arkusz kontrolny zasobów — `docs/preview/zasoby.png`.
//
// Drzewo i głaz w kolejnych etapach zniszczenia, pniak i rzeczy leżące na ziemi,
// wszystko na tym samym podłożu co w grze. Etapy stoją **obok siebie**, bo cała
// rzecz polega na tym, żeby różnicę było widać w ułamku sekundy — gracz ogląda
// je jeden po drugim, nie razem, i musi z jednego spojrzenia wiedzieć, ile
// jeszcze zostało.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from './canvas.js';
import { buildProps } from './props.js';
import { buildTiles, TILE } from './tiles.js';
import { buildFont, drawText } from './font.js';
import { encodePng } from './png.js';
import { c } from './palette.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const props = new Map(buildProps().map((p) => [p.name, p.canvas]));
const tiles = new Map(buildTiles().map((t) => [t.name, t.canvas]));
const font = buildFont();

const RZEDY = [
  { opis: 'drzewo: caly / naciete / prawie', klucze: ['tree', 'tree1', 'tree2', 'stump'] },
  { opis: 'glaz: caly / pekniety / prawie', klucze: ['boulder', 'boulder1', 'boulder2'] },
  { opis: 'na ziemi', klucze: ['item_wood', 'item_stone'] },
];

const KOL = 56;
const PAD = 6;
const NAG = 10;

const wysokosc = RZEDY.reduce((sum, r) => {
  const h = Math.max(...r.klucze.map((k) => props.get(k).height));
  return sum + h + NAG + PAD;
}, PAD);
const szerokosc = PAD * 2 + KOL * Math.max(...RZEDY.map((r) => r.klucze.length));

const sheet = new Canvas(szerokosc, wysokosc);

// Podłoże: trawa na ziemi, tak jak w lesie — na czarnym tle sylwetki kłamią.
for (let y = 0; y < sheet.height; y += TILE) {
  for (let x = 0; x < sheet.width; x += TILE) {
    sheet.blit(tiles.get(`dirt_${((x / TILE) * 7 + (y / TILE) * 3) % 12}`), x, y);
    sheet.blit(tiles.get(`ov_grass_15_${((x / TILE) & 3) | (((y / TILE) & 3) << 2)}`), x, y);
  }
}

let cursorY = PAD;
for (const rzad of RZEDY) {
  const h = Math.max(...rzad.klucze.map((k) => props.get(k).height));
  drawText(sheet, font, PAD, cursorY, rzad.opis, c('parchment'));
  rzad.klucze.forEach((klucz, i) => {
    const sprite = props.get(klucz);
    // Zaczepienie u dołu pośrodku — tak samo jak w grze, więc pniak stoi tam,
    // gdzie stalo drzewo.
    const x = PAD + i * KOL + Math.floor((KOL - sprite.width) / 2);
    sheet.blit(sprite, x, cursorY + NAG + (h - sprite.height));
  });
  cursorY += h + NAG + PAD;
}

const big = sheet.scale(4);
const outDir = join(ROOT, 'docs', 'preview');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, 'zasoby.png');
writeFileSync(file, encodePng(big.width, big.height, big.data));
console.log(`  ${file}  (${big.width}x${big.height})`);
