// Odczyt PNG do surowych pikseli RGBA.
//
// Potrzebny wyłącznie do **materiałów odniesienia**: z obrazka podesłanego przez
// użytkownika wyciągamy paletę, proporcje i grubości, a potem generujemy własną
// grafikę tak, żeby w nie trafiała. Nic z odczytanych pikseli nie trafia do gry —
// zasada projektu mówi, że cała grafika powstaje programistycznie, i ona zostaje.
//
// Node ma `zlib` w standardzie, więc dekoder to nagłówek, rozpakowanie i cofnięcie
// filtrów wierszowych. Nie obsługuje przeplotu Adama7 ani palet indeksowanych —
// nie ma potrzeby, obrazy odniesienia to zwykłe RGB/RGBA.

import zlib from 'node:zlib';
import fs from 'node:fs';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** @returns {{ width, height, data: Uint8Array }} — `data` to RGBA, 4 bajty na piksel. */
export function decodePng(buffer) {
  for (let i = 0; i < SIG.length; i++) {
    if (buffer[i] !== SIG[i]) throw new Error('to nie jest PNG');
  }

  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const chunks = [];

  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      if (depth !== 8) throw new Error(`obsługiwane jest tylko 8 bitów na kanał, jest ${depth}`);
      if (body[12] !== 0) throw new Error('przeplot Adama7 nieobsługiwany');
    } else if (type === 'IDAT') {
      chunks.push(body);
    } else if (type === 'IEND') {
      break;
    }

    pos += 12 + length;
  }

  // 0 = szarość, 2 = RGB, 4 = szarość+alfa, 6 = RGBA.
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`nieobsługiwany typ koloru ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let i = 0; i < stride; i++) line[i] = raw[src + i];
    src += stride;

    // Cofanie filtrów wierszowych — dokładnie jak w specyfikacji PNG.
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const cc = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 1: line[i] = (line[i] + a) & 255; break;
        case 2: line[i] = (line[i] + b) & 255; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - cc;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - cc);
          const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : cc);
          line[i] = (line[i] + pred) & 255;
          break;
        }
        default: break;
      }
    }

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (channels === 1) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = 255;
      } else if (channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = line[s + 1];
      } else if (channels === 3) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255;
      } else {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3];
      }
    }

    prev.set(line);
  }

  return { width, height, data: out };
}

export function readPng(file) {
  return decodePng(fs.readFileSync(file));
}
