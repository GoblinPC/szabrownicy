// Mikro-biblioteka do rysowania pikseli. Wszystkie generatory grafiki operują na Canvas.
// Kolory podaje się jako '#rrggbb', '#rrggbbaa' albo [r,g,b,a]; null/undefined = przezroczysty.

const COLOR_CACHE = new Map();

export function color(input) {
  if (input == null) return [0, 0, 0, 0];
  if (Array.isArray(input)) return [input[0], input[1], input[2], input[3] ?? 255];
  const cached = COLOR_CACHE.get(input);
  if (cached) return cached;

  let hex = String(input).trim().replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  if (hex.length !== 6 && hex.length !== 8) throw new Error(`Zły kolor: ${input}`);
  const parsed = [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
  ];
  COLOR_CACHE.set(input, parsed);
  return parsed;
}

/** Kolor z przemnożoną przezroczystością — wygodne przy cieniach i poświatach. */
export function withAlpha(input, alpha) {
  const [r, g, b, a] = color(input);
  return [r, g, b, Math.round(a * alpha)];
}

/** Mieszanie dwóch kolorów; t=0 daje pierwszy, t=1 drugi. */
export function mix(a, b, t) {
  const [r1, g1, b1, a1] = color(a);
  const [r2, g2, b2, a2] = color(b);
  const l = (x, y) => Math.round(x + (y - x) * t);
  return [l(r1, r2), l(g1, g2), l(b1, b2), l(a1, a2)];
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /**
   * Buduje obrazek z rysunku ASCII: tablica równej długości napisów plus mapa
   * znak → kolor. Kropka i spacja są domyślnie przezroczyste.
   */
  static fromAscii(rows, map) {
    const canvas = new Canvas(rows[0].length, rows.length);
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        const col = map[ch];
        if (col == null) throw new Error(`Znak '${ch}' nie ma przypisanego koloru`);
        canvas.px(x, y, col);
      }
    }
    return canvas;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x, y) {
    return (y * this.width + x) * 4;
  }

  /** Rysuje piksel z mieszaniem source-over. */
  px(x, y, col) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return this;
    const [r, g, b, a] = color(col);
    if (a === 0) return this;
    const i = this.index(x, y);
    const d = this.data;
    if (a === 255) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      return this;
    }
    const sa = a / 255;
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) { d[i + 3] = 0; return this; }
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
    return this;
  }

  /** Nadpisuje piksel bez mieszania (również przezroczystością). */
  set(x, y, col) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return this;
    const [r, g, b, a] = color(col);
    const i = this.index(x, y);
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
    return this;
  }

  get(x, y) {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  alphaAt(x, y) {
    if (!this.inside(x, y)) return 0;
    return this.data[this.index(x, y) + 3];
  }

  fill(col) {
    return this.rect(0, 0, this.width, this.height, col);
  }

  clear() {
    this.data.fill(0);
    return this;
  }

  rect(x, y, w, h, col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col);
    return this;
  }

  /** Sam obrys prostokąta. */
  frame(x, y, w, h, col) {
    this.hline(x, x + w - 1, y, col);
    this.hline(x, x + w - 1, y + h - 1, col);
    this.vline(x, y, y + h - 1, col);
    this.vline(x + w - 1, y, y + h - 1, col);
    return this;
  }

  hline(x0, x1, y, col) {
    const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
    for (let x = a; x <= b; x++) this.px(x, y, col);
    return this;
  }

  vline(x, y0, y1, col) {
    const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = a; y <= b; y++) this.px(x, y, col);
    return this;
  }

  /** Odcinek algorytmem Bresenhama. */
  line(x0, y0, x1, y1, col) {
    let x = x0 | 0, y = y0 | 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x, y, col);
      if (x === (x1 | 0) && y === (y1 | 0)) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return this;
  }

  /** Elipsa — wypełniona albo sam obrys. Używana m.in. do cieni pod postaciami. */
  ellipse(cx, cy, rx, ry, col, { fill = true } = {}) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        if (!fill) {
          const inner = ((x + 0.5 - cx) / (rx - 1)) ** 2 + ((y + 0.5 - cy) / (ry - 1)) ** 2;
          if (inner <= 1) continue;
        }
        this.px(x, y, col);
      }
    }
    return this;
  }

  /** Wypełnia obszar wynikiem funkcji (x,y) → kolor|null. */
  forEach(fn) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const col = fn(x, y);
        if (col != null) this.px(x, y, col);
      }
    }
    return this;
  }

  /** Losowe pojedyncze piksele — rdza, sadza, żwir. */
  speckle(rng, col, density, area = null) {
    const { x = 0, y = 0, w = this.width, h = this.height } = area ?? {};
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (rng.next() < density) this.px(i, j, col);
      }
    }
    return this;
  }

  /** Szachownica co drugi piksel — przejścia tonalne bez nowych kolorów. */
  dither(x, y, w, h, col, { offset = 0 } = {}) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (((x + i + y + j + offset) & 1) === 0) this.px(x + i, y + j, col);
      }
    }
    return this;
  }

  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const [r, g, b, a] = src.get(x, y);
        if (a > 0) this.px(dx + x, dy + y, [r, g, b, a]);
      }
    }
    return this;
  }

  /** Przenosi kształt źródła, ale w jednym kolorze — używane przy tekście i cieniach. */
  blitTinted(src, dx, dy, tint, { sx = 0, sy = 0, sw = src.width, sh = src.height } = {}) {
    const [r, g, b, ta] = color(tint);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const a = src.alphaAt(sx + x, sy + y);
        if (a === 0) continue;
        this.px(dx + x, dy + y, [r, g, b, Math.round((a / 255) * ta)]);
      }
    }
    return this;
  }

  sub(x, y, w, h) {
    const out = new Canvas(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) out.set(i, j, this.get(x + i, y + j));
    }
    return out;
  }

  clone() {
    return this.sub(0, 0, this.width, this.height);
  }

  mirrorX() {
    const out = new Canvas(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) out.set(this.width - 1 - x, y, this.get(x, y));
    }
    return out;
  }

  /** Powiększenie całkowitą krotnością — do podglądów, nie do assetów gry. */
  scale(factor) {
    const out = new Canvas(this.width * factor, this.height * factor);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c[3] === 0) continue;
        out.rect(x * factor, y * factor, factor, factor, c);
      }
    }
    return out;
  }

  /** Obrys wokół nieprzezroczystych pikseli — czytelna sylwetka na każdym tle. */
  outline(col, { diagonal = false } = {}) {
    const targets = [];
    const dirs = diagonal
      ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.alphaAt(x, y) !== 0) continue;
        if (dirs.some(([dx, dy]) => this.alphaAt(x + dx, y + dy) > 0)) targets.push([x, y]);
      }
    }
    for (const [x, y] of targets) this.set(x, y, col);
    return this;
  }

  /** Podmiana konkretnego koloru — podstawa wariantów goblinów. */
  replaceColor(from, to) {
    const [fr, fg, fb] = color(from);
    const [tr, tg, tb, ta] = color(to);
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      if (d[i] === fr && d[i + 1] === fg && d[i + 2] === fb) {
        d[i] = tr; d[i + 1] = tg; d[i + 2] = tb; d[i + 3] = ta;
      }
    }
    return this;
  }

  /** Podmiana całej rampy naraz: mapa { '#stary': '#nowy' }. */
  remap(mapping) {
    for (const [from, to] of Object.entries(mapping)) this.replaceColor(from, to);
    return this;
  }
}
