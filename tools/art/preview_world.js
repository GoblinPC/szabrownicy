// Podgląd fragmentu świata renderowany poza przeglądarką.
// Uruchamiane: node tools/art/preview_world.js [x0 y0 x1 y1]  (w kaflach)
//
// Powstał po tym, jak kilka błędów w układzie mapy dało się zauważyć dopiero
// w grze: dach wchodzący na mur, krokiew ucinająca się na bramie, brak progu.
// Tutaj widać dokładnie to samo, co widzi gracz, ale bez odpalania gry —
// i można to obejrzeć, zanim się powie, że gotowe.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from './canvas.js';
import { encodePng } from './png.js';
import { c } from './palette.js';
import { buildFont, drawText } from './font.js';
import { buildTiles, TILE } from './tiles.js';
import { buildProps } from './props.js';
import { buildGoblins } from './goblins.js';
import { buildWorld, BUILDING_PX, ROOF_PX } from '../../client/src/world/forge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const tiles = new Map(buildTiles().map((t) => [t.name, t.canvas]));
const props = new Map(buildProps().map((p) => [p.name, p.canvas]));
const goblins = new Map(buildGoblins().map((g) => [g.name, g.canvas]));
const font = buildFont();
const world = buildWorld();

const noRoof = process.argv.includes('--bez-dachu');
const [ax, ay, bx, by] = process.argv.filter((a) => !a.startsWith('--')).slice(2).map(Number);
const crop = Number.isFinite(ax)
  ? { x0: ax, y0: ay, x1: bx, y1: by }
  : { x0: 14, y0: 12, x1: 34, y1: 26 };   // domyślnie okolice bramy

const W = (crop.x1 - crop.x0 + 1) * TILE;
const H = (crop.y1 - crop.y0 + 1) * TILE;
const ox = crop.x0 * TILE;
const oy = crop.y0 * TILE;

const canvas = new Canvas(W, H + 14);
canvas.fill(c('soot', 0));

// 1. Podłoże i dekale.
for (let y = crop.y0; y <= crop.y1; y++) {
  for (let x = crop.x0; x <= crop.x1; x++) {
    const tile = tiles.get(world.tiles[y][x]);
    if (tile) canvas.blit(tile, x * TILE - ox, y * TILE - oy + 14);
  }
}
// Kępki trawy są osobną listą, bo w grze gną się pod postacią i muszą być
// osobnymi obiektami. Na podglądzie stoją prosto — rysujemy je razem z resztą.
for (const d of [...world.decals, ...world.tufts]) {
  if (d.x < ox || d.y < oy || d.x >= ox + W || d.y >= oy + H) continue;
  const tile = tiles.get(d.key);
  if (tile) canvas.blit(tile, d.x - ox, d.y - oy + 14);
}

// 2. Obiekty, sortowane po Y jak w grze.
for (const p of [...world.props].sort((a, b) => a.y - b.y)) {
  const sprite = props.get(p.key);
  if (!sprite) continue;
  const px = p.x - Math.floor(sprite.width / 2) - ox;
  const py = p.y - sprite.height - oy + 14;
  if (px > W || py > H + 14 || px + sprite.width < 0 || py + sprite.height < 0) continue;
  canvas.blit(sprite, px, py);
}

// 3. Postać postawiona tuż przed murem od strony placu — tak stoi gracz, który
// podchodzi do budynku. To ona pokazuje, czy dach nie wchodzi jej na głowę.
const probe = goblins.get('g0_up_idle0');
const PROBE = { x: 384, y: 336 };
// Wyśrodkowana z szerokości sprite'a, nie z wpisanej na sztywno połowy kafla —
// klatka postaci ma margines na obrys i nie jest już równa szesnastu pikselom.
canvas.blit(probe, PROBE.x - Math.floor(probe.width / 2) - ox, PROBE.y - probe.height - oy + 14);

// 4. Dach na wierzchu, tak jak w grze.
for (const t of (noRoof ? [] : world.roof)) {
  const tile = tiles.get(t.key);
  if (!tile) continue;
  if (t.x < ox - TILE || t.y < oy - TILE || t.x >= ox + W || t.y >= oy + H) continue;
  canvas.blit(tile, t.x - ox, t.y - oy + 14);
}

drawText(canvas, font, 2, 3,
  `dach do y=${ROOF_PX.y + ROOF_PX.h}  budynek do y=${BUILDING_PX.y + BUILDING_PX.h}`, c('ember', 3));

const out = path.join(ROOT, 'docs/preview/swiat.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
const big = canvas.scale(4);
fs.writeFileSync(out, encodePng(big.width, big.height, big.data));

console.log(`docs/preview/swiat.png  (${big.width}x${big.height})  kafle ${crop.x0},${crop.y0} - ${crop.x1},${crop.y1}`);
console.log(`  dach:    y ${ROOF_PX.y} - ${ROOF_PX.y + ROOF_PX.h}  (kafle ${ROOF_PX.y / TILE} - ${(ROOF_PX.y + ROOF_PX.h) / TILE})`);
console.log(`  budynek: y ${BUILDING_PX.y} - ${BUILDING_PX.y + BUILDING_PX.h}  (kafle ${BUILDING_PX.y / TILE} - ${(BUILDING_PX.y + BUILDING_PX.h) / TILE})`);
console.log(`  glowa postaci stojacej przy murze siega y=${PROBE.y - probe.height}`);
