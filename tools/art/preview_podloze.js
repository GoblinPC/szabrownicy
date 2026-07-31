// Arkusz kontrolny warstwy nakładkowej — `docs/preview/podloze.png`.
//
// Trzy rzeczy naraz, bo każdej brakowało, gdy podłoże było kanciaste:
//   1. komplet piętnastu układów rogów obok siebie — widać, czy narożniki są obłe,
//   2. łata trawy złożona z tych układów na ziemi — widać, czy schodzą się bez szwu,
//   3. ten sam kadr **starym sposobem** (kafel trawy albo kafel ziemi) do porównania.
//
// Punkt 3 jest tu najważniejszy: bez niego nie da się odróżnić „nowe jest obłe"
// od „nowe jest tak samo kanciaste, tylko inaczej pokolorowane".

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from './canvas.js';
import { buildTiles, TILE } from './tiles.js';
import { encodePng } from './png.js';
import { makeRng, seedFrom } from './rng.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const tiles = new Map(buildTiles().map((e) => [e.name, e.canvas]));
const get = (name) => {
  const t = tiles.get(name);
  if (!t) throw new Error(`Brak kafla ${name}`);
  return t;
};

// --- Przykładowa łata terenu --------------------------------------------------

const W = 22;
const H = 14;
const rng = makeRng(seedFrom('podglad-podloze'));

// Miękka plama gęstości — ta sama metoda co w `terrain.js`, żeby kształt łaty był
// taki jak w grze, a nie wymyślony na potrzeby obrazka.
const field = (x, y, seed) => {
  const a = Math.sin(x * 0.31 + seed) * Math.cos(y * 0.27 - seed);
  const b = Math.sin((x + y) * 0.14 + seed * 2.3);
  const c = Math.cos(x * 0.08 - y * 0.11 + seed * 0.7);
  return (a * 0.5 + b * 0.3 + c * 0.2 + 1) / 2;
};

const grassAt = [];
const pathAt = [];
for (let y = 0; y < H; y++) {
  grassAt.push([]);
  pathAt.push([]);
  for (let x = 0; x < W; x++) {
    grassAt[y].push(field(x, y, 3.7) > 0.46);
    // Droga: pas przez środek z wężykiem — sprawdzamy krawędź o innym przebiegu
    // niż plama trawy, bo prosty pas i obła plama psują się inaczej.
    pathAt[y].push(Math.abs(y - (7 + Math.sin(x * 0.5) * 2)) < 1.6);
  }
}

const dirtAt = (x, y) => get(`dirt_${((x * 7 + y * 3) % 4 + 4) % 4}`);

/** Maska rogów komórki nakładki o współrzędnych (cx, cy); siatka przesunięta o -8 px. */
function maskAt(grid, cx, cy) {
  const at = (x, y) => Boolean(grid[y]?.[x]);
  return (at(cx - 1, cy - 1) ? 1 : 0) | (at(cx, cy - 1) ? 2 : 0)
    | (at(cx - 1, cy) ? 4 : 0) | (at(cx, cy) ? 8 : 0);
}

function drawWarstwowo(out, ox, oy) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) out.blit(dirtAt(x, y), ox + x * TILE, oy + y * TILE);
  }
  for (const [grid, kind] of [[grassAt, 'grass'], [pathAt, 'path']]) {
    for (let cy = 0; cy <= H; cy++) {
      for (let cx = 0; cx <= W; cx++) {
        const mask = maskAt(grid, cx, cy);
        if (!mask) continue;
        const phase = (cx & 3) | ((cy & 3) << 2);
        out.blit(get(`ov_${kind}_${mask}_${phase}`), ox + cx * TILE - 8, oy + cy * TILE - 8);
      }
    }
  }
}

function drawPoStaremu(out, ox, oy) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const key = pathAt[y][x] ? `path_${(x + y) % 2}`
        : grassAt[y][x] ? `grass_${(x * 5 + y) % 3}`
          : `dirt_${((x * 7 + y * 3) % 4 + 4) % 4}`;
      out.blit(get(key), ox + x * TILE, oy + y * TILE);
    }
  }
}

// --- Arkusz -------------------------------------------------------------------

const PAD = 8;
const stripH = TILE * 2 + PAD;
const patchW = W * TILE;
const patchH = H * TILE;

const sheet = new Canvas(patchW + PAD * 2, stripH + PAD + (patchH + PAD) * 2 + PAD);
sheet.fill('#101014');

// Pasek: piętnaście układów rogów, faza 0, na ziemi.
let sx = PAD;
for (let mask = 1; mask < 16; mask++) {
  sheet.blit(get('dirt_0'), sx, PAD);
  sheet.blit(get(`ov_grass_${mask}_0`), sx, PAD);
  sx += TILE + 1;
}

drawWarstwowo(sheet, PAD, PAD + stripH);
drawPoStaremu(sheet, PAD, PAD + stripH + patchH + PAD);

const big = sheet.scale(3);
const outDir = join(ROOT, 'docs', 'preview');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, 'podloze.png');
writeFileSync(file, encodePng(big.width, big.height, big.data));
console.log(`  ${file}  (${big.width}x${big.height})`);
console.log('  gora: 15 ukladow rogow | srodek: warstwowo | dol: po staremu');
