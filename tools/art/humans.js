// Postacie ludzkie: 16x27, trzy rysowane kierunki, budowa warstwowa.
//
// Warstwy są osobne od pierwszej linijki, bo docelowo gracz zaczyna w samych
// majtkach i ubiera się w trakcie gry. Gdyby wypalać gotowe kombinacje, każdy
// nowy element garderoby mnożyłby liczbę klatek przez liczbę wszystkich
// pozostałych. Warstwy się dodają, nie mnożą: nowa koszula to jeden komplet
// klatek, niezależnie od tego, ile jest karnacji i fryzur.
//
// Cztery style różnią się wyłącznie proporcjami (metryką), a nie kodem rysowania
// — dzięki temu wybór stylu nie przepisuje generatora.
//
// Pionowy układ zależy od stylu, ale zasady są wspólne:
//   - nad czaszką zostaje zapas na włosy i na podskok w biegu,
//   - nogi nie reagują na `bodyY`: tułów się kołysze, stopy stoją na ziemi,
//   - widok z boku ma własną sylwetkę czaszki, z nosem wysuniętym poza obrys.

import { Canvas } from './canvas.js';
import { c } from './palette.js';

const W = 16;
const H = 27;

/** [ciemny, średni, jasny] z jednej rampy. */
const shades = (ramp, [a, b, d]) => [c(ramp, a), c(ramp, b), c(ramp, d)];

// --- Style budowy -------------------------------------------------------------
//
// `headW`/`headH` to czaszka, `torsoW` szerokość barków, `legGap` rozstaw nóg.
// `headY` wynika z reszty: stopy zawsze kończą się na wierszu 26.

export const STYLES = [
  {
    id: 'krzepki', name: 'Krzepki',
    opis: 'dorosle proporcje',
    headW: 8, headH: 8, headY: 5,
    torsoW: 9, torsoY: 13, torsoH: 7,
    legY: 20, legW: 3, legGap: 2, footW: 4,
    armX: 2,
  },
  {
    id: 'krasnal', name: 'Krasnal',
    opis: 'duza glowa',
    headW: 10, headH: 10, headY: 4,
    torsoW: 10, torsoY: 14, torsoH: 7,
    legY: 21, legW: 3, legGap: 3, footW: 4,
    armX: 1,
  },
  {
    id: 'smukly', name: 'Smukły',
    opis: 'wysoki, chudy',
    headW: 7, headH: 7, headY: 5,
    torsoW: 7, torsoY: 12, torsoH: 7,
    legY: 19, legW: 2, legGap: 3, footW: 3,
    armX: 3,
  },
  {
    id: 'krepy', name: 'Krępy',
    opis: 'niski, barczysty',
    headW: 8, headH: 7, headY: 6,
    torsoW: 11, torsoY: 13, torsoH: 7,
    legY: 20, legW: 4, legGap: 1, footW: 5,
    armX: 1,
  },
];

// --- Wygląd -------------------------------------------------------------------

export const SKINS = [
  { id: 0, name: 'jasna', ramp: 'skinA', shades: [1, 3, 4] },
  { id: 1, name: 'ciemna', ramp: 'skinB', shades: [1, 3, 4] },
];

export const HAIRS = [
  { id: 0, name: 'łysy', kind: 'none' },
  { id: 1, name: 'włosy', kind: 'short' },
];

export const TOPS = [
  { id: 0, name: 'nagi tors', kind: 'none' },
  { id: 1, name: 'koszula', kind: 'shirt', ramp: 'wood', shades: [1, 2, 3] },
];

export const BOTTOMS = [
  { id: 0, name: 'majtki', kind: 'briefs', ramp: 'stone', shades: [2, 3, 4] },
  { id: 1, name: 'spodnie', kind: 'trousers', ramp: 'iron', shades: [1, 2, 3] },
];

const HAIR_COLORS = [shades('soot', [0, 1, 2]), shades('wood', [1, 2, 3])];

// --- Pozy ---------------------------------------------------------------------

function pose(kind, frame, side) {
  if (kind === 'idle') {
    const breath = frame === 1 ? 1 : 0;
    return { bodyY: breath, legA: 0, legB: 0, armA: breath, armB: breath, lift: 0 };
  }
  const p = (frame / 6) * Math.PI * 2;
  // Z profilu wymach musi być większy: nogi mijają się w tej samej pionowej osi,
  // więc przy amplitudzie 2 px nakładały się na siebie i bieg stał w miejscu.
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

// --- Warstwa: ciało -----------------------------------------------------------

function drawLegs(t, s, skin, dir, p, { bare }) {
  const [dark, mid, light] = skin;
  const side = dir === 'side';
  const centre = W / 2;

  const leg = (x, offset) => {
    const dx = side ? offset : 0;
    const dy = side ? 0 : Math.max(0, -offset) * p.lift;
    const top = s.legY - dy;
    t.rect(x + dx, top, s.legW, 26 - top - 1, mid);
    t.vline(x + dx, top, 25 - dy, dark);
    if (s.legW > 2) t.vline(x + dx + s.legW - 1, top, 25 - dy, bare ? light : mid);
    // Stopa — bosa u gołego ciała, but dokłada warstwa spodni.
    t.rect(x + dx - Math.floor((s.footW - s.legW) / 2), 25 - dy, s.footW, 2, mid);
    t.hline(x + dx - 1, x + dx + s.footW - 2, 26 - dy, dark);
  };

  const half = s.legGap / 2;
  if (side) {
    leg(Math.round(centre - s.legW / 2) + 1, p.legB);
    leg(Math.round(centre - s.legW / 2), p.legA);
  } else {
    leg(Math.round(centre - half - s.legW), p.legA);
    leg(Math.round(centre + half), p.legB);
  }
}

function drawTorso(t, s, skin, dir, p) {
  const [dark, mid, light] = skin;
  const y = s.torsoY + p.bodyY;
  const { x, w } = torsoBox(s, dir);

  t.rect(x, y, w, s.torsoH, mid);

  // Światło pada z lewego górnego rogu — konsekwentnie w całej postaci.
  t.hline(x, x + w - 2, y, light);
  t.vline(x, y, y + s.torsoH - 3, light);

  // Cień o zmiennej szerokości. Równy pasek 1 px dookoła czytał się jak obwódka
  // koszulki i goły tors wyglądał na ubrany.
  t.vline(x + w - 1, y + 1, y + s.torsoH - 1, dark);
  t.hline(x + w - 3, x + w - 1, y + s.torsoH - 1, dark);
  t.hline(x + 1, x + w - 4, y + s.torsoH - 1, mid);

  if (dir === 'down') {
    // Zarys klatki piersiowej: dwa piksele, nie rysunek anatomiczny.
    t.px(x + 1, y + 3, dark);
    t.px(x + w - 2, y + 3, dark);
  } else if (dir === 'up') {
    // Łopatki — dwa krótkie cienie zamiast jednej kreski kręgosłupa.
    t.vline(x + 2, y + 2, y + 3, dark);
    t.vline(x + w - 3, y + 2, y + 3, dark);
  }
}

function drawArm(t, s, skin, x, offset, p, dir) {
  const [dark, mid] = skin;
  const y = s.torsoY + 1 + p.bodyY + Math.round(offset / 2);
  const len = s.torsoH - 1;
  t.rect(x, y, 2, len, mid);
  t.hline(x, x + 1, y + len - 1, dark);
  if (dir !== 'side') t.vline(x, y, y + len - 1, dark);
}

/**
 * Sylwetka czaszki z profilu (postać patrzy w prawo). Liczona względem środka
 * sprite'a, tak samo jak tułów — wcześniej była przypięta na sztywno do x=4
 * i głowa siedziała obok ciała, przez co nos czytał się jak dziób.
 *
 * Kształt: zaokrąglone ciemię, cofnięty tył czaszki, nos wystający o jeden
 * piksel w połowie wysokości, lekko cofnięta broda.
 */
function profileSpans(s) {
  const { x, w } = headBox(s, 'side');
  const h = s.headH;
  const spans = [];
  for (let row = 0; row < h; row++) {
    const k = row / (h - 1);
    let a = x;
    let b = x + w - 1;
    if (row === 0) { a += 1; b -= 1; }                 // ciemię
    else if (row === 1) { b -= 0; }
    if (k >= 0.75) a += 1;                             // cofnięta żuchwa
    if (row === h - 1) { a += 1; b -= 1; }             // broda
    if (k > 0.42 && k < 0.62) b += 1;                  // nos — jeden piksel, nie dziób
    spans.push([a, b]);
  }
  return spans;
}

function drawProfileHead(t, s, skin, p) {
  const [dark, mid, light] = skin;
  const y = s.headY + p.bodyY;
  const spans = profileSpans(s);
  const noseRow = spans.findIndex((span, i) => i > 0 && span[1] > spans[i - 1][1]);
  const back = spans[Math.floor(spans.length / 2)][0];

  spans.forEach(([a, b], row) => {
    for (let x = a; x <= b; x++) {
      let col = mid;
      if (row === 0) col = light;
      else if (row >= spans.length - 2) col = dark;     // cień pod szczęką
      else if (x === a) col = dark;                     // tył czaszki w cieniu
      else if (row <= 2 && x >= b - 2) col = light;     // czoło łapie światło
      t.px(x, y + row, col);
    }
  });

  // Ucho: przy tyle czaszki, nigdy z boku twarzy.
  const earY = y + Math.round(h(s) * 0.5);
  t.px(back + 1, earY, dark);
  t.px(back + 2, earY, mid);

  // Twarz. Oko tuż za nasadą nosa, usta pod nim.
  const face = spans[noseRow][1];
  t.px(face - 2, y + noseRow - 1, c('soot', 0));
  t.px(face, y + noseRow + 1, dark);                    // nozdrze
  t.hline(face - 3, face - 1, y + s.headH - 2, dark);   // usta
}

/** Wysokość czaszki — osobno, bo używana też przy uchu i włosach. */
const h = (s) => s.headH;

function drawHead(t, s, skin, dir, p) {
  if (dir === 'side') return drawProfileHead(t, s, skin, p);

  const [dark, mid, light] = skin;
  const y = s.headY + p.bodyY;
  const { x, w } = headBox(s, dir);
  const h = s.headH;

  // Uszy.
  t.px(x - 1, y + Math.round(h * 0.45), mid);
  t.px(x + w, y + Math.round(h * 0.45), mid);

  t.rect(x, y, w, h, mid);
  t.rect(x + 1, y + 1, w - 2, 2, light);      // czoło w świetle
  t.px(x, y, null); t.px(x + w - 1, y, null); // ścięte narożniki = zaokrąglenie
  t.px(x, y + h - 1, null); t.px(x + w - 1, y + h - 1, null);
  t.hline(x + 1, x + w - 2, y + h - 1, dark); // cień pod szczęką

  if (dir === 'up') {
    t.rect(x + 1, y + Math.round(h * 0.5), w - 2, Math.floor(h * 0.4), mid);
    t.hline(x + 2, x + w - 3, y + h - 2, dark);
    return;
  }

  const eyeY = y + Math.round(h * 0.45);
  t.px(x + 2, eyeY, c('soot', 0));
  t.px(x + w - 3, eyeY, c('soot', 0));
  t.px(x + Math.floor(w / 2), eyeY + 1, dark);              // nos
  t.hline(x + 3, x + w - 4, y + h - 2, dark);               // usta
}

// --- Warstwa: włosy -----------------------------------------------------------

function drawHair(t, s, hair, colors, dir, p) {
  if (hair.kind === 'none') return;
  const [dark, mid, light] = colors;
  const y = s.headY + p.bodyY;

  if (dir === 'side') {
    const spans = profileSpans(s);
    const skullRows = Math.max(2, Math.round(s.headH * 0.42));
    // Czupryna: pełna na ciemieniu, opada po tyle czaszki, z przodu kończy się
    // grzywką nad czołem — nie zachodzi na twarz.
    for (let row = 0; row < skullRows; row++) {
      const [a, b] = spans[row];
      const to = row === 0 ? b : b - 1;
      t.hline(a, to, y + row, row === 0 ? light : mid);
      t.px(a, y + row, dark);                    // tył czupryny w cieniu
    }
    t.hline(spans[0][0] + 1, spans[0][1] - 1, y - 1, mid);   // objętość nad czaszką
    // Kosmyk opadający na kark.
    t.vline(spans[skullRows][0], y + skullRows, y + skullRows + 1, mid);
    t.px(spans[skullRows][0], y + skullRows + 1, dark);
    return;
  }

  const { x, w } = headBox(s, dir);

  if (dir === 'up') {
    // Z tyłu widać całą czuprynę — zakrywa niemal całą czaszkę.
    const rows = Math.round(s.headH * 0.75);
    t.rect(x, y, w, rows, mid);
    t.hline(x + 1, x + w - 2, y - 1, mid);
    t.hline(x + 2, x + w - 3, y - 1, light);
    t.px(x, y, null); t.px(x + w - 1, y, null);
    t.hline(x + 1, x + w - 2, y + rows - 1, dark);
    t.vline(x, y + 1, y + rows - 2, dark);
    t.vline(x + w - 1, y + 1, y + rows - 2, dark);
    return;
  }

  // Z przodu: czapa włosów plus grzywka opadająca nierówno na czoło.
  const cap = Math.max(2, Math.round(s.headH * 0.34));
  t.rect(x, y, w, cap, mid);
  t.hline(x + 1, x + w - 2, y - 1, mid);
  t.hline(x + 2, x + w - 3, y - 1, light);
  t.px(x, y, null); t.px(x + w - 1, y, null);

  // Grzywka opada po skosie: pełna nad lewą skronią, wyżej nad prawą. Naprzemienne
  // piksele czytały się jak kolce, a równa linia jak przycięta miska.
  t.hline(x, x + Math.floor(w / 2) - 1, y + cap, mid);
  t.px(x + Math.floor(w / 2), y + cap, dark);

  // Baczki wzdłuż skroni, po jednym pikselu niżej niż grzywka.
  t.vline(x, y + 1, y + cap, mid);
  t.vline(x + w - 1, y + 1, y + cap - 1, mid);
}

// --- Warstwa: góra ------------------------------------------------------------

function drawTop(t, s, top, dir, p) {
  if (top.kind === 'none') return;
  const [dark, mid, light] = shades(top.ramp, top.shades);
  const y = s.torsoY + p.bodyY;
  const { x, w } = torsoBox(s, dir);

  t.rect(x, y, w, s.torsoH - 1, mid);
  t.hline(x, x + w - 1, y, light);
  t.hline(x, x + w - 1, y + s.torsoH - 2, dark);
  // Rękawy — dwa piksele na każde ramię, żeby koszula nie kończyła się na barku.
  t.rect(x - 1, y + 1, 1, 2, mid);
  t.rect(x + w, y + 1, 1, 2, mid);
  if (dir === 'down') t.vline(x + Math.floor(w / 2), y + 1, y + s.torsoH - 3, dark); // zapięcie
}

// --- Warstwa: dół -------------------------------------------------------------

function drawBottom(t, s, bottom, dir, p) {
  const [dark, mid, light] = shades(bottom.ramp, bottom.shades);
  const side = dir === 'side';
  const centre = W / 2;
  const half = s.legGap / 2;
  const hipY = s.torsoY + s.torsoH - 1 + p.bodyY;

  // Biodra — wspólne dla majtek i spodni.
  const { x, w } = torsoBox(s, dir);
  t.rect(x + 1, hipY, w - 2, 2, mid);
  t.hline(x + 1, x + w - 2, hipY, light);

  if (bottom.kind === 'briefs') return;

  // Nogawki idą za nogami, więc powtarzamy ich przesunięcia.
  const leg = (lx, offset) => {
    const dx = side ? offset : 0;
    const dy = side ? 0 : Math.max(0, -offset) * p.lift;
    const top = s.legY - dy;
    const len = Math.max(2, 25 - top - 1);
    t.rect(lx + dx, top, s.legW, len, mid);
    t.vline(lx + dx, top, top + len - 1, dark);
    // But.
    t.rect(lx + dx - Math.floor((s.footW - s.legW) / 2), 25 - dy, s.footW, 2, c('wood', 1));
    t.hline(lx + dx - 1, lx + dx + s.footW - 2, 26 - dy, c('wood', 0));
  };

  if (side) {
    leg(Math.round(centre - s.legW / 2) + 1, p.legB);
    leg(Math.round(centre - s.legW / 2), p.legA);
  } else {
    leg(Math.round(centre - half - s.legW), p.legA);
    leg(Math.round(centre + half), p.legB);
  }
}

// --- Składanie ----------------------------------------------------------------

/**
 * Jedna klatka. `look` wybiera warstwy; `only` pozwala wyrenderować pojedynczą
 * warstwę osobno — z tego korzysta wypalanie atlasu warstwowego.
 */
export function drawHuman(style, look, dir, kind, frame) {
  const t = new Canvas(W, H);
  const p = pose(kind, frame, dir === 'side');
  const skin = shades(look.skin.ramp, look.skin.shades);

  drawLegs(t, style, skin, dir, p, { bare: look.bottom.kind === 'briefs' });
  drawBottom(t, style, look.bottom, dir, p);

  if (dir === 'side') {
    drawArm(t, style, skin, style.armX + 2, p.armA, p, dir);
    drawTorso(t, style, skin, dir, p);
    drawTop(t, style, look.top, dir, p);
    drawHead(t, style, skin, dir, p);
    drawHair(t, style, look.hair, look.hairColor, dir, p);
    drawArm(t, style, skin, W - style.armX - 4, p.armB, p, dir);
  } else {
    drawTorso(t, style, skin, dir, p);
    drawTop(t, style, look.top, dir, p);
    drawHead(t, style, skin, dir, p);
    drawHair(t, style, look.hair, look.hairColor, dir, p);
    drawArm(t, style, skin, style.armX, p.armA, p, dir);
    drawArm(t, style, skin, W - style.armX - 2, p.armB, p, dir);
  }

  // Obrys w najciemniejszym odcieniu skóry, nigdy czysta czerń.
  return t.outline(c(look.skin.ramp, 0));
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
