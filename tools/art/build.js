// Generuje całą grafikę gry. Uruchamiane przez `npm run art`.
//
// Etap 1: paleta, font bitmapowy z polskimi znakami oraz próbnik do obejrzenia.
// Kolejne etapy dokładają tu kafle, obiekty i postacie.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from './canvas.js';
import { encodePng } from './png.js';
import { RAMPS, ACCENT, AMBIENT, c } from './palette.js';
import { buildFont, drawText, measureText, fontToXml, CHARSET } from './font.js';
import { packGrid, packShelf, atlasJson } from './atlas.js';
import { buildTiles, TILE } from './tiles.js';
import { buildProps } from './props.js';
import { buildGoblins, VARIANTS } from './goblins.js';
import { buildMockup } from './mockup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GEN_DIR = path.join(ROOT, 'client/assets/gen');
const PREVIEW_DIR = path.join(ROOT, 'docs/preview');

function writePng(filePath, canvas) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodePng(canvas.width, canvas.height, canvas.data));
  return { file: path.relative(ROOT, filePath), size: `${canvas.width}x${canvas.height}` };
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  return { file: path.relative(ROOT, filePath) };
}

// --- Próbnik ------------------------------------------------------------------

/** Napis powiększony całkowitą krotnością — do nagłówków w próbniku. */
function drawTextScaled(target, font, x, y, text, tint, factor) {
  const strip = new Canvas(measureText(font, text) + 2, font.cellH);
  drawText(strip, font, 0, 0, text, tint);
  target.blit(strip.scale(factor), x, y);
}

function buildPreview(font) {
  const W = 268;
  const H = 440;
  const canvas = new Canvas(W, H);

  // Tło z delikatnym pionowym przejściem — ciemniej u góry, cieplej przy dole.
  canvas.forEach((x, y) => (y < H * 0.55 ? c('soot', 0) : c('soot', 1)));

  drawTextScaled(canvas, font, 8, 8, 'SZABROWNICY', c('ember', 3), 2);
  drawText(canvas, font, 8, 32, 'kuźnia / etap 1: paleta i font', c('soot', 4));

  let y = 50;
  drawText(canvas, font, 8, y, 'PALETA', c('ember', 2));
  canvas.hline(8, W - 9, y + 12, c('soot', 2));
  y += 18;

  const swatchX = 66;
  const swatchW = 18;
  const swatchH = 13;

  for (const [name, ramp] of Object.entries(RAMPS)) {
    drawText(canvas, font, 8, y + 3, name, c('stone', 3));
    ramp.forEach((hex, i) => {
      const x = swatchX + i * (swatchW + 2);
      canvas.rect(x, y, swatchW, swatchH, hex);
      canvas.frame(x, y, swatchW, swatchH, c('soot', 0));
      drawText(canvas, font, x + 7, y + 3, String(i), i < 2 ? c('stone', 2) : c('soot', 0));
    });
    y += swatchH + 3;
  }

  y += 4;
  drawText(canvas, font, 8, y + 3, 'akcenty', c('stone', 3));
  Object.entries(ACCENT).forEach(([name, hex], i) => {
    const x = swatchX + i * (swatchW + 2);
    canvas.rect(x, y, swatchW, swatchH, hex);
    canvas.frame(x, y, swatchW, swatchH, c('soot', 0));
  });
  y += swatchH + 6;

  drawText(canvas, font, 8, y + 3, 'otoczenie', c('stone', 3));
  Object.entries(AMBIENT).forEach(([name, hex], i) => {
    const x = swatchX + i * 62;
    canvas.rect(x, y, swatchW, swatchH, hex);
    canvas.frame(x, y, swatchW, swatchH, c('soot', 0));
    drawText(canvas, font, x + swatchW + 4, y + 3, name, c('stone', 2));
  });
  y += swatchH + 12;

  drawText(canvas, font, 8, y, 'FONT 5x7', c('ember', 2));
  canvas.hline(8, W - 9, y + 12, c('soot', 2));
  y += 18;

  const lines = [
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', c('parchment')],
    ['abcdefghijklmnopqrstuvwxyz', c('parchment')],
    ['0123456789 !?.,:;-+=()[]<>@', c('stone', 4)],
    ['ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż', c('ember', 3)],
    ['Zażółć gęślą jaźń, kowalu!', c('parchment')],
    ['Zenek: siema, masz trochę', c('goblin', 4)],
    ['złota na nowy młot?', c('goblin', 4)],
  ];
  for (const [text, tint] of lines) {
    drawText(canvas, font, 8, y, text, tint);
    y += font.lineHeight;
  }

  // Zbliżenie na diakrytyki — przy jednym pikselu trzeba je obejrzeć z bliska.
  y += 6;
  drawText(canvas, font, 8, y, 'zbliżenie x4', c('stone', 3));
  y += 14;
  drawTextScaled(canvas, font, 8, y, 'ŻÓŁĆ', c('parchment'), 4);
  drawTextScaled(canvas, font, 132, y, 'gęślą', c('parchment'), 4);

  return canvas;
}

/** Arkusz kontrolny: kafle, obiekty i postacie obok siebie, w powiększeniu. */
function buildSpriteSheetPreview(font, tiles, props, goblins) {
  const W = 300;
  const H = 300;
  const canvas = new Canvas(W, H);
  canvas.fill(c('soot', 1));

  const frame = (x, y, w, h) => canvas.frame(x - 1, y - 1, w + 2, h + 2, c('soot', 3));

  let y = 6;
  drawText(canvas, font, 6, y, 'KAFLE', c('ember', 2));
  y += 12;
  tiles.forEach(({ canvas: sprite }, i) => {
    const x = 6 + (i % 17) * (TILE + 1);
    const row = Math.floor(i / 17);
    canvas.blit(sprite, x, y + row * (TILE + 1));
  });
  y += Math.ceil(tiles.length / 17) * (TILE + 1) + 8;

  drawText(canvas, font, 6, y, 'OBIEKTY', c('ember', 2));
  y += 12;
  let x = 6;
  let rowTop = y;
  let rowH = 0;
  for (const { name, canvas: sprite } of props) {
    if (x + sprite.width > W - 6) { x = 6; rowTop += rowH + 3; rowH = 0; }
    canvas.blit(sprite, x, rowTop + (46 - sprite.height));
    x += sprite.width + 3;
    rowH = Math.max(rowH, 46);
  }
  y = rowTop + rowH + 8;

  drawText(canvas, font, 6, y, 'GOBLINY', c('ember', 2));
  y += 12;
  // Po jednej klatce spoczynku z każdego wariantu, w każdym kierunku.
  VARIANTS.forEach((v, i) => {
    const bx = 6 + i * 48;
    drawText(canvas, font, bx, y, v.name.slice(0, 8), c('stone', 3));
    ['down', 'up', 'side'].forEach((dir, d) => {
      const sprite = goblins.find((g) => g.name === `g${v.id}_${dir}_idle0`);
      canvas.blit(sprite.canvas, bx + d * 16, y + 10);
    });
    // Do tego pełny cykl biegu z widoku bocznego.
    for (let f = 0; f < 6; f++) {
      const sprite = goblins.find((g) => g.name === `g${v.id}_side_run${f}`);
      canvas.blit(sprite.canvas, bx + (f % 3) * 16, y + 36 + Math.floor(f / 3) * 25);
    }
  });

  return canvas;
}

/** Arkusz kontrolny samych postaci — w powiększeniu, bo detal twarzy decyduje. */
function buildGoblinPreview(font, goblins) {
  const find = (name) => goblins.find((g) => g.name === name).canvas;
  const cols = ['down', 'up', 'side'];
  const canvas = new Canvas(20 + VARIANTS.length * 26, 40 + 3 * 26 + 30);
  canvas.fill(c('soot', 1));

  cols.forEach((dir, row) => {
    drawText(canvas, font, 2, 30 + row * 26, dir, c('stone', 3));
    VARIANTS.forEach((v, i) => {
      canvas.blit(find(`g${v.id}_${dir}_idle0`), 20 + i * 26, 24 + row * 26);
    });
  });

  drawText(canvas, font, 2, 4, 'warianty i kierunki', c('ember', 2));
  drawText(canvas, font, 2, 40 + 3 * 26 - 14, 'bieg z profilu', c('ember', 2));
  for (let f = 0; f < 6; f++) {
    canvas.blit(find(`g1_side_run${f}`), 20 + f * 20, 40 + 3 * 26 - 2);
    canvas.blit(find(`g2_down_run${f}`), 20 + 6 * 20 + f * 20, 40 + 3 * 26 - 2);
  }
  return canvas;
}

// --- Uruchomienie -------------------------------------------------------------

function main() {
  const written = [];
  const font = buildFont();

  written.push(writePng(path.join(GEN_DIR, 'font.png'), font.canvas));
  written.push(writeText(path.join(GEN_DIR, 'font.xml'), fontToXml(font, 'font.png')));

  const tiles = buildTiles();
  const tileset = packGrid(tiles, { cell: TILE, columns: 16 });
  written.push(writePng(path.join(GEN_DIR, 'tiles.png'), tileset.canvas));
  written.push(writeText(
    path.join(GEN_DIR, 'tiles.json'),
    JSON.stringify({ tile: TILE, columns: tileset.columns, index: tileset.index }, null, 1)
  ));

  const props = buildProps();
  const propAtlas = packShelf(props, { maxWidth: 256 });
  written.push(writePng(path.join(GEN_DIR, 'props.png'), propAtlas.canvas));
  written.push(writeText(
    path.join(GEN_DIR, 'props.json'),
    atlasJson(propAtlas.frames, 'props.png', propAtlas.canvas)
  ));

  const goblins = buildGoblins();
  const goblinAtlas = packShelf(goblins, { maxWidth: 272 });
  written.push(writePng(path.join(GEN_DIR, 'goblins.png'), goblinAtlas.canvas));
  written.push(writeText(
    path.join(GEN_DIR, 'goblins.json'),
    atlasJson(goblinAtlas.frames, 'goblins.png', goblinAtlas.canvas)
  ));

  // Paleta i lista wariantów wystawione klientowi, żeby efekty w grze i ekran
  // wyboru postaci korzystały dokładnie z tych samych danych co generator.
  written.push(writeText(
    path.join(GEN_DIR, 'palette.json'),
    JSON.stringify({ ramps: RAMPS, accent: ACCENT, ambient: AMBIENT }, null, 2)
  ));
  written.push(writeText(
    path.join(GEN_DIR, 'variants.json'),
    JSON.stringify(VARIANTS.map(({ id, name }) => ({ id, name })), null, 1)
  ));

  written.push(writePng(path.join(PREVIEW_DIR, 'etap1.png'), buildPreview(font).scale(3)));
  written.push(writePng(
    path.join(PREVIEW_DIR, 'etap2.png'),
    buildSpriteSheetPreview(font, tiles, props, goblins).scale(3)
  ));
  written.push(writePng(
    path.join(PREVIEW_DIR, 'scena.png'),
    buildMockup(font, drawText).scale(3)
  ));
  written.push(writePng(
    path.join(PREVIEW_DIR, 'gobliny.png'),
    buildGoblinPreview(font, goblins).scale(5)
  ));

  console.log(`Font: ${CHARSET.length} znaków | kafle: ${tiles.length} | obiekty: ${props.length} | klatki postaci: ${goblins.length}`);
  for (const item of written) {
    console.log(`  ${item.file}${item.size ? `  (${item.size})` : ''}`);
  }
}

main();
