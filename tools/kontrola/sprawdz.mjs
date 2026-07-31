// Kontrola spójności świata — `npm run sprawdz`.
//
// **Po co to jest.** Prawie każdy błąd, który użytkownik znajdował w grze, był
// tego samego rodzaju: ten sam fakt zapisany w dwóch miejscach, które przestały
// się zgadzać. Palenisko przesunięte, płomień został. Miasto przesunięte,
// dekale zostały. Pochodnia postawiona na oknie. Kowadło w środku sali.
//
// Żadnego z nich nie dało się zobaczyć na podglądzie — wszystkie wyglądały jak
// poprawny obrazek. Widać je dopiero wtedy, gdy się **policzy**, a nie obejrzy.
// Ten plik liczy.
//
// Zasada: każdy test wypisuje albo `ok` z liczbą, albo listę konkretnych
// obiektów z ich współrzędnymi w układzie miasta — takimi, jakie stoją w kodzie,
// żeby dało się je poprawić bez przeliczania.

import {
  buildWorld, isWalkable, SPAWN, CITY_OX, CITY_OY, WINDOWS, TILE,
} from '../../client/src/world/forge.js';
import { FOOT_HALF_W, FOOT_H } from '../../client/src/world/movement.js';
import { buildNodes, nodeKindOf } from '../../client/src/world/nodes.js';

const w = buildWorld();
const OX = CITY_OX * TILE;
const OY = CITY_OY * TILE;

let błędów = 0;
const lok = (p) => `${Math.round(p.x - OX)},${Math.round(p.y - OY)}`;

function test(nazwa, uwagi, podsumowanie) {
  if (uwagi.length === 0) {
    console.log(`  ok    ${nazwa}${podsumowanie ? ` — ${podsumowanie}` : ''}`);
    return;
  }
  błędów += uwagi.length;
  console.log(`  BŁĄD  ${nazwa} (${uwagi.length})`);
  for (const u of uwagi.slice(0, 12)) console.log(`          ${u}`);
  if (uwagi.length > 12) console.log(`          ...i ${uwagi.length - 12} więcej`);
}

console.log('\nKONTROLA ŚWIATA\n');

// --- Ogień, światło i dźwięk trzymają się swoich obiektów --------------------

const palne = w.props.filter((p) => ['hearth', 'campfire', 'torch'].includes(p.key));

test('płomień siedzi na obiekcie, który się pali',
  w.flames.flatMap((f) => {
    const d = Math.min(...palne.map((p) => Math.hypot(p.x - f.x, p.y - f.y)));
    return d > 30 ? [`${f.anim} @${lok(f)} — najbliższy ogień ${Math.round(d)} px`] : [];
  }),
  `${w.flames.length} płomieni`);

test('światło siedzi przy płomieniu',
  w.lights.flatMap((l) => {
    const d = Math.min(...w.flames.map((f) => Math.hypot(l.x - f.x, l.y - f.y)));
    return d > 30 ? [`światło @${lok(l)} — najbliższy płomień ${Math.round(d)} px`] : [];
  }),
  `${w.lights.length} świateł`);

test('każdy palny obiekt ma płomień',
  palne.flatMap((p) => {
    const d = Math.min(...w.flames.map((f) => Math.hypot(p.x - f.x, p.y - f.y)));
    return d > 30 ? [`${p.key} @${lok(p)} nie płonie`] : [];
  }),
  `${palne.length} ognisk`);

// --- Pochodnie wiszą na murze, nie na oknie ---------------------------------

const kafel = (x, y) => w.tiles[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] ?? '';

test('pochodnia wisi na licu muru zwróconym do gracza',
  w.props.filter((p) => p.key === 'torch').flatMap((p) => {
    const k = kafel(p.x, p.y);
    if (k.includes('window')) return [`torch @${lok(p)} stoi na oknie (${k})`];
    if (!k.startsWith('wall_') && k !== 'part_h') return [`torch @${lok(p)} nie stoi na murze (${k})`];
    // Lico widać tylko na ścianie biegnącej wschód-zachód: nad kaflem musi być
    // korona muru, a pod nim podłoga. Na ścianie północ-południe wspornik wygląda,
    // jakby stał na grzbiecie ściany.
    const nad = kafel(p.x, p.y - TILE);
    const pod = kafel(p.x, p.y + TILE);
    const jestMurem = (t) => t.startsWith('wall_') || t.startsWith('part_');
    if (!(jestMurem(nad) || k === 'part_h') || jestMurem(pod)) {
      return [`torch @${lok(p)} nie ma lica (nad: ${nad || '—'}, pod: ${pod || '—'})`];
    }
    return [];
  }),
  'wsporniki wbite w ścianę');

// --- Obiekty nie nachodzą na siebie i nie stoją w ścianie --------------------

const zBryłą = w.props.filter((p) => p.body);
const box = (p) => ({
  x0: p.x - p.body.w / 2, x1: p.x + p.body.w / 2, y0: p.y - p.body.h, y1: p.y,
});

const wHali = zBryłą.filter((p) => p.x > OX + 80 && p.x < OX + 690 && p.y > OY + 40 && p.y < OY + 310);
const nachodzą = [];
for (let i = 0; i < wHali.length; i++) {
  for (let j = i + 1; j < wHali.length; j++) {
    const a = box(wHali[i]); const b = box(wHali[j]);
    if (a.x1 > b.x0 && b.x1 > a.x0 && a.y1 > b.y0 && b.y1 > a.y0) {
      nachodzą.push(`${wHali[i].key} @${lok(wHali[i])} nachodzi na ${wHali[j].key} @${lok(wHali[j])}`);
    }
  }
}
test('obiekty w karczmie nie nachodzą na siebie', nachodzą, `${wHali.length} obiektów`);

test('obiekt nie stoi w ścianie',
  wHali.flatMap((p) => {
    const k = kafel(p.x, p.y);
    return k.startsWith('wall_') || k.startsWith('rock') ? [`${p.key} @${lok(p)} stoi w kaflu ${k}`] : [];
  }),
  'punkty zaczepienia na podłodze');

// --- Przechodniość ----------------------------------------------------------
//
// Liczona **prostokątem stóp**, dokładnie takim jak w fizyce ruchu. Punkt zamiast
// prostokąta dawał zawsze „wolne", bo `isWalkable` porównywało się z `undefined` —
// przez to wszystkie wcześniejsze kontrole były bezwartościowe.

const wolne = (x, y) => isWalkable(w, x - FOOT_HALF_W, y - FOOT_H, x + FOOT_HALF_W, y);
const S = 4;
const klucz = (x, y) => `${x},${y}`;
const sx = Math.round((SPAWN.x - OX) / S) * S;
const sy = Math.round((SPAWN.y - OY) / S) * S;
const osiągalne = new Set([klucz(sx, sy)]);
const kolejka = [[sx, sy]];
while (kolejka.length) {
  const [x, y] = kolejka.pop();
  for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
    const nx = x + dx; const ny = y + dy;
    if (osiągalne.has(klucz(nx, ny))) continue;
    // Zakres obejmuje też kawałek placu za bramą — inaczej kontrola meldowałaby
    // „plac nieosiągalny", choć to tylko granica zalewania.
    if (nx < 60 || nx > 710 || ny < 46 || ny > 420) continue;
    if (!wolne(OX + nx, OY + ny)) continue;
    osiągalne.add(klucz(nx, ny)); kolejka.push([nx, ny]);
  }
}
const dojdzie = (x, y) => osiągalne.has(klucz(Math.round(x / S) * S, Math.round(y / S) * S));

const MIEJSCA = [
  ['kuźnia: kowadło', 168, 196, true],
  ['kuźnia: palenisko', 168, 140, true],
  ['sala: ognisko', 392, 176, true],
  ['sala: stół', 316, 268, true],
  ['sklep: przed ladą', 580, 160, true],
  ['sklep: ZA ladą', 580, 100, false],
  ['warsztat', 566, 250, true],
  ['schody', 648, 300, true],
  ['plac przed bramą', 384, 340, true],
];
test('każde pomieszczenie osiągalne od punktu odrodzenia',
  MIEJSCA.flatMap(([n, x, y, ma]) => {
    const jest = dojdzie(x, y);
    if (jest === ma) return [];
    return [`${n} (${x},${y}) — ${jest ? 'osiągalne, a nie powinno być' : 'NIEOSIĄGALNE'}`];
  }),
  `${osiągalne.size} pól przechodnich`);

// --- Zasoby ------------------------------------------------------------------

const nodes = buildNodes(w);
let stempel = 0; let rozjazd = 0;
for (const p of w.props) {
  if (!nodeKindOf(p.key)) continue;
  if (p.node !== stempel) rozjazd++;
  stempel++;
}
test('numeracja zasobów zgodna po obu stronach',
  rozjazd || stempel !== nodes.length
    ? [`stempli ${stempel}, wpisów ${nodes.length}, rozjazdów ${rozjazd}`]
    : [],
  `${nodes.length} zasobów`);

// --- Okna --------------------------------------------------------------------

test('okno wypada w kaflu ściany',
  WINDOWS.flatMap((okno, i) => {
    // Otwór okna leży na **licu muru**, czyli dokładnie na granicy kafli. Trzeba
    // więc sprawdzić kafel po obu stronach tej granicy, a nie jeden z nich —
    // pierwsza wersja pytała tylko o jedną stronę i meldowała trawę przy oknach
    // ściany wschodniej, choć okno było w porządku.
    const mx = (okno.a.x + okno.b.x) / 2;
    const my = (okno.a.y + okno.b.y) / 2;
    const wokół = [
      kafel(mx, my), kafel(mx - 2, my), kafel(mx + 2, my),
      kafel(mx, my - 2), kafel(mx, my + 2),
    ];
    return wokół.some((k) => k.includes('window'))
      ? []
      : [`okno ${i} @${Math.round(mx - OX)},${Math.round(my - OY)} — kafle ${wokół.join(' ')}`];
  }),
  `${WINDOWS.length} okien`);

console.log(`\n${błędów === 0 ? 'Wszystko się zgadza.' : `ZNALEZIONO ${błędów} problemów.`}\n`);
process.exit(błędów === 0 ? 0 : 1);
