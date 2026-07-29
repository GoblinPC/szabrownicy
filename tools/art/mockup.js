// Złożona scena poglądowa: kawałek wnętrza kuźni z obiektami, postaciami
// i policzonym oświetleniem.
//
// Powstaje po to, żeby ocenić grafikę uczciwie. Pojedyncze sprite'y wyłożone
// na płaskim tle zawsze wyglądają gorzej niż w grze, bo brakuje im tego, co
// naprawdę robi klimat: wspólnego światła, cieni i kontrastu.

import { Canvas, color } from './canvas.js';
import { c } from './palette.js';
import { makeRng, seedFrom } from './rng.js';
import { buildTiles } from './tiles.js';
import { buildProps } from './props.js';
import { buildGoblins } from './goblins.js';

const W = 256;
const H = 184;

const lookup = (entries) => new Map(entries.map((e) => [e.name, e.canvas]));

/**
 * Nakłada oświetlenie na gotową scenę.
 *
 * Dla każdego piksela sumujemy wkład wszystkich źródeł i dodajemy światło
 * otoczenia. Wynik poniżej 1 przyciemnia scenę (mnożenie), nadwyżka powyżej 1
 * rozjaśnia ku bieli — stąd wrażenie żaru bijącego z paleniska.
 */
function applyLighting(scene, lights, ambient, { vignette = 0.5 } = {}) {
  const out = new Canvas(scene.width, scene.height);
  const amb = ambient.map((v) => v / 255);
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  const maxDist = Math.hypot(cx, cy);

  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      const [r, g, b, a] = scene.get(x, y);
      if (a === 0) continue;

      let lr = amb[0], lg = amb[1], lb = amb[2];
      for (const L of lights) {
        const d = Math.hypot(x - L.x, y - L.y);
        if (d >= L.radius) continue;
        // Kwadratowy spadek — miękki brzeg plamy światła, mocne jądro.
        const f = ((1 - d / L.radius) ** 1.6) * L.intensity;
        lr += (L.color[0] / 255) * f;
        lg += (L.color[1] / 255) * f;
        lb += (L.color[2] / 255) * f;
      }

      if (vignette > 0) {
        const v = 1 - vignette * (Math.hypot(x - cx, y - cy) / maxDist) ** 2;
        lr *= v; lg *= v; lb *= v;
      }

      const ch = (value, light) => {
        const dim = value * Math.min(1, light);
        const bloom = Math.max(0, light - 1) * 190;
        return Math.min(255, dim + bloom);
      };
      out.set(x, y, [ch(r, lr), ch(g, lg), ch(b, lb), a]);
    }
  }
  return out;
}

/** Miękki cień pod postacią — kładziony przed nią, żeby nie zakrywał stóp. */
function dropShadow(target, x, y, rx, ry) {
  for (let j = -ry; j <= ry; j++) {
    for (let i = -rx; i <= rx; i++) {
      const d = (i / rx) ** 2 + (j / ry) ** 2;
      if (d > 1) continue;
      target.px(x + i, y + j, [0, 0, 0, Math.round(110 * (1 - d))]);
    }
  }
}

function buildScene() {
  const rng = makeRng(seedFrom('mockup'));
  const tiles = lookup(buildTiles());
  const props = lookup(buildProps());
  const goblins = lookup(buildGoblins());
  const t = new Canvas(W, H);

  // --- Podłoże ---
  for (let ty = 0; ty * 16 < H; ty++) {
    for (let tx = 0; tx * 16 < W; tx++) {
      const x = tx * 16;
      const y = ty * 16;
      let key;
      if (ty === 0) key = 'wall_top';
      else if (ty === 1) key = tx >= 1 && tx <= 5 ? 'wall_face_soot' : `wall_face_${rng.int(3)}`;
      else {
        const nearHearth = Math.hypot(tx - 3, ty - 4) < 4.5;
        key = nearHearth
          ? (rng.chance(0.6) ? 'floor_stone_soot' : 'floor_stone_soot2')
          : `floor_stone_${rng.int(4)}`;
      }
      t.blit(tiles.get(key), x, y);
    }
  }

  // --- Dekale ---
  for (let i = 0; i < 14; i++) {
    const x = rng.int(W - 16);
    const y = 32 + rng.int(H - 48);
    const d = Math.hypot(x - 48, y - 78);
    if (d < 90 && rng.chance(0.7)) {
      t.blit(tiles.get(rng.chance(0.5) ? 'decal_soot_0' : 'decal_soot_1'), x, y);
    } else if (rng.chance(0.4)) {
      t.blit(tiles.get(`decal_crack_${rng.int(2)}`), x, y);
    }
  }

  // --- Obiekty i postacie, sortowane po dolnej krawędzi ---
  // `sort` rozstrzyga kolejność rysowania. Płomienie dostają wartość odrobinę
  // większą niż obiekt, na którym płoną, bo inaczej palenisko zasłania własny ogień.
  const items = [];
  const prop = (key, x, y, sort = y) => items.push({ canvas: props.get(key), x, y, sort, shadow: null });
  const goblin = (key, x, y) => items.push({ canvas: goblins.get(key), x, y, sort: y, shadow: [7, 3] });

  prop('torch', 140, 34);
  prop('torch', 214, 34);
  prop('flame_small_1', 140, 22, 34.5);
  prop('flame_small_3', 214, 22, 34.5);
  prop('hearth', 48, 80);
  prop('flame_big_1', 48, 75, 80.5);
  prop('bellows', 96, 74);
  prop('workbench', 204, 70);
  prop('rack', 244, 78);
  prop('anvil', 122, 122);
  prop('trough', 180, 142);
  prop('crate', 26, 146);
  prop('barrel', 232, 116);
  prop('barrel', 244, 130);
  prop('bucket', 152, 130);
  prop('logs', 66, 168);

  goblin('g0_side_idle0', 96, 128);
  goblin('g2_down_idle0', 146, 158);
  goblin('g3_up_idle1', 200, 112);
  goblin('g4_side_run2', 214, 172);

  items.sort((a, b) => a.sort - b.sort);
  for (const item of items) {
    if (item.shadow) dropShadow(t, item.x, item.y - 1, item.shadow[0], item.shadow[1]);
    t.blit(item.canvas, item.x - Math.floor(item.canvas.width / 2), item.y - item.canvas.height);
  }

  // --- Iskry nad paleniskiem ---
  for (let i = 0; i < 22; i++) {
    const x = 48 + Math.round(rng.range(-13, 13));
    const y = 58 - Math.round(rng.range(0, 34));
    const hot = rng.chance(0.5);
    t.px(x, y, c('ember', hot ? 4 : 3));
  }

  return t;
}

export function buildMockup(font, drawText) {
  const flat = buildScene();
  // Światło otoczenia trzeba trzymać na tyle wysoko, żeby zakamarki bez pochodni
  // dało się jeszcze czytać — inaczej pół kuźni znika w czerni.
  const AMBIENT_FORGE = [122, 96, 84];
  const lit = applyLighting(flat, [
    { x: 48, y: 66, radius: 150, color: [255, 148, 46], intensity: 1.5 },
    { x: 48, y: 70, radius: 58, color: [255, 226, 150], intensity: 1.2 },
    { x: 140, y: 28, radius: 92, color: [255, 168, 62], intensity: 1.0 },
    { x: 214, y: 28, radius: 92, color: [255, 168, 62], intensity: 1.0 },
    // Chłodne rozproszone światło od strony bramy — rozbija monotonię ciepła.
    { x: 210, y: 184, radius: 130, color: [120, 160, 220], intensity: 0.55 },
  ], AMBIENT_FORGE, { vignette: 0.38 });

  const gap = 16;
  const out = new Canvas(W, H * 2 + gap + 14);
  out.fill(c('soot', 0));
  out.blit(lit, 0, 12);
  drawText(out, font, 3, 2, 'kuźnia — tak wygląda ze światłem', c('ember', 3));
  out.blit(flat, 0, H + gap + 12);
  drawText(out, font, 3, H + gap + 2, 'te same sprite\'y bez warstwy świetlnej', c('stone', 3));
  return out;
}
