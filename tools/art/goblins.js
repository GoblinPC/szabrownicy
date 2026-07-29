// Postacie graczy: 16x24, sześć wariantów, trzy rysowane kierunki.
//
// Bok rysujemy raz i odbijamy lustrzanie w grze, więc kierunków w atlasie jest
// trzy, a nie cztery. Cała postać składa się z części (głowa, tułów, ręce, nogi)
// ustawianych według pozy — dzięki temu szósty wariant kosztuje kilka linii
// opisu kolorów, a nie osobny rysunek każdej klatki.
//
// Pionowy układ sprite'a:
//   0-5    zapas na nakrycie głowy (grzebień hełmu sięga 4 piksele nad czaszkę,
//          a podskok w biegu podnosi ją o kolejny — stąd aż sześć wierszy luzu)
//   6-14   głowa
//   15-21  tułów, pas w wierszu 19
//   21-24  nogi
//   25-26  buty
//
// Nogi celowo nie reagują na `bodyY`: tułów i głowa kołyszą się przy oddechu
// i biegu, ale stopy zostają na ziemi, tak jak powinny.

import { Canvas } from './canvas.js';
import { c } from './palette.js';

const W = 16;
const H = 27;
const OUTLINE = c('soot', 0);

/** [ciemny, średni, jasny] — każda część ciała używa tej trójki. */
const shades = (ramp, [a, b, d]) => [c(ramp, a), c(ramp, b), c(ramp, d)];

// Na razie jedna postać. Próba zrobienia ludzkich sylwetek pokazała, że goblin
// jest jedyną, która naprawdę wyszła — reszta wyglądała jak prostokąty sklejone
// razem. Wybór wyglądu wróci, gdy będzie po co: przy ekwipunku, który widać
// na postaci. Do tego czasu nie ma sensu utrzymywać sześciu wariantów.
export const VARIANTS = [
  {
    id: 0, name: 'Szabrownik',
    skin: shades('goblin', [1, 2, 3]),
    cloth: shades('wood', [1, 2, 3]),
    belt: c('copper'), boot: c('wood', 1),
    head: 'none', beard: false,
  },
];

// --- Pozy ---------------------------------------------------------------------

/**
 * Poza dla danej klatki. W widoku z przodu i tyłu nogi unoszą się w pionie,
 * z boku przesuwają w przód i w tył — inaczej bieg wyglądałby jak dreptanie.
 */
function pose(kind, frame, side) {
  if (kind === 'idle') {
    // Ledwie zauważalny oddech: co drugą klatkę tułów opada o piksel.
    const breath = frame === 1 ? 1 : 0;
    return { bodyY: breath, legA: 0, legB: 0, armA: breath, armB: breath, lift: 0 };
  }
  const p = (frame / 6) * Math.PI * 2;
  const swing = (phase) => Math.round(Math.sin(phase) * 2);
  return {
    bodyY: Math.abs(Math.sin(p * 2)) > 0.7 ? -1 : 0, // podskok w połowie kroku
    legA: swing(p),
    legB: swing(p + Math.PI),
    armA: swing(p + Math.PI),
    armB: swing(p),
    lift: side ? 0 : 1,
  };
}

// --- Części ciała -------------------------------------------------------------

/** Ramka czaszki. Z profilu jest węższa, bo nos wychodzi poza nią osobno. */
const headBox = (dir) => (dir === 'side' ? { x: 3, w: 9 } : { x: 3, w: 10 });

function drawLegs(t, v, dir, p) {
  const [dark, mid] = v.skin;
  const side = dir === 'side';

  const leg = (x, offset) => {
    const dx = side ? offset : 0;
    const dy = side ? 0 : Math.max(0, -offset) * p.lift;
    t.rect(x + dx, 21 - dy, 3, 4, mid);
    t.vline(x + dx, 21 - dy, 24 - dy, dark);
    t.rect(x + dx - 1, 25 - dy, 4, 2, v.boot);
    t.hline(x + dx - 1, x + dx + 2, 26 - dy, c('soot', 0));
  };

  if (side) {
    leg(7, p.legB); // noga dalsza — rysowana pierwsza, żeby bliższa ją przykryła
    leg(6, p.legA);
  } else {
    leg(5, p.legA);
    leg(9, p.legB);
  }
}

function drawTorso(t, v, dir, p) {
  const [dark, mid, light] = v.cloth;
  const y = 15 + p.bodyY;
  const narrow = dir === 'side';
  const x = narrow ? 5 : 4;
  const w = narrow ? 7 : 9;

  t.rect(x, y, w, 7, mid);
  t.rect(x, y, w, 1, light);          // światło na barkach
  t.hline(x, x + w - 1, y + 6, dark); // cień pod pasem
  t.rect(x - 1, y + 1, w + 2, 2, mid); // ramiona
  t.hline(x - 1, x + w, y + 1, light);

  t.rect(x, y + 4, w, 1, v.belt);     // pas
  t.px(x + Math.floor(w / 2), y + 4, c('iron', 4)); // klamra

  if (dir === 'up') t.rect(x + 1, y + 2, w - 2, 2, dark); // troki na plecach
}

/** Pojedyncza ręka. Rysowana osobno, bo z boku jedna jest za tułowiem, a druga przed. */
function drawArm(t, v, x, offset, p) {
  const [skinDark, skinMid] = v.skin;
  const [clothDark, clothMid] = v.cloth;
  const y = 16 + p.bodyY + Math.round(offset / 2);
  t.rect(x, y, 2, 3, clothMid);
  t.hline(x, x + 1, y, clothDark);
  t.rect(x, y + 3, 2, 2, skinMid); // dłoń
  t.hline(x, x + 1, y + 4, skinDark);
}

/** Uszy w widoku z przodu i z tyłu — po jednym z każdej strony czaszki. */
function drawFrontEars(t, v, x0, x1, y) {
  const [dark, mid, light] = v.skin;
  const ear = (x, sign) => {
    t.px(x, y + 2, mid);
    t.px(x - sign, y + 1, mid);
    t.px(x - sign, y + 2, light);
    t.px(x - sign * 2, y, mid);
    t.px(x - sign * 2, y + 1, dark);
    t.px(x - sign * 3, y - 1, dark);
  };
  ear(x0, 1);
  ear(x1, -1);
}

/**
 * Obrys czaszki z profilu (postać patrzy w prawo): zaokrąglony tył głowy,
 * pochyłe czoło, wyraźnie wysunięty nos w wierszu 5 i cofnięta broda.
 *
 * To jest sedno poprawki — wcześniej profil używał tej samej symetrycznej
 * czaszki co widok z przodu, więc czytał się jak twarz z jednym okiem.
 */
const PROFILE_SPANS = [
  [5, 9],
  [4, 10],
  [3, 11],
  [3, 11],
  [3, 12],
  [3, 14], // nos
  [3, 12],
  [3, 10],
  [4, 8],  // broda
];

function drawProfileHead(t, v, p) {
  const [dark, mid, light] = v.skin;
  const y = 6 + p.bodyY;

  // Ucho siedzi przy tyle czaszki i odchyla się w tył — z profilu nigdy z boku twarzy.
  t.px(1, y + 2, mid); t.px(2, y + 2, light);
  t.px(0, y + 3, dark); t.px(1, y + 3, mid); t.px(2, y + 3, light);
  t.px(2, y + 4, mid);

  PROFILE_SPANS.forEach(([a, b], row) => {
    for (let x = a; x <= b; x++) {
      let col = mid;
      if (row <= 1) col = light;                                   // ciemię
      else if (row >= 7) col = dark;                               // żuchwa
      else if (row === 5 && x >= 12) col = x >= 14 ? mid : light;  // grzbiet nosa
      else if (row === 6 && x >= 11) col = dark;                   // spód nosa
      else if (x <= 5 && row <= 3) col = light;                    // czoło
      t.px(x, y + row, col);
    }
  });

  if (v.beard) {
    t.rect(4, y + 7, 7, 2, c('stone', 2));
    t.hline(4, 9, y + 8, c('stone', 1));
    t.px(3, y + 8, c('stone', 1));
  }

  t.hline(8, 11, y + 3, dark);            // brew
  t.rect(9, y + 4, 2, 2, c('parchment')); // oko tuż za nasadą nosa
  t.px(10, y + 4, c('soot', 0));
  t.px(12, y + 6, c('soot', 0));          // nozdrze
  t.hline(8, 10, y + 7, c('soot', 1));    // usta
  t.px(10, y + 7, c('bone'));             // kieł wystający do przodu
}

function drawHead(t, v, dir, p) {
  if (dir === 'side') return drawProfileHead(t, v, p);

  const [dark, mid, light] = v.skin;
  const y = 6 + p.bodyY;
  const { x, w } = headBox(dir);

  drawFrontEars(t, v, x, x + w - 1, y + 3);

  // Czaszka: ścięte narożniki dają wrażenie zaokrąglenia bez antyaliasingu.
  t.rect(x, y, w, 9, mid);
  t.hline(x + 1, x + w - 2, y, light);
  t.rect(x + 1, y + 1, w - 2, 2, light);
  t.px(x, y, null); t.px(x + w - 1, y, null);
  t.px(x, y + 8, null); t.px(x + w - 1, y + 8, null);
  t.hline(x + 1, x + w - 2, y + 8, dark);

  if (dir === 'up') {
    // Tył głowy — bez twarzy, tylko cieniowanie i kark.
    t.rect(x + 1, y + 4, w - 2, 4, mid);
    t.hline(x + 2, x + w - 3, y + 7, dark);
    return;
  }

  t.hline(x + 1, x + 4, y + 4, dark);      // brwi
  t.hline(x + 5, x + 8, y + 4, dark);
  t.rect(x + 1, y + 5, 2, 2, c('parchment'));
  t.rect(x + 7, y + 5, 2, 2, c('parchment'));
  t.px(x + 2, y + 6, c('soot', 0));
  t.px(x + 7, y + 6, c('soot', 0));
  t.rect(x + 4, y + 5, 2, 3, dark);        // nos
  t.px(x + 4, y + 6, mid);
  t.hline(x + 3, x + 6, y + 8, c('soot', 1)); // usta
  t.px(x + 3, y + 8, c('bone'));           // kieł
  if (v.beard) {
    t.rect(x + 1, y + 8, 8, 2, c('stone', 2));
    t.hline(x + 2, x + 7, y + 9, c('stone', 1));
    t.px(x + 1, y + 9, c('stone', 1));
  }
}

function drawHeadgear(t, v, dir, p) {
  const y = 6 + p.bodyY;
  const { x, w } = headBox(dir);

  if (v.head === 'helmet') {
    t.rect(x - 1, y - 2, w + 2, 4, c('iron', 2));
    t.hline(x, x + w - 1, y - 2, c('iron', 3));
    t.hline(x - 1, x + w, y + 1, c('iron', 1));
    t.rect(x + Math.floor(w / 2) - 1, y - 4, 2, 3, c('iron', 3)); // grzebień
    if (dir !== 'up') t.hline(x + 1, x + w - 2, y + 2, c('iron', 0)); // nakarczek
  } else if (v.head === 'hood') {
    // Chłodny granat zamiast sadzy — inaczej kaptur zlewał się z szarą skórą
    // w jedną brunatną plamę i wariant tracił sylwetkę.
    t.rect(x - 1, y - 2, w + 2, 6, c('night', 2));
    t.hline(x, x + w - 1, y - 2, c('night', 3));
    t.rect(x - 1, y + 2, 2, 4, c('night', 2)); // opadające poły
    t.rect(x + w - 1, y + 2, 2, 4, c('night', 2));
    if (dir !== 'up') t.hline(x + 1, x + w - 2, y + 3, c('night', 1)); // cień okapu
  } else if (v.head === 'cap') {
    t.rect(x, y - 2, w, 3, c('blood'));
    t.hline(x + 1, x + w - 2, y - 2, '#c2455a');
    t.hline(x - 1, x + w, y + 1, '#5c1622');
    t.px(x + w, y - 1, c('blood')); // opadający czubek
    t.px(x + w + 1, y, c('blood'));
  }
}

// --- Składanie klatki ---------------------------------------------------------

function drawFrame(variant, dir, kind, frame) {
  const t = new Canvas(W, H);
  const p = pose(kind, frame, dir === 'side');

  drawLegs(t, variant, dir, p);
  if (dir === 'side') {
    // Kolejność ma znaczenie: dalsza ręka chowa się za tułowiem, bliższa idzie na wierzch.
    drawArm(t, variant, 4, p.armA, p);
    drawTorso(t, variant, dir, p);
    drawHead(t, variant, dir, p);
    drawArm(t, variant, 9, p.armB, p);
  } else {
    drawTorso(t, variant, dir, p);
    drawHead(t, variant, dir, p);
    drawArm(t, variant, 2, p.armA, p);
    drawArm(t, variant, 12, p.armB, p);
  }
  drawHeadgear(t, variant, dir, p);

  return t.outline(OUTLINE);
}

export const DIRECTIONS = ['down', 'up', 'side'];
export const IDLE_FRAMES = 2;
export const RUN_FRAMES = 6;

export function buildGoblins() {
  const entries = [];
  for (const variant of VARIANTS) {
    for (const dir of DIRECTIONS) {
      for (let f = 0; f < IDLE_FRAMES; f++) {
        entries.push({ name: `g${variant.id}_${dir}_idle${f}`, canvas: drawFrame(variant, dir, 'idle', f) });
      }
      for (let f = 0; f < RUN_FRAMES; f++) {
        entries.push({ name: `g${variant.id}_${dir}_run${f}`, canvas: drawFrame(variant, dir, 'run', f) });
      }
    }
  }
  return entries;
}
