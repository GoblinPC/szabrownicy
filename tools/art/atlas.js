// Pakowanie pojedynczych obrazków w atlasy plus metryki w formacie,
// który Phaser wczytuje bez żadnej konwersji.

import { Canvas } from './canvas.js';

/** Siatka o stałym oczku — kafle terenu. Zwraca też listę nazw w kolejności klatek. */
export function packGrid(entries, { cell, columns = 16 }) {
  const rows = Math.ceil(entries.length / columns);
  const canvas = new Canvas(columns * cell, rows * cell);
  const index = {};
  entries.forEach(({ name, canvas: sprite }, i) => {
    const x = (i % columns) * cell;
    const y = Math.floor(i / columns) * cell;
    canvas.blit(sprite, x, y);
    index[name] = i;
  });
  return { canvas, index, cell, columns };
}

/**
 * Pakowanie półkowe dla obrazków o różnych rozmiarach — obiekty i postacie.
 * Sortuje malejąco po wysokości, żeby półki były równe.
 */
export function packShelf(entries, { maxWidth = 256, padding = 1 } = {}) {
  const sorted = [...entries].sort((a, b) => b.canvas.height - a.canvas.height);
  const placed = [];
  let shelfY = 0;
  let shelfH = 0;
  let cursorX = 0;
  let usedWidth = 0;

  for (const entry of sorted) {
    const { width: w, height: h } = entry.canvas;
    if (cursorX + w > maxWidth && cursorX > 0) {
      shelfY += shelfH + padding;
      shelfH = 0;
      cursorX = 0;
    }
    placed.push({ ...entry, x: cursorX, y: shelfY });
    cursorX += w + padding;
    shelfH = Math.max(shelfH, h);
    usedWidth = Math.max(usedWidth, cursorX - padding);
  }

  const canvas = new Canvas(Math.max(1, usedWidth), Math.max(1, shelfY + shelfH));
  const frames = {};
  for (const item of placed) {
    canvas.blit(item.canvas, item.x, item.y);
    frames[item.name] = {
      frame: { x: item.x, y: item.y, w: item.canvas.width, h: item.canvas.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.canvas.width, h: item.canvas.height },
      sourceSize: { w: item.canvas.width, h: item.canvas.height },
    };
  }
  return { canvas, frames };
}

/** Metryki atlasu w formacie JSON Hash (Phaser: `this.load.atlas`). */
export function atlasJson(frames, imageName, canvas) {
  return JSON.stringify({
    frames,
    meta: {
      app: 'szabrownicy/tools/art',
      image: imageName,
      format: 'RGBA8888',
      size: { w: canvas.width, h: canvas.height },
      scale: '1',
    },
  }, null, 1);
}
