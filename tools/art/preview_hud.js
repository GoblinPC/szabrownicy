// Test wiernosci: panel gracza z obrazka odniesienia obok wygenerowanego.
//
//   node tools/art/preview_hud.js
//
// Po lewej wycinek z `Assets/hud.png` (material podeslany przez uzytkownika,
// pomniejszony trzykrotnie do naszej skali), po prawej to samo zlozone z naszych
// wygenerowanych kawalkow. Obok siebie widac roznice, ktorej osobno nie widac -
// tak wyszlo, ze pierwsza wersja ramki byla PLASKA, bo nie miala fazy, a paski
// wygladaly jak wykres slupkowy, bo nie mialy polysku.
//
// `Assets/` jest w `.gitignore` i TAK MA ZOSTAC: to grafika z generatora
// obrazow, material odniesienia, a nie czesc gry. Zasada projektu mowi, ze cala
// grafika powstaje programistycznie - z tego pliku bierzemy wylacznie MIARY.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Canvas } from './canvas.js';
import { encodePng } from './png.js';
import { readPng } from './png_read.js';
import { buildUi, SLICE } from './ui.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REF = path.join(ROOT, 'Assets/hud.png');
const OUT = path.join(ROOT, 'docs/preview/hud_porownanie.png');
if (!fs.existsSync(REF)) {
  console.log('brak Assets/hud.png - to material odniesienia, nie jest w repozytorium');
  process.exit(0);
}
const ref = readPng(REF);
const parts = new Map(buildUi().map((e) => [e.name, e.canvas]));

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Wycinek odniesienia pomniejszony caĹ‚kowitÄ… liczbÄ… razy (Ĺ›rednia z bloku). */
function crop(x0, y0, w, h, shrink) {
  const out = new Canvas(Math.floor(w / shrink), Math.floor(h / shrink));
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let sy = 0; sy < shrink; sy++) {
        for (let sx = 0; sx < shrink; sx++) {
          const i = ((y0 + y * shrink + sy) * ref.width + (x0 + x * shrink + sx)) * 4;
          r += ref.data[i]; g += ref.data[i + 1]; b += ref.data[i + 2]; n++;
        }
      }
      out.set(x, y, hex(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
    }
  }
  return out;
}

/** Ramka 9-slice zĹ‚oĹĽona tak, jak zrobi to gra. */
function nine(src, w, h) {
  const out = new Canvas(w, h);
  const s = SLICE;
  const put = (sx, sy, dx, dy, dw, dh) => {
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const col = src.get(sx + (dw === s ? x : x % s), sy + (dh === s ? y : y % s));
      if (col) out.set(dx + x, dy + y, col);
    }
  };
  put(0, 0, 0, 0, s, s);
  put(2 * s, 0, w - s, 0, s, s);
  put(0, 2 * s, 0, h - s, s, s);
  put(2 * s, 2 * s, w - s, h - s, s, s);
  put(s, 0, s, 0, w - 2 * s, s);
  put(s, 2 * s, s, h - s, w - 2 * s, s);
  put(0, s, 0, s, s, h - 2 * s);
  put(2 * s, s, w - s, s, s, h - 2 * s);
  put(s, s, s, s, w - 2 * s, h - 2 * s);
  return out;
}

// Panel gracza z odniesienia: mniej wiecej 20,42 - 400,196 przy 1536 px szerokosci.
// Zmniejszony trzykrotnie daje 126x51 - blisko naszej skali HUD.
const wzor = crop(20, 42, 381, 153, 3);

// Nasza wersja w tym samym rozmiarze.
const moja = new Canvas(wzor.width, wzor.height);
moja.blit(nine(parts.get('frame_panel'), wzor.width, wzor.height), 0, 0);
// Trzy paski w srodku, jak na wzorze: zycie, unik, glod.
const bary = [['bar_hurt', 1], ['bar_life', 0.7], ['bar_empty', 0.45]];
bary.forEach(([klucz, ile], i) => {
  const bx = 30; const by = 7 + i * 13; const bw = wzor.width - bx - 8; const bh = 12;
  moja.blit(nine(parts.get('frame_slot'), bw, bh), bx, by);
  const plaster = parts.get(klucz);
  const pelne = Math.round((bw - 6) * ile);
  for (let x = 0; x < bw - 6; x++) {
    for (let y = 0; y < 10; y++) {
      const col = x < pelne ? plaster.get(0, y) : parts.get('bar_empty').get(0, y);
      if (col) moja.set(bx + 3 + x, by + 1 + y, col);
    }
  }
});

const PAD = 4;
const sheet = new Canvas(wzor.width * 2 + PAD * 3, wzor.height + PAD * 2 + 10);
sheet.fill('#151515');
sheet.blit(wzor, PAD, PAD + 10);
sheet.blit(moja, PAD * 2 + wzor.width, PAD + 10);

const big = sheet.scale(5);
fs.writeFileSync(OUT, encodePng(big.width, big.height, big.data));
console.log(`wzor ${wzor.width}x${wzor.height}   (po lewej odniesienie, po prawej wygenerowane)`);



