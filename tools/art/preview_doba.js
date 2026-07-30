// Podgląd cyklu dnia i nocy.
//   node tools/art/preview_doba.js
//
// Ten sam wycinek świata co w `preview_world.js`, ale przepuszczony przez warstwę
// świetlną o sześciu różnych porach doby. Powstał po to, żeby dobrać kolory nieba
// **patrząc na nie**, a nie zgadując z liczb w tabeli — przy oświetleniu mnożonym
// przez teksturę odcień na ekranie nigdy nie jest tym, który się wpisało.
//
// Barwy i wszystkie stałe pochodzą z kodu gry (`world/daylight.js`,
// `render/lighting.js`), więc podgląd nie może pokazać czegoś innego, niż zobaczy
// gracz. Reimplementowane jest tu **samo składanie** maski: gra robi je płótnem
// 2D przeglądarki, którego w Node nie ma. To znaczy, że różnice w rozmyciu
// gradientu są możliwe — kolory i moc świateł nie.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from './canvas.js';
import { encodePng } from './png.js';
import { c } from './palette.js';
import { buildFont, drawText } from './font.js';
import { buildTiles, TILE } from './tiles.js';
import { buildProps } from './props.js';
import { buildWorld, INTERIOR_PX } from '../../client/src/world/forge.js';
import { skyColor, darkness, partOfDay } from '../../client/src/world/daylight.js';
import { AMBIENT_FORGE, FORGE_NIGHT, TORCH_DAY, VIGNETTE_DAY } from '../../client/src/render/lighting.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const tiles = new Map(buildTiles().map((t) => [t.name, t.canvas]));
const props = new Map(buildProps().map((p) => [p.name, p.canvas]));
const font = buildFont();
const world = buildWorld();

// Wycinek obejmuje bramę: u góry hala, u dołu plac. O to chodzi — najwięcej
// widać na styku dwóch świateł. Z `--bez-dachu` zdejmujemy dach, żeby ocenić
// wnętrze; z dachem widać to, co widzi gracz stojący na placu.
const noRoof = process.argv.includes('--bez-dachu');
const CROP = { x0: 14, y0: 8, x1: 34, y1: 28 };
const W = (CROP.x1 - CROP.x0 + 1) * TILE;
const H = (CROP.y1 - CROP.y0 + 1) * TILE;
const ox = CROP.x0 * TILE;
const oy = CROP.y0 * TILE;

/** Scena bez światła — rysowana raz, potem tylko kopiowana. */
function drawScene() {
  const canvas = new Canvas(W, H);
  canvas.fill(c('soot', 0));

  for (let y = CROP.y0; y <= CROP.y1; y++) {
    for (let x = CROP.x0; x <= CROP.x1; x++) {
      const tile = tiles.get(world.tiles[y][x]);
      if (tile) canvas.blit(tile, x * TILE - ox, y * TILE - oy);
    }
  }
  for (const d of world.decals) {
    if (d.x < ox || d.y < oy || d.x >= ox + W || d.y >= oy + H) continue;
    const tile = tiles.get(d.key);
    if (tile) canvas.blit(tile, d.x - ox, d.y - oy);
  }
  for (const p of [...world.props].sort((a, b) => a.y - b.y)) {
    const sprite = props.get(p.key);
    if (!sprite) continue;
    canvas.blit(sprite, p.x - Math.floor(sprite.width / 2) - ox, p.y - sprite.height - oy);
  }
  for (const t of (noRoof ? [] : world.roof)) {
    const tile = tiles.get(t.key);
    if (!tile) continue;
    if (t.x < ox - TILE || t.y < oy - TILE || t.x >= ox + W || t.y >= oy + H) continue;
    canvas.blit(tile, t.x - ox, t.y - oy);
  }
  return canvas;
}

const inInterior = (x, y) =>
  x >= INTERIOR_PX.x && x <= INTERIOR_PX.x + INTERIOR_PX.w
  && y >= INTERIOR_PX.y && y <= INTERIOR_PX.y + INTERIOR_PX.h;

/**
 * Maska światła dla podanej pory doby — dokładnie w tej kolejności co w grze:
 * otoczenie, źródła światła dodawane, winieta.
 */
function lightMask(phase) {
  const night = darkness(phase);
  const yard = skyColor(phase);
  const forgeDim = 1 - (1 - FORGE_NIGHT) * night;
  const forge = AMBIENT_FORGE.map((v) => v * forgeDim);
  const outdoorDim = TORCH_DAY + (1 - TORCH_DAY) * night;

  const mask = new Float64Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ambient = inInterior(x + ox, y + oy) ? forge : yard;
      const i = (y * W + x) * 3;
      mask[i] = ambient[0];
      mask[i + 1] = ambient[1];
      mask[i + 2] = ambient[2];
    }
  }

  // Bez migotania: podgląd ma pokazywać porę dnia, nie przypadkową klatkę ognia.
  for (const light of world.lights) {
    const dim = inInterior(light.x, light.y) ? 1 : outdoorDim;
    const radius = light.radius * (0.7 + 0.3 * dim);
    const strength = light.intensity * dim;
    const lx = light.x - ox;
    const ly = light.y - oy;

    for (let y = Math.max(0, Math.floor(ly - radius)); y < Math.min(H, ly + radius); y++) {
      for (let x = Math.max(0, Math.floor(lx - radius)); x < Math.min(W, lx + radius); x++) {
        const d = Math.hypot(x - lx, y - ly) / radius;
        if (d >= 1) continue;
        // Odwzorowanie trzech przystanków gradientu z `lighting.js`.
        const k = d < 0.4
          ? strength * (1 - (d / 0.4) * (1 - 0.42))
          : strength * 0.42 * (1 - (d - 0.4) / 0.6);
        const i = (y * W + x) * 3;
        mask[i] += light.color[0] * k;
        mask[i + 1] += light.color[1] * k;
        mask[i + 2] += light.color[2] * k;
      }
    }
  }

  // Winieta.
  const inner = Math.min(W, H) * 0.32;
  const outer = Math.max(W, H) * 0.72;
  const peak = (VIGNETTE_DAY + (1 - VIGNETTE_DAY) * night) * 0.55;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W / 2, y - H / 2);
      if (d <= inner) continue;
      const a = Math.min(1, (d - inner) / (outer - inner)) * peak;
      const i = (y * W + x) * 3;
      mask[i] = mask[i] * (1 - a) + 6 * a;
      mask[i + 1] = mask[i + 1] * (1 - a) + 4 * a;
      mask[i + 2] = mask[i + 2] * (1 - a) + 8 * a;
    }
  }

  return mask;
}

/** Scena pomnożona przez maskę — tak jak tryb MULTIPLY w grze. */
function lit(scene, phase) {
  const out = scene.clone();
  const mask = lightMask(phase);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const m = (y * W + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        out.data[i + ch] = Math.max(0, Math.min(255,
          Math.round(out.data[i + ch] * Math.min(255, mask[m + ch]) / 255)));
      }
    }
  }
  return out;
}

// Godziny dobrane pod wieczór: to on był źle rozłożony i to jego trzeba oglądać.
const HOURS = [
  { phase: 0.02, label: 'noc 00:30' },
  { phase: 0.24, label: 'swit 05:45' },
  { phase: 0.50, label: 'poludnie 12:00' },
  { phase: 0.75, label: '18:00' },
  { phase: 0.83, label: '20:00' },
  { phase: 0.88, label: '21:10' },
  { phase: 0.93, label: '22:20' },
];

const scene = drawScene();

// Pierwsza kratka to scena **bez światła** — bez niej nie da się powiedzieć, czy
// południe jest za ciemne, czy to po prostu ciemna tekstura ziemi.
const PANELS = [{ canvas: scene, label: 'bez swiatla', sky: null }].concat(
  HOURS.map((hour) => ({
    canvas: lit(scene, hour.phase),
    label: `${hour.label} / ${partOfDay(hour.phase)}`,
    sky: skyColor(hour.phase),
  }))
);

const COLS = 4;
const ROWS = Math.ceil(PANELS.length / COLS);
const PAD = 3;
const LABEL = 10;

const sheet = new Canvas(
  COLS * (W + PAD) + PAD,
  ROWS * (H + LABEL + PAD) + PAD + 12
);
sheet.fill(c('soot', 0));

PANELS.forEach((panel, index) => {
  const x = PAD + (index % COLS) * (W + PAD);
  const y = 12 + PAD + Math.floor(index / COLS) * (H + LABEL + PAD);
  sheet.blit(panel.canvas, x, y);
  drawText(sheet, font, x, y + H + 2, panel.label, c('ember', 3));
  // Pasek prawdziwego koloru nieba obok podpisu — do porównania z tym, co widać.
  if (panel.sky) {
    sheet.rect(x + W - 13, y + H + 2, 13, 7,
      `#${panel.sky.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  }
});

drawText(sheet, font, PAD, 3,
  `doba 16 minut, kolor nieba z daylight.js${noRoof ? '  (bez dachu)' : ''}`, c('ember', 4));

const out = path.join(ROOT, `docs/preview/doba${noRoof ? '_wnetrze' : ''}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const big = sheet.scale(3);
fs.writeFileSync(out, encodePng(big.width, big.height, big.data));
console.log(`${path.relative(ROOT, out)}  (${big.width}x${big.height})`);
for (const hour of HOURS) {
  const sky = skyColor(hour.phase);
  console.log(`  ${hour.label.padEnd(16)} niebo ${String(sky).padEnd(15)} mrok ${darkness(hour.phase).toFixed(2)}`);
}
