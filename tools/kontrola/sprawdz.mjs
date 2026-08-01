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
  buildWorld, isWalkable, SPAWN, CITY_OX, CITY_OY, CITY_PX, WINDOWS, TILE,
  craftStation, atCraftStation, CRAFT_RANGE,
} from '../../client/src/world/forge.js';
import { FOOT_HALF_W, FOOT_H } from '../../client/src/world/movement.js';
import { buildNodes, nodeKindOf } from '../../client/src/world/nodes.js';
import { ITEMS } from '../../client/src/world/items.js';
import fs from 'node:fs';
import { buildTiles } from '../art/tiles.js';

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

// --- Dach przykrywa cale wnetrze ---------------------------------------------
//
// Dach konczyl sie dwa kafle przed budynkiem i zostawial odkryty caly ostatni
// rzad podlogi — 34 kafle, przez ktore z placu bylo widac wnetrze karczmy.
// Wygladalo to jak waska szpara pod okapem, wiec przez caly czas nikt tego nie
// wzial za blad. Liczba mowi to od razu.

const kryteDachem = new Set(
  w.roof.map((t) => `${Math.floor((t.x - OX) / TILE)},${Math.floor((t.y - OY) / TILE)}`)
);
const odkryte = [];
for (let ty = 0; ty < 36; ty++) {
  for (let tx = 0; tx < 48; tx++) {
    const k = w.tiles[OY / TILE + ty]?.[OX / TILE + tx] ?? '';
    if (!k.startsWith('floor_')) continue;
    // Tylko wnetrze budynku: prog za brama lezy na placu i ma byc odkryty.
    if (ty < 2 || ty > 18 || tx < 5 || tx > 42) continue;
    if (!kryteDachem.has(`${tx},${ty}`)) odkryte.push(`kafel ${tx},${ty} (${k})`);
  }
}
test('dach przykrywa cale wnetrze', odkryte, `${w.roof.length} kafli dachu`);

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

// --- Czy przez dzicz da się przejść ------------------------------------------
//
// Zgłoszone z gry: *zagęszczenie jest takie, że ledwo da się przejść przez mapę*.
// Tego nie widać na podglądzie — las na obrazku zawsze wygląda na las. Widać
// dopiero wtedy, gdy się **przejdzie** po nim tak, jak chodzi gracz: zalewaniem
// po polach przechodnich, z prawdziwą szerokością stóp.
//
// Miara jest jedna i mówi wszystko: ile procent pól otwartego terenu da się
// osiągnąć od bramy. Las gęsty, ale przechodni, ma tę liczbę wysoką; las będący
// ścianą z korytarzykami — niską, choćby wyglądał tak samo.

{
  const S = 4;
  const kl = (x, y) => `${x},${y}`;
  const mapaW = w.tiles[0].length * TILE;
  const mapaH = w.tiles.length * TILE;
  const wolnePole = (x, y) =>
    isWalkable(w, x - FOOT_HALF_W, y - FOOT_H, x + FOOT_HALF_W, y);

  // Start przed bramą południową, czyli tam, gdzie gracz naprawdę wychodzi.
  const brama = { x: SPAWN.x, y: CITY_PX.y + CITY_PX.h + 2 * TILE };
  const start = [Math.round(brama.x / S) * S, Math.round(brama.y / S) * S];

  const widziane = new Set([kl(...start)]);
  const kolejka = [start];
  while (kolejka.length) {
    const [x, y] = kolejka.pop();
    for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < S || ny < S || nx >= mapaW - S || ny >= mapaH - S) continue;
      if (widziane.has(kl(nx, ny))) continue;
      if (!wolnePole(nx, ny)) continue;
      widziane.add(kl(nx, ny)); kolejka.push([nx, ny]);
    }
  }

  // Ile pól w ogóle jest przechodnich — bez tego procent nie znaczy nic.
  let wolnych = 0;
  for (let y = S; y < mapaH - S; y += S) {
    for (let x = S; x < mapaW - S; x += S) if (wolnePole(x, y)) wolnych++;
  }
  const udział = wolnych ? widziane.size / wolnych : 0;

  test('dzicz jest przechodnia od bramy',
    udział >= 0.97 ? []
      : [`od bramy osiągalne ${(udział * 100).toFixed(1)}% otwartego terenu `
        + `(${widziane.size} z ${wolnych} pól) — reszta zamknięta w kieszeniach`],
    `${(udział * 100).toFixed(1)}% terenu osiągalne, ${wolnych} pól otwartych`);

  // Drugi warunek, niezależny od pierwszego: żaden **narożny obszar** nie może
  // być odcięty. Sam procent może być wysoki, a odcięta kieszeń to kawał mapy,
  // do którego nie da się dojść — i właśnie tam mają kiedyś stać punkty
  // orientacyjne.
  //
  // Róg z litej skały **nie jest błędem**: nie ma tam czego osiągać. Pierwsza
  // wersja tego testu meldowała odcięty róg płn-zachodni, a pomiar pokazał zero
  // pól przechodnich na obszarze 192×192 px. Dlatego liczymy oba: ile pól da się
  // przejść i ile z nich osiągnięto. Błędem jest wyłącznie „są pola, żadnego
  // nie osiągnięto".
  const róg = (x0, y0) => {
    let wolneTu = 0; let osiągnięte = 0;
    for (let y = y0; y < y0 + 12 * TILE; y += S) {
      for (let x = x0; x < x0 + 12 * TILE; x += S) {
        if (!wolnePole(x, y)) continue;
        wolneTu++;
        if (widziane.has(kl(Math.round(x / S) * S, Math.round(y / S) * S))) osiągnięte++;
      }
    }
    return { wolneTu, osiągnięte };
  };
  const kraniec = { x: (w.tiles[0].length - 16) * TILE, y: (w.tiles.length - 16) * TILE };
  const ROGI = [
    ['płn-zach', 4 * TILE, 4 * TILE],
    ['płn-wsch', kraniec.x, 4 * TILE],
    ['płd-zach', 4 * TILE, kraniec.y],
    ['płd-wsch', kraniec.x, kraniec.y],
  ];
  test('żaden narożnik nie jest odcięty',
    ROGI.flatMap(([n, x, y]) => {
      const r = róg(x, y);
      if (r.wolneTu === 0) return [];
      return r.osiągnięte === 0 ? [`${n} — ${r.wolneTu} pól przechodnich, żadne nieosiągalne`] : [];
    }),
    ROGI.map(([n, x, y]) => {
      const r = róg(x, y);
      return `${n} ${r.wolneTu === 0 ? 'skała' : `${Math.round(100 * r.osiągnięte / r.wolneTu)}%`}`;
    }).join(', '));
}

// --- Stanowisko rzemieślnicze -----------------------------------------------
//
// Ten test powstał po błędzie, którego nie widać było na żadnym podglądzie:
// serwer trzymał pozycję kowadła **wpisaną liczbą**, wnętrze karczmy
// przebudowano, kowadło pojechało w inne miejsce, a strefa pracy została na
// środku sali wspólnej. Wyglądało to jak „crafting nie działa", bo przy
// stanowisku nie działo się nic, a działało w pustym miejscu, do którego nikt
// nie podchodzi.
//
// Sprawdzamy dwie rzeczy, i obie liczbowo:
//   1. stanowisko w ogóle istnieje w liście obiektów,
//   2. da się przy nim **stanąć** — jest pole przechodnie w zasięgu pracy.
// Sam zasięg dookoła bryły nie wystarczy: strefa mogłaby wypaść w całości
// wewnątrz blatu albo za ścianką i wtedy okno nie otworzyłoby się nigdy.

const stół = craftStation(w);

test('stanowisko rzemieślnicze istnieje',
  stół ? [] : ['brak obiektu `workbench` w liście obiektów'],
  stół ? `warsztat @${lok(stół)}` : '');

if (stół) {
  // Pola z zalewania wyżej: są w układzie miasta i wiadomo o nich, że gracz
  // naprawdę na nie dojdzie od punktu odrodzenia.
  let pól = 0;
  for (const k of osiągalne) {
    const [x, y] = k.split(',').map(Number);
    if (atCraftStation(w, OX + x, OY + y)) pól++;
  }
  test('przy stanowisku da się stanąć',
    pól > 0 ? [] : [`warsztat @${lok(stół)} — zero pól przechodnich w zasięgu ${CRAFT_RANGE} px`],
    `${pól} pól w zasięgu pracy`);
}

// --- Każdy przedmiot ma czym leżeć na ziemi i czym świecić w kratce ----------
//
// Umowa: rzecz o rodzaju `x` ma w atlasie klatkę `item_x` (leżąca w świecie)
// oraz klatkę wskazaną w `icon` (w plecaku, na pasku i w oknie warsztatu).
//
// Test powstał po tym, jak siekiera, kilof i dzida wyrzucone na ziemię **leżały
// niewidzialne**: mapa nazw w kliencie wymieniała trzy rodzaje z sześciu, a brak
// wpisu oznaczał pominięcie rysowania. Serwer o rzeczy wiedział, podpowiedź `E`
// się zapalała, podnieść się dało — tylko nie było czego zobaczyć.

{
  const atlas = JSON.parse(
    fs.readFileSync(new URL('../../client/assets/gen/props.json', import.meta.url), 'utf8')
  );
  const klatki = atlas.frames ?? atlas;

  test('każdy przedmiot ma rysunek na ziemi',
    Object.keys(ITEMS).flatMap((kind) => (klatki[`item_${kind}`] ? [] : [`brak klatki item_${kind}`])),
    `${Object.keys(ITEMS).length} rodzajów`);

  test('każdy przedmiot ma ikonę',
    Object.entries(ITEMS).flatMap(([kind, spec]) => (
      spec.icon && klatki[spec.icon] ? [] : [`${kind}: brak ikony ${spec.icon ?? '(nie podano)'}`]
    )),
    `${Object.keys(ITEMS).length} ikon`);
}

console.log(`\n${błędów === 0 ? 'Wszystko się zgadza.' : `ZNALEZIONO ${błędów} problemów.`}\n`);
process.exit(błędów === 0 ? 0 : 1);
