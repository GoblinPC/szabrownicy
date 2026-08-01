// Przedmioty i siatka plecaka.
//
// **Jeden plik, dwie strony**, tak samo jak `movement.js` i `nodes.js`. Klient
// rysuje siatkę i prosi o przełożenie; o tym, czy przedmiot się zmieścił i czy
// w ogóle był, rozstrzyga serwer. Przy grze, w której łupi się innych graczy,
// nie ma innej możliwości — a dwie kopie reguł układania rozjechałyby się przy
// pierwszej zmianie kształtu.
//
// Zasada nadrzędna: **miejsce w plecaku jest zasobem**, nie licznikiem sztuk.
// Dlatego nie ma tu stosów. Cztery kłody to cztery prostokąty do ułożenia, a nie
// liczba przy ikonie — decyzja „co zostawiam" ma zapadać na łupie, przy otwartym
// worku, a nie w tabelce.

/**
 * Rodzaje przedmiotów.
 *
 * `w` i `h` to rozmiar w kratkach przy obrocie 0. Obrót zamienia je miejscami.
 * `icon` to klatka w atlasie `props` — ta sama grafika, z której powstaje rzecz
 * leżąca na ziemi, tylko narysowana pod kratki.
 */
export const ITEMS = {
  // Kłoda leży, więc jest szeroka. Dwie kratki to dużo jak na drewno i tak ma być:
  // po trzech drzewach widać, że plecak się kończy.
  wood: { w: 2, h: 1, icon: 'icon_wood', name: 'kłoda' },
  stone: { w: 1, h: 1, icon: 'icon_stone', name: 'kamień' },
  // Mięso zajmuje jedną kratkę i to jest celowo tanio: głód ma być rozwiązywalny,
  // ale **musisz je najpierw upolować**. Trudność siedzi w zdobyciu, nie w noszeniu.
  // Surowe mięso jest **słabe i tyle**. Zaspokoi głód na chwilę, ale prawdziwą
  // wartość ma dopiero po upieczeniu — to jest cały powód, dla którego warto
  // wracać do ognia zamiast jeść nad trupem dzika.
  meat: { w: 1, h: 1, icon: 'icon_meat', name: 'surowe mięso', food: 20 },
  // Pieczone: ponad dwa razy tyle głodu i **jedyne jedzenie, które leczy**.
  // Życie nie regeneruje się samo, więc pieczeń jest tu realnym zasobem
  // bojowym, a nie ozdobą — i dlatego kosztuje drogę do ognia.
  meat_cooked: {
    w: 1, h: 1, icon: 'icon_meat_cooked', name: 'pieczeń', food: 48, heal: 18,
  },
  // Dzida zajmuje pół plecaka i to jest jej koszt. Nosisz broń albo nosisz łup.
  // `weapon` znaczy „tym się bije", `tool` — „tym się pracuje". Rozdzielone,
  // bo pasek narzędzi pyta o jedno i drugie osobno: dzidą nie zetniesz drzewa,
  // a siekierą owszem — tylko gorzej niż dzidą uderzysz.
  spear: { w: 1, h: 4, icon: 'icon_spear', name: 'dzida', weapon: true },
  // Łańcuch skóry: **surowa jest bezużyteczna**, dopiero wyprawiona do czegoś
  // służy. To jest ta sama zasada, co przy narzędziach — pierwsza zbroja ma być
  // wydarzeniem, a nie znaleziskiem. Zwierzę daje surowiec, warsztat robi z niego
  // materiał, dopiero z materiału powstaje rzecz.
  // **Wyprawianie zmniejsza objętość** i to jest jego druga rola obok tego, że
  // zamienia surowiec w materiał. Surowa skóra jest zwinięta i nieforemna (dwie
  // kratki), wyprawiona to równy płat złożony na pół (jedna).
  //
  // Pierwsza wersja dawała surowej 2×2. Zbroja kosztuje cztery surowe, więc na
  // samym półprodukcie schodziło szesnaście kratek z czterdziestu — zgłoszone
  // z gry od razu. Skóra ma zajmować miejsce, ale nie ma być karą za polowanie.
  hide: { w: 2, h: 1, icon: 'icon_hide', name: 'skóra surowa' },
  leather: { w: 1, h: 1, icon: 'icon_leather', name: 'skóra wyprawiona' },
  // `gear` mówi, **na które gniazdo** rzecz wchodzi; `armor` — ile obrażeń
  // zdejmuje z każdego ciosu. Liczba jest odejmowana, nie mnożona: przy mnożniku
  // zbroja chroni tym lepiej, im mocniej się obrywa, a to jest odwrotnie niż
  // działa skóra. Sześć punktów przy ciosie dzika za czternaście znaczy, że
  // zbroja **zmienia liczbę ciosów do śmierci** — i to jest cała jej rola.
  armor: {
    w: 2, h: 3, icon: 'icon_armor', name: 'zbroja skórzana', gear: 'body', armor: 6,
  },

  // Narzędzia. `tool` to nazwa, po której zasób sprawdza, czy wolno go ruszyć.
  //
  // Zajmują 1×3, czyli tyle co trzy kamienie — noszenie siekiery **i** kilofa to
  // sześć kratek z czterdziestu. To ma być decyzja: idziesz po drewno czy po
  // kamień, a nie „biorę wszystko na wszelki wypadek".
  // Moneta. Jedna kratka, bo pieniądze mają **zajmować miejsce** jak wszystko
  // inne — inaczej złoto jest jedyną rzeczą bez kosztu noszenia i bogaty gracz
  // przestaje cokolwiek wybierać.
  coin: { w: 1, h: 1, icon: 'icon_coin', name: 'moneta', stack: 50 },
  copper_ore: { w: 1, h: 1, icon: 'icon_copper_ore', name: 'ruda miedzi' },
  copper_bar: { w: 1, h: 1, icon: 'icon_copper_bar', name: 'sztaba miedzi' },
  copper_axe: { w: 1, h: 3, icon: 'icon_copper_axe', name: 'miedziana siekiera', tool: 'axe', power: 2 },
  copper_pick: { w: 1, h: 3, icon: 'icon_copper_pick', name: 'miedziany kilof', tool: 'pick', power: 2 },
  axe: { w: 1, h: 3, icon: 'icon_axe', name: 'siekiera', tool: 'axe' },
  pick: { w: 1, h: 3, icon: 'icon_pick', name: 'kilof', tool: 'pick' },
};

/**
 * Wyroby kuźni.
 *
 * Trzymane razem z przedmiotami, bo receptura jest **cechą przedmiotu**, a nie
 * osobnym systemem: „z czego to jest" należy do rzeczy tak samo jak jej rozmiar.
 *
 * Koszt jest niski **celowo**. Pierwsze narzędzie ma być osiągalne po jednym
 * wyjściu za bramę — to nie ono jest treścią, tylko to, co się nim otwiera.
 * Drogie narzędzia startowe zamieniają początek gry w zbieranie po kilka sztuk,
 * a to jest praca, nie gra.
 */
/**
 * Wyroby. `station` mówi, **przy czym** wolno je wykonać.
 *
 * Dwa stanowiska, bo to dwie różne czynności i dwa różne miejsca w karczmie:
 * przy stole się struga i kuje, na stojaku wyprawia skóry. Gdyby wszystko szło
 * przy jednym stole, drugie stanowisko byłoby dekoracją — a stoi tam i widać je.
 */
/**
 * Ceny u karczmarza — **ile daje za sztukę**.
 *
 * Kupuje tylko to, co i tak leży w lesie: surowce i mięso. Narzędzi i zbroi
 * nie skupuje i to jest celowe — inaczej najprostszą droga do złota byłoby
 * produkowanie siekier w kółko, a karczma zamieniłaby się w skup złomu.
 *
 * Stawki są **niskie**. Złoto ma pochodzić z tego, że przynosisz dużo, a nie
 * z tego, że przyniosłeś coś drogiego; inaczej jedna udana wyprawa kończy
 * postęp i nie ma po co wychodzić drugi raz.
 */
export const PRICES = {
  wood: 2,
  copper_ore: 9,
  copper_bar: 25,
  stone: 2,
  hide: 5,
  meat: 3,
  meat_cooked: 7,
  leather: 12,
};

export const RECIPES = [
  { out: 'axe', cost: { wood: 2, stone: 2 }, station: 'workbench' },
  { out: 'pick', cost: { wood: 2, stone: 3 }, station: 'workbench' },
  { out: 'spear', cost: { wood: 3, stone: 1 }, station: 'workbench' },
  // Pieczenie przy garnku. Jeden do jednego, bo to nie jest wytwarzanie —
  // to jest obróbka tego, co już się upolowało.
  { out: 'meat_cooked', cost: { meat: 1 }, station: 'cookpot' },
  // Przetapianie przy palenisku kowala — nie przy garnku z zupą. Ruda idzie
  // w ogień, nie do gotowania.
  { out: 'copper_bar', cost: { copper_ore: 2 }, station: 'hearth' },
  { out: 'copper_axe', cost: { copper_bar: 2, wood: 1 }, station: 'workbench' },
  { out: 'copper_pick', cost: { copper_bar: 2, wood: 1 }, station: 'workbench' },
  // Wyprawianie: dwie surowe skóry na jedną wyprawioną. Stratne celowo — skóra
  // schnie i się kraje, a zbroja ma kosztować kilka polowań, nie jedno.
  { out: 'leather', cost: { hide: 2 }, station: 'tanrack' },
  // Zbroja też na stojaku: to dalej robota rymarska, nie stolarska. Dwie skóry
  // wyprawione, czyli cztery surowe, czyli cztery dziki — pierwsza zbroja ma być
  // **wydarzeniem**, a nie przedmiotem znalezionym po drodze.
  { out: 'armor', cost: { leather: 2 }, station: 'tanrack' },
];

/** Ile sztuk danego rodzaju leży w plecaku. */
export function countOf(bag, kind) {
  let n = 0;
  for (const item of bag.items) if (item.kind === kind) n++;
  return n;
}

/**
 * Moc najlepszego narzędzia danego rodzaju w plecaku.
 *
 * Bierzemy **najlepsze, nie pierwsze z brzegu**: gracz noszący kamienny
 * i miedziany kilof naraz rąbie miedzianym, bo tak by zrobił. Brak narzędzia
 * przy zasobie, który go nie wymaga, to moc 1 — czyli goła ręka przy gałęzi.
 */
export function toolPower(bag, tool) {
  if (!tool) return 1;
  let best = 0;
  for (const item of bag.items) {
    const spec = ITEMS[item.kind];
    if (spec?.tool === tool) best = Math.max(best, spec.power ?? 1);
  }
  return best;
}

/** Czy plecak zawiera narzędzie o danej nazwie. `null` znaczy „nie trzeba nic". */
export function hasTool(bag, tool) {
  if (!tool) return true;
  return bag.items.some((it) => ITEMS[it.kind]?.tool === tool);
}

/**
 * Czy stać nas na wyrób.
 *
 * Sprawdza **wyłącznie składniki**. Miejsca nie liczymy tutaj, bo w chwili
 * zdejmowania składników robi się go więcej — trzy kamienie zwalniają trzy
 * kratki, kilof zajmuje trzy. Za miejsce odpowiada `craft()`, który przy
 * niepowodzeniu oddaje składniki.
 */
export function canCraft(bag, recipe) {
  for (const [kind, n] of Object.entries(recipe.cost)) {
    if (countOf(bag, kind) < n) return false;
  }
  return true;
}

/**
 * Wykonuje wyrób: zabiera składniki, dokłada gotowy przedmiot.
 *
 * Składniki zabieramy **dopiero po sprawdzeniu, że wynik się zmieści** — inaczej
 * przy pełnym plecaku gracz płaci i nie dostaje nic. Zmieści się prawie zawsze,
 * bo trzy kamienie zwalniają więcej miejsca, niż zajmuje kilof; ale „prawie"
 * to za mało, gdy chodzi o zabranie komuś surowców.
 */
export function craft(bag, recipe) {
  for (const [kind, n] of Object.entries(recipe.cost)) {
    if (countOf(bag, kind) < n) return null;
  }

  const zdjęte = [];
  for (const [kind, n] of Object.entries(recipe.cost)) {
    let left = n;
    for (let i = bag.items.length - 1; i >= 0 && left > 0; i--) {
      if (bag.items[i].kind !== kind) continue;
      zdjęte.push(bag.items.splice(i, 1)[0]);
      left--;
    }
  }

  const zrobione = addItem(bag, recipe.out);
  if (!zrobione) {
    // Nie zmieściło się — oddajemy składniki dokładnie tam, gdzie leżały.
    for (const item of zdjęte) bag.items.push(item);
    return null;
  }
  return zrobione;
}

/** Rozmiar plecaka startowego. Rośnie później — pokój w karczmie ma go zwiększać. */
export const BAG_W = 8;
export const BAG_H = 5;

/** Rozmiar przedmiotu po obrocie. `rot` to 0 albo 1 (ćwierć obrotu). */
export function sizeOf(kind, rot = 0) {
  const spec = ITEMS[kind];
  if (!spec) return null;
  return rot ? { w: spec.h, h: spec.w } : { w: spec.w, h: spec.h };
}

/**
 * Czy przedmiot zmieści się w danym miejscu.
 *
 * `ignore` to identyfikator przedmiotu pomijanego przy sprawdzaniu — bez tego
 * przeciąganie rzeczy o jedną kratkę w bok zawsze zderzałoby się z nią samą.
 */
export function fits(bag, kind, rot, x, y, ignore = null) {
  const size = sizeOf(kind, rot);
  if (!size) return false;
  if (x < 0 || y < 0 || x + size.w > bag.w || y + size.h > bag.h) return false;

  for (const item of bag.items) {
    if (item.id === ignore) continue;
    const other = sizeOf(item.kind, item.rot);
    if (!other) continue;
    if (x >= item.x + other.w || item.x >= x + size.w) continue;
    if (y >= item.y + other.h || item.y >= y + size.h) continue;
    return false;
  }
  return true;
}

/**
 * Pierwsze wolne miejsce, w obu obrotach.
 *
 * Szukamy wierszami od góry, bo przedmioty mają się **zbierać przy górnej
 * krawędzi**, a nie rozsypywać po całej siatce. Rozsypane wyglądają jak bałagan,
 * którego gracz nie robił, i po każdym łupie trzeba je układać od nowa.
 *
 * Obrót zerowy sprawdzamy w całości przed obróconym: kłoda ma leżeć poziomo,
 * dopóki jest na to miejsce.
 */
export function findSpot(bag, kind) {
  for (const rot of [0, 1]) {
    const size = sizeOf(kind, rot);
    if (!size) return null;
    // Kwadratowego przedmiotu nie ma sensu sprawdzać dwa razy.
    if (rot === 1 && size.w === size.h) break;
    for (let y = 0; y + size.h <= bag.h; y++) {
      for (let x = 0; x + size.w <= bag.w; x++) {
        if (fits(bag, kind, rot, x, y)) return { x, y, rot };
      }
    }
  }
  return null;
}

/** Pusty plecak. */
export function makeBag(w = BAG_W, h = BAG_H) {
  return { w, h, items: [], nextId: 1 };
}

/** Dokłada przedmiot, jeśli jest miejsce. Zwraca wpis albo `null`. */
export function addItem(bag, kind) {
  if (!ITEMS[kind]) return null;
  const spot = findSpot(bag, kind);
  if (!spot) return null;
  const item = { id: bag.nextId++, kind, x: spot.x, y: spot.y, rot: spot.rot };
  bag.items.push(item);
  return item;
}
