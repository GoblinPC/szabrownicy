// Postacie ludzkie: 16x27, trzy rysowane kierunki, budowa warstwowa.
//
// Warstwy są osobne od pierwszej linijki, bo gracz zaczyna w samych majtkach
// i ubiera się w trakcie gry. Gdyby wypalać gotowe kombinacje, każdy nowy
// element garderoby mnożyłby liczbę klatek przez wszystkie pozostałe. Warstwy
// się dodają, nie mnożą.
//
// CZTERY STYLE to cztery różne szkoły rysowania, nie cztery rozmiary tej samej
// postaci. Różnią się przede wszystkim **obrysem**, bo to on decyduje, czy
// sprite czyta się jak amatorski, czy nie:
//
//   hard      — ciemny obrys dookoła. Maksymalna czytelność, sznyt kreskówki.
//   none      — bez obrysu, miękkie cieniowanie. Lekkie, ale gubi się na tle.
//   selective — obrys tylko od strony cienia, od światła jaśniejsza obwódka.
//   twotone   — mocny obrys i tylko dwa tony wypełnienia, bez twarzy.
//
// Druga zasada, której wcześniej nie było: postać musi być **jaśniejsza
// i bardziej nasycona niż tło**. Świat jest ciemnobrązowy, więc brązowa postać
// z brązowym obrysem zlewała się w jedną plamę.
//
// Wspólne pułapki:
//   - nogi nie reagują na `bodyY`: tułów się kołysze, stopy stoją na ziemi,
//   - widok z boku ma własną sylwetkę czaszki, z nosem poza obrysem,
//   - nad czaszką zostaje zapas na włosy i na podskok w biegu.

import { Canvas, mix } from './canvas.js';
import { c } from './palette.js';

const W = 16;
const H = 27;

const shades = (ramp, [a, b, d]) => [c(ramp, a), c(ramp, b), c(ramp, d)];

/**
 * Cieniowanie z przesunięciem barwy: cień idzie w chłód, światło w ciepło.
 * Samo przyciemnianie i rozjaśnianie daje martwe, szare przejścia.
 */
function toned(ramp, [a, b, d], amount = 1) {
  return [
    mix(c(ramp, a), c('night', 1), 0.3 * amount),
    c(ramp, b),
    mix(c(ramp, d), c('ember', 4), 0.22 * amount),
  ];
}

// --- Cztery szkoły ------------------------------------------------------------

export const STYLES = [
  {
    // Bajkowo, słodko. Wielka głowa, wielkie oczy, twardy czarny obrys, płaskie
    // nasycone kolory. Tak wyglądają Stardew Valley i Zelda z Game Boya.
    id: 'bajka', name: 'Bajkowy',
    opis: 'wielka glowa, wielkie oczy',
    outline: 'hard', shading: 'flat', face: 'bold',
    headW: 10, headH: 10, headY: 3,
    torsoW: 9, torsoY: 14, torsoH: 6,
    legY: 20, legW: 3, legGap: 2, footW: 4, armW: 2, armX: 2,
  },
  {
    // Komiksowo, przerysowany bohater: mała głowa, ogromne bary i buciory.
    // Tak rysowano postacie w bijatykach z automatów.
    id: 'heros', name: 'Heros',
    opis: 'male leb, ogromne bary',
    outline: 'hard', shading: 'flat', face: 'fine',
    headW: 6, headH: 6, headY: 5,
    torsoW: 11, torsoY: 11, torsoH: 8,
    legY: 19, legW: 4, legGap: 1, footW: 6, armW: 3, armX: 0,
  },
  {
    // Klasyka konsolowego RPG: bez obrysu, miękkie cieniowanie z przesunięciem
    // barwy, spokojne proporcje. Najbardziej "dorosły" z całej czwórki.
    id: 'jrpg', name: 'Konsolowy RPG',
    opis: 'bez obrysu, miekkie cienie',
    outline: 'none', shading: 'soft', face: 'fine',
    headW: 7, headH: 7, headY: 5,
    torsoW: 8, torsoY: 12, torsoH: 7,
    legY: 19, legW: 3, legGap: 2, footW: 4, armW: 2, armX: 2,
  },
  {
    // Mroczne fantasy: postać jako ciemna sylwetka, dwa tony, brak twarzy,
    // tylko świecące oczy. Klimat zamiast detalu.
    id: 'mrok', name: 'Mroczny',
    opis: 'sylwetka, swiecace oczy',
    outline: 'hard', shading: 'twotone', face: 'glow',
    headW: 8, headH: 8, headY: 5,
    torsoW: 10, torsoY: 13, torsoH: 7,
    legY: 20, legW: 4, legGap: 1, footW: 5, armW: 2, armX: 1,
  },
];

// --- Wygląd -------------------------------------------------------------------

export const SKINS = [
  { id: 0, name: 'jasna', ramp: 'skinA', shades: [1, 3, 4] },
  { id: 1, name: 'ciemna', ramp: 'skinB', shades: [1, 3, 4] },
];

export const HAIRS = [
  { id: 0, name: 'lysy', kind: 'none' },
  { id: 1, name: 'wlosy', kind: 'short' },
];

export const TOPS = [
  { id: 0, name: 'nagi tors', kind: 'none' },
  // Zieleń i błękit zamiast kolejnego brązu — postać ma odcinać się od świata,
  // który cały jest w sadzy, kamieniu i drewnie.
  { id: 1, name: 'koszula', kind: 'shirt', ramp: 'foliage', shades: [1, 3, 4] },
];

export const BOTTOMS = [
  { id: 0, name: 'majtki', kind: 'briefs', ramp: 'stone', shades: [2, 4, 4] },
  { id: 1, name: 'spodnie', kind: 'trousers', ramp: 'night', shades: [1, 3, 4] },
];

const HAIR_COLORS = [shades('soot', [0, 2, 3]), shades('wood', [1, 3, 4])];

// --- Pozy ---------------------------------------------------------------------

function pose(kind, frame, side) {
  if (kind === 'idle') {
    const breath = frame === 1 ? 1 : 0;
    return { bodyY: breath, legA: 0, legB: 0, armA: breath, armB: breath, lift: 0 };
  }
  const p = (frame / 6) * Math.PI * 2;
  const reach = side ? 3 : 2;
  const swing = (phase) => Math.round(Math.sin(phase) * reach);
  return {
    bodyY: Math.abs(Math.sin(p * 2)) > 0.7 ? -1 : 0,
    legA: swing(p),
    legB: swing(p + Math.PI),
    armA: swing(p + Math.PI),
    armB: swing(p),
    lift: side ? 0 : 1,
  };
}

// --- Pomocnicze ---------------------------------------------------------------

const headBox = (s, dir) => {
  const w = dir === 'side' ? s.headW - 1 : s.headW;
  return { x: Math.floor((W - w) / 2), w };
};

const torsoBox = (s, dir) => {
  const w = dir === 'side' ? s.torsoW - 2 : s.torsoW;
  return { x: Math.floor((W - w) / 2), w };
};

/** Trójka kolorów danej części, już po uwzględnieniu szkoły cieniowania. */
function palette(style, ramp, list) {
  if (style.shading === 'soft') return toned(ramp, list);
  if (style.shading === 'twotone') {
    // Dwa tony, oba przyciemnione w stronę nocy — postać ma być ciemną sylwetką,
    // a nie jasną figurką. Trzeci ton celowo równy średniemu: bez półcieni.
    const base = mix(c(ramp, list[1]), c('night', 0), 0.45);
    const dark = mix(c(ramp, list[0]), c('night', 0), 0.6);
    return [dark, base, base];
  }
  return shades(ramp, list);
}

/**
 * Obrys wybiórczy: od dołu i od prawej (czyli od strony cienia) ciemna kreska,
 * od góry i lewej — jaśniejsza. Daje czytelność obrysu bez jego ciężaru.
 */
function selectiveOutline(t, darkCol, lightCol) {
  const marks = [];
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      if (t.alphaAt(x, y) !== 0) continue;
      const up = t.alphaAt(x, y - 1) > 0;
      const left = t.alphaAt(x - 1, y) > 0;
      const down = t.alphaAt(x, y + 1) > 0;
      const right = t.alphaAt(x + 1, y) > 0;
      if (!(up || left || down || right)) continue;
      marks.push([x, y, down || right ? darkCol : lightCol]);
    }
  }
  for (const [x, y, col] of marks) t.set(x, y, col);
  return t;
}

// --- Warstwa: ciało -----------------------------------------------------------

function drawLegs(t, s, skin, dir, p) {
  const [dark, mid, light] = skin;
  const side = dir === 'side';
  const centre = W / 2;

  const leg = (x, offset, near) => {
    const dx = side ? offset : 0;
    const dy = side ? 0 : Math.max(0, -offset) * p.lift;
    const top = s.legY - dy;
    t.rect(x + dx, top, s.legW, 25 - top, near ? mid : dark);
    if (near && s.legW > 2) t.vline(x + dx, top, 24 - dy, light);
    // Stopa.
    t.rect(x + dx - Math.floor((s.footW - s.legW) / 2), 25 - dy, s.footW, 2, near ? mid : dark);
  };

  const half = s.legGap / 2;
  if (side) {
    leg(Math.round(centre - s.legW / 2) + 1, p.legB, false);
    leg(Math.round(centre - s.legW / 2), p.legA, true);
  } else {
    leg(Math.round(centre - half - s.legW), p.legA, true);
    leg(Math.round(centre + half), p.legB, true);
  }
}

function drawTorso(t, s, skin, dir, p) {
  const [dark, mid, light] = skin;
  const y = s.torsoY + p.bodyY;
  const { x, w } = torsoBox(s, dir);

  t.rect(x, y, w, s.torsoH, mid);
  if (s.shading === 'twotone') {
    t.vline(x + w - 1, y, y + s.torsoH - 1, dark);
    return;
  }

  // Światło z lewego górnego rogu, cień o zmiennej szerokości po prawej.
  t.hline(x, x + w - 3, y, light);
  t.vline(x, y, y + s.torsoH - 3, light);
  t.vline(x + w - 1, y + 1, y + s.torsoH - 1, dark);
  t.hline(x + w - 3, x + w - 1, y + s.torsoH - 1, dark);

  if (s.shading === 'soft' && dir === 'down') {
    t.px(x + 1, y + 3, dark);
    t.px(x + w - 2, y + 3, dark);
  }
}

function drawArm(t, s, skin, x, offset, p, near) {
  const [dark, mid] = skin;
  const y = s.torsoY + 1 + p.bodyY + Math.round(offset / 2);
  const len = s.torsoH - 1;
  t.rect(x, y, s.armW, len, near ? mid : dark);
}

/** Sylwetka czaszki z profilu — liczona od środka sprite'a, tak jak tułów. */
function profileSpans(s) {
  const { x, w } = headBox(s, 'side');
  const spans = [];
  for (let row = 0; row < s.headH; row++) {
    const k = row / (s.headH - 1);
    let a = x;
    let b = x + w - 1;
    if (row === 0) { a += 1; b -= 1; }
    if (k >= 0.78) a += 1;
    if (row === s.headH - 1) { a += 1; b -= 1; }
    if (k > 0.42 && k < 0.62) b += 1;   // nos, jeden piksel
    spans.push([a, b]);
  }
  return spans;
}

function drawProfileHead(t, s, skin, p) {
  const [dark, mid, light] = skin;
  const y = s.headY + p.bodyY;
  const spans = profileSpans(s);
  const noseRow = spans.findIndex((span, i) => i > 0 && span[1] > spans[i - 1][1]);

  spans.forEach(([a, b], row) => {
    for (let x = a; x <= b; x++) {
      let col = mid;
      if (s.shading !== 'twotone') {
        if (row === 0 || (row <= 2 && x >= b - 2)) col = light;
        else if (row >= spans.length - 2 || x === a) col = dark;
      } else if (x === a) col = dark;
      t.px(x, y + row, col);
    }
  });

  if (s.face === 'none') return;
  const face = spans[noseRow][1];
  if (s.face === 'glow') {
    t.px(face - 2, y + noseRow - 1, c('ember', 4));
    t.px(face - 2, y + noseRow, c('ember', 2));
    return;
  }
  t.px(face - 2, y + noseRow - 1, c('soot', 0));                    // oko
  if (s.face === 'fine') {
    t.px(face, y + noseRow + 1, dark);                             // nozdrze
    t.hline(face - 3, face - 1, y + s.headH - 2, dark);            // usta
  }
}

function drawHead(t, s, skin, dir, p) {
  if (dir === 'side') return drawProfileHead(t, s, skin, p);

  const [dark, mid, light] = skin;
  const y = s.headY + p.bodyY;
  const { x, w } = headBox(s, dir);
  const h = s.headH;

  t.rect(x, y, w, h, mid);
  t.px(x, y, null); t.px(x + w - 1, y, null);                 // ścięte narożniki
  t.px(x, y + h - 1, null); t.px(x + w - 1, y + h - 1, null);

  if (s.shading === 'twotone') {
    t.vline(x + w - 1, y + 1, y + h - 2, dark);
  } else {
    t.rect(x + 1, y + 1, w - 3, 2, light);                    // czoło w świetle
    t.vline(x + w - 1, y + 1, y + h - 2, dark);
    t.hline(x + 2, x + w - 2, y + h - 1, dark);               // cień pod szczęką
  }

  if (dir === 'up' || s.face === 'none') return;

  // Oczy: w połowie wysokości czaszki, zgodnie z regułą anatomii.
  const eyeY = y + Math.round(h * 0.5);
  if (s.face === 'glow') {
    // Mroczna sylwetka: z całej twarzy zostają dwa świecące punkty.
    t.px(x + 2, eyeY, c('ember', 4));
    t.px(x + w - 3, eyeY, c('ember', 4));
    t.px(x + 2, eyeY + 1, c('ember', 2));
    t.px(x + w - 3, eyeY + 1, c('ember', 2));
  } else if (s.face === 'bold') {
    // Duże oczy w stylu kreskówkowym — czytelne nawet z daleka.
    t.rect(x + 2, eyeY, 2, 2, c('parchment'));
    t.rect(x + w - 4, eyeY, 2, 2, c('parchment'));
    t.px(x + 2, eyeY + 1, c('soot', 0));
    t.px(x + w - 3, eyeY + 1, c('soot', 0));
  } else {
    t.px(x + 2, eyeY, c('soot', 0));
    t.px(x + w - 3, eyeY, c('soot', 0));
    t.hline(x + 3, x + w - 4, y + h - 2, dark);               // usta
  }
}

// --- Warstwa: włosy -----------------------------------------------------------

function drawHair(t, s, hair, colors, dir, p) {
  if (hair.kind === 'none') return;
  const [dark, mid, light] = colors;
  const y = s.headY + p.bodyY;

  if (dir === 'side') {
    const spans = profileSpans(s);
    const rows = Math.max(2, Math.round(s.headH * 0.45));
    for (let row = 0; row < rows; row++) {
      const [a, b] = spans[row];
      t.hline(a, row === 0 ? b : b - 1, y + row, row === 0 ? light : mid);
      t.px(a, y + row, dark);
    }
    t.hline(spans[0][0] + 1, spans[0][1] - 1, y - 1, mid);
    t.vline(spans[rows][0], y + rows, y + rows + 1, mid);
    return;
  }

  const { x, w } = headBox(s, dir);

  if (dir === 'up') {
    const rows = Math.round(s.headH * 0.72);
    t.rect(x, y, w, rows, mid);
    t.hline(x + 1, x + w - 2, y - 1, mid);
    t.hline(x + 2, x + w - 3, y - 1, light);
    t.px(x, y, null); t.px(x + w - 1, y, null);
    t.vline(x + w - 1, y + 1, y + rows - 1, dark);
    return;
  }

  const cap = Math.max(2, Math.round(s.headH * 0.36));
  t.rect(x, y, w, cap, mid);
  t.hline(x + 1, x + w - 2, y - 1, mid);
  t.hline(x + 2, x + w - 3, y - 1, light);
  t.px(x, y, null); t.px(x + w - 1, y, null);
  t.vline(x + w - 1, y, y + cap, dark);
  // Grzywka opada po skosie — równa linia czyta się jak przycięta miska.
  t.hline(x, x + Math.floor(w / 2) - 1, y + cap, mid);
  t.vline(x, y + 1, y + cap, mid);
}

// --- Warstwa: góra ------------------------------------------------------------

function drawTop(t, s, top, dir, p) {
  if (top.kind === 'none') return;
  const [dark, mid, light] = palette(s, top.ramp, top.shades);
  const y = s.torsoY + p.bodyY;
  const { x, w } = torsoBox(s, dir);

  t.rect(x, y, w, s.torsoH - 1, mid);
  if (s.shading !== 'twotone') {
    t.hline(x, x + w - 3, y, light);
    t.vline(x + w - 1, y + 1, y + s.torsoH - 2, dark);
  } else {
    t.vline(x + w - 1, y, y + s.torsoH - 2, dark);
  }
  t.rect(x - 1, y + 1, 1, 2, mid);   // rękawy
  t.rect(x + w, y + 1, 1, 2, mid);
}

// --- Warstwa: dół -------------------------------------------------------------

function drawBottom(t, s, bottom, dir, p) {
  const [dark, mid, light] = palette(s, bottom.ramp, bottom.shades);
  const side = dir === 'side';
  const centre = W / 2;
  const half = s.legGap / 2;
  const hipY = s.torsoY + s.torsoH - 1 + p.bodyY;
  const { x, w } = torsoBox(s, dir);

  t.rect(x + 1, hipY, w - 2, 2, mid);
  if (s.shading !== 'twotone') t.hline(x + 1, x + w - 3, hipY, light);

  if (bottom.kind === 'briefs') return;

  const leg = (lx, offset, near) => {
    const dx = side ? offset : 0;
    const dy = side ? 0 : Math.max(0, -offset) * p.lift;
    const top = s.legY - dy;
    t.rect(lx + dx, top, s.legW, Math.max(2, 25 - top), near ? mid : dark);
    t.rect(lx + dx - Math.floor((s.footW - s.legW) / 2), 25 - dy, s.footW, 2,
      near ? c('wood', 2) : c('wood', 1));
  };

  if (side) {
    leg(Math.round(centre - s.legW / 2) + 1, p.legB, false);
    leg(Math.round(centre - s.legW / 2), p.legA, true);
  } else {
    leg(Math.round(centre - half - s.legW), p.legA, true);
    leg(Math.round(centre + half), p.legB, true);
  }
}

// --- Składanie ----------------------------------------------------------------

export function drawHuman(style, look, dir, kind, frame) {
  const t = new Canvas(W, H);
  const p = pose(kind, frame, dir === 'side');
  const skin = palette(style, look.skin.ramp, look.skin.shades);

  drawLegs(t, style, skin, dir, p);
  drawBottom(t, style, look.bottom, dir, p);

  if (dir === 'side') {
    drawArm(t, style, skin, style.armX + 2, p.armA, p, false);
    drawTorso(t, style, skin, dir, p);
    drawTop(t, style, look.top, dir, p);
    drawHead(t, style, skin, dir, p);
    drawHair(t, style, look.hair, look.hairColor, dir, p);
    drawArm(t, style, skin, W - style.armX - 4, p.armB, p, true);
  } else {
    drawTorso(t, style, skin, dir, p);
    drawTop(t, style, look.top, dir, p);
    drawHead(t, style, skin, dir, p);
    drawHair(t, style, look.hair, look.hairColor, dir, p);
    drawArm(t, style, skin, style.armX, p.armA, p, true);
    drawArm(t, style, skin, W - style.armX - style.armW, p.armB, p, true);
  }

  // Obrys decyduje o charakterze stylu — dlatego jest ostatnim krokiem i różni
  // się między szkołami.
  if (style.outline === 'hard') {
    t.outline(c('soot', 0));
  } else if (style.outline === 'selective') {
    selectiveOutline(t, c('soot', 0), mix(c(look.skin.ramp, 1), c('soot', 0), 0.35));
  }
  return t;
}

export const DIRECTIONS = ['down', 'up', 'side'];

export function defaultLook(skinId = 0, hairId = 1, topId = 0, bottomId = 0, hairColor = 0) {
  return {
    skin: SKINS[skinId],
    hair: HAIRS[hairId],
    top: TOPS[topId],
    bottom: BOTTOMS[bottomId],
    hairColor: HAIR_COLORS[hairColor],
  };
}
