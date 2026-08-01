// Plecak-siatka.
//
// Zwykły HTML nad kanwą, tak samo jak czat, logowanie i suwaki. Przeciąganie,
// trafianie w kratkę i klawiatura działają za darmo, a ikony biorą się z tego
// samego atlasu co reszta grafiki — `props.png` wycinane tłem CSS po ramkach
// z `props.json`, więc ikona w plecaku to **ten sam plik**, z którego powstaje
// świat, a nie osobny komplet obrazków do rozjechania.
//
// **Właścicielem zawartości jest serwer.** Ten plik rysuje i prosi; o tym, czy
// przedmiot się zmieścił, rozstrzyga serwer. Podczas przeciągania pokazujemy
// podgląd u siebie, ale po puszczeniu wysyłamy zamiar i czekamy na migawkę —
// przedmiot przeskakuje na miejsce dopiero wtedy, gdy serwer się zgodzi.
// Dzięki temu nie ma stanu, w którym gracz widzi u siebie coś, czego nie ma.

import { ITEMS, sizeOf, fits } from '../world/items.js';

// Kratka na ekranie. Ikony są rysowane w 16 px, więc trójka daje 48 px i cały
// obrazek zostaje ostry — dwójka była za mała, żeby rozpoznać kłodę od kamienia,
// czwórka nie mieściła plecaka na niższych ekranach.
// Kratka na ekranie. Ikony są rysowane w 16 px, więc trójka daje 48 px i cały
// obrazek zostaje ostry — dwójka była za mała, żeby rozpoznać kłodę od kamienia,
// czwórka nie mieściła plecaka na niższych ekranach.
const CELL = 48;
const ICON_PX = 16;


export function createBackpack({ onMove, onDrop, onEat, onTake, slotAt, onSlot, onGear, onUngear, onChestPut, onChestTake, onSell, onUpgrade }) {
  const box = document.createElement('div');
  box.id = 'backpack';
  box.innerHTML = `
    <div id="bag-wrap">
      <div id="bag-panel">
        <div id="bag-title">plecak</div>
        <div id="bag-body">
          <div id="bag-gear">
            <div class="gear-slot" data-slot="body"><span class="gear-label">zbroja</span><div class="gear-icon"></div></div>
          </div>
          <div id="bag-grid"></div>
        </div>
        <div id="bag-hint"><b>Shift+LPM</b> przerzuć &nbsp;·&nbsp; przeciągnij &nbsp;·&nbsp; <b>PPM</b> obróć &nbsp;·&nbsp; <b>2×LPM</b> zjedz &nbsp;·&nbsp; wyrzuć poza siatkę</div>
      </div>
      <div id="bag-shop" style="display:none">
        <div id="bag-title">karczmarz</div>
        <div id="shop-coins"></div>
        <div id="shop-upgrade"></div>
        <div id="bag-hint">wyciągnij rzecz z plecaka, żeby sprzedać</div>
      </div>
      <div id="bag-sack" style="display:none">
        <div id="bag-title">worek</div>
        <div id="sack-grid"></div>
        <div id="bag-hint"><b>LPM</b> przełóż do siebie</div>
      </div>
    </div>
  `;

  const grid = box.querySelector('#bag-grid');
  const panel = box.querySelector('#bag-panel');
  const gearBox = box.querySelector('#bag-gear');
  const shopBox = box.querySelector('#bag-shop');
  const sackBox = box.querySelector('#bag-sack');
  const sackGrid = box.querySelector('#sack-grid');

  // Zawartość worka, przy którym stoi gracz. `null` znaczy „nie ma przy czym stać".
  let sack = null;
  let chest = null;
  let shop = null;
  // Noszony ekwipunek — co siedzi w gnieździe.
  let gear = { s: -1, b: null };

  let open = false;
  let bag = { w: 0, h: 0, items: [] };
  let seq = -1;
  let frames = null;          // ramki z props.json
  let drag = null;            // { id, kind, rot, dx, dy, ghost }

  /** Rozmiar całego arkusza — bez niego nie da się przeskalować tła. */
  let sheet = { w: 0, h: 0 };

  function cellsOf(kind, rot) {
    return sizeOf(kind, rot) ?? { w: 1, h: 1 };
  }

  /**
   * Wstawia ikonę w pole przedmiotu — **przyciętą do własnej ramki**.
   *
   * Tu siedział błąd zgłoszony z gry: *skóra zajmuje dwa sloty, ale jest w jednym,
   * a w drugim pokazuje pół drewna*. Poprzednia wersja skalowała cały arkusz
   * i nadawała elementowi rozmiar **pola przedmiotu**, zakładając po cichu, że
   * rysunek ikony ma dokładnie te proporcje. Dla kłody się zgadzało (32×16 px
   * przy polu 2×1), dla skóry już nie: ikona ma 16×14, a pole 96×48 — w pozostałej
   * połowie pola widać było sąsiednią ramkę atlasu.
   *
   * Ikona dostaje więc rozmiar swojej ramki i jest **wyśrodkowana w polu**.
   * Skala liczona z obu boków przy obrocie zero, żeby obrócona dzida nie urosła.
   */
  function placeIcon(el, icon, kind, rot) {
    const frame = frames?.[ITEMS[kind]?.icon]?.frame;
    if (!frame || !sheet.w) return;

    const base = cellsOf(kind, 0);
    const pole = cellsOf(kind, rot);
    const scale = Math.min((base.w * CELL) / frame.w, (base.h * CELL) / frame.h);
    const w = Math.round(frame.w * scale);
    const h = Math.round(frame.h * scale);

    icon.style.position = 'absolute';
    icon.style.width = `${w}px`;
    icon.style.height = `${h}px`;
    // Wyśrodkowanie liczone w **polu po obrocie**: obrót idzie wokół środka
    // ikony, więc tylko wtedy trafia w środek pola. Dzida położona na boku
    // uciekała kiedyś o siedemdziesiąt pikseli właśnie z tego powodu.
    icon.style.left = `${Math.round((pole.w * CELL - w) / 2)}px`;
    icon.style.top = `${Math.round((pole.h * CELL - h) / 2)}px`;
    icon.style.backgroundImage = 'url(assets/gen/props.png)';
    icon.style.backgroundRepeat = 'no-repeat';
    icon.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    icon.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
    // Obrót rysunku, nie zamiana ikon: dzida obrócona to ta sama dzida położona
    // na boku. Osobny rysunek na każdy obrót byłby dwa razy większym atlasem.
    icon.style.transform = rot ? 'rotate(90deg)' : '';
    icon.style.transformOrigin = 'center';
    void el;
  }

  function render() {
    grid.style.width = `${bag.w * CELL}px`;
    grid.style.height = `${bag.h * CELL}px`;
    grid.style.backgroundSize = `${CELL}px ${CELL}px`;
    grid.innerHTML = '';

    for (const item of bag.items) {
      const size = cellsOf(item.kind, item.rot);
      const el = document.createElement('div');
      el.className = 'bag-item';
      el.dataset.id = String(item.id);
      el.style.left = `${item.x * CELL}px`;
      el.style.top = `${item.y * CELL}px`;
      el.style.width = `${size.w * CELL}px`;
      el.style.height = `${size.h * CELL}px`;

      const icon = document.createElement('div');
      icon.className = 'bag-icon';
      placeIcon(el, icon, item.kind, item.rot);
      el.appendChild(icon);
      grid.appendChild(el);
    }
  }

  /**
   * Nowy stan z serwera. Odrysowujemy tylko przy zmianie znacznika.
   *
   * Wyroby wyprowadziły się stąd do `ui/craft.js` — okno warsztatu jest osobne
   * i otwiera je podejście do stołu, a nie otwarcie plecaka.
   */
  /**
   * Zawartość worka leżącego obok.
   *
   * **Kupa rzeczy, nie druga siatka.** Worek nie ma kształtów ani obracania:
   * kształty zaczynają się dopiero przy przekładaniu do siebie i wtedy liczy je
   * serwer. Gdyby worek też był siatką, decyzja „co biorę" zamieniłaby się
   * w układankę w cudzym plecaku — a chodzi o wybór, nie o Tetris nad trupem.
   */
  /**
   * Skrzynia idzie **tym samym panelem co worek po trupie**.
   *
   * To nie jest oszczędność, tylko spójność: jedno i drugie jest cudzą kupą
   * rzeczy, z której się bierze, a nie siatką do układania. Gracz uczy się
   * jednego zachowania i działa ono w obu miejscach.
   */
  function applyChest(state) {
    const był = chest ? JSON.stringify(chest) : '';
    chest = state ?? null;
    if (!open) return;
    if (JSON.stringify(chest ?? '') === był) return;
    renderSack();
  }

  /**
   * Panel karczmarza.
   *
   * Pokazuje **stan sakiewki i jedną rzecz do kupienia** — większą skrzynię.
   * Lista towarów przyjdzie później; dziś liczy się to, żeby złoto miało
   * widoczny cel, bo pieniądze bez tego, na co je wydać, nie są celem.
   */
  function applyShop(state) {
    const był = shop ? JSON.stringify(shop) : '';
    shop = state ?? null;
    if (!open) return;
    if (JSON.stringify(shop ?? '') === był) return;
    renderShop();
  }

  function renderShop() {
    shopBox.style.display = shop ? 'block' : 'none';
    if (!shop) return;
    shopBox.querySelector('#shop-coins').textContent = `monety: ${shop.coins}`;
    const guzik = shopBox.querySelector('#shop-upgrade');
    if (shop.cost === null) {
      guzik.className = 'shop-row shop-row--no';
      guzik.textContent = `skrzynia ${shop.slots} — większej nie ma`;
      return;
    }
    const stac = shop.coins >= shop.cost;
    guzik.className = `shop-row${stac ? '' : ' shop-row--no'}`;
    guzik.textContent = `powiększ skrzynię do ${shop.slots + 20} — ${shop.cost} monet`;
  }

  function applySack(state) {
    const był = sack ? JSON.stringify(sack) : '';
    sack = state ?? null;
    if (!open) return;
    if (JSON.stringify(sack ?? '') === był) return;
    renderSack();
  }

  /**
   * Gniazdo noszonej rzeczy.
   *
   * Stoi **obok siatki, nie w niej**: rzecz założona wychodzi z plecaka, więc nie
   * zajmuje kratek. Gdyby zbroja leżała w siatce i jednocześnie była na postaci,
   * „ile mam miejsca" przestawałoby mieć jedną odpowiedź.
   */
  function renderGear() {
    const cell = gearBox.querySelector('.gear-slot[data-slot="body"]');
    const icon = cell.querySelector('.gear-icon');
    const kind = gear.b ? gear.b[1] : null;
    cell.classList.toggle('gear-slot--on', Boolean(kind));
    cell.querySelector('.gear-label').style.display = kind ? 'none' : '';
    ikonaWKratce(icon, kind, 64);
  }

  /** Ikona przycięta do własnej ramki, wpisana w kwadrat o boku `bok`. */
  function ikonaWKratce(el, kind, bok) {
    if (!kind) {
      el.style.backgroundImage = '';
      el.style.width = '0px';
      el.style.height = '0px';
      return;
    }
    const frame = frames?.[ITEMS[kind]?.icon]?.frame;
    if (!frame || !sheet.w) return;
    const scale = Math.min(bok / frame.w, bok / frame.h);
    el.style.width = `${Math.round(frame.w * scale)}px`;
    el.style.height = `${Math.round(frame.h * scale)}px`;
    el.style.backgroundImage = 'url(assets/gen/props.png)';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    el.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
  }

  function applyGear(state) {
    if (!state) return;
    if (state.s === gear.s) return;
    gear = state;
    if (open) renderGear();
  }

  function renderSack() {
    // Worek ma pierwszeństwo: stojąc nad trupem przy skrzyni chodzi o trupa.
    const pojemnik = sack ?? chest;
    const jestSkrzynia = !sack && Boolean(chest);
    sackBox.style.display = pojemnik ? 'block' : 'none';
    sackGrid.innerHTML = '';
    if (!pojemnik) return;
    sackBox.querySelector('#bag-title').textContent = jestSkrzynia
      ? `skrzynia  ${pojemnik.it.length}/${pojemnik.max}`
      : 'worek';
    sackBox.dataset.rodzaj = jestSkrzynia ? 'chest' : 'sack';

    for (const [id, kind] of pojemnik.it) {
      const cell = document.createElement('div');
      cell.className = 'sack-cell';
      cell.dataset.id = String(id);
      cell.title = ITEMS[kind]?.name ?? kind;

      const icon = document.createElement('div');
      icon.className = 'sack-icon';
      // Ikona przycięta do własnej ramki — ten sam błąd, co przy liście wyrobów,
      // dałby tu kilka narzędzi wciśniętych w jedną kratkę.
      const frame = frames?.[ITEMS[kind]?.icon]?.frame;
      if (frame && sheet.w) {
        const scale = Math.min(CELL / frame.w, CELL / frame.h);
        icon.style.width = `${Math.round(frame.w * scale)}px`;
        icon.style.height = `${Math.round(frame.h * scale)}px`;
        icon.style.backgroundImage = 'url(assets/gen/props.png)';
        icon.style.backgroundRepeat = 'no-repeat';
        icon.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
        icon.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
      }

      cell.appendChild(icon);
      sackGrid.appendChild(cell);
    }
  }

  function apply(state) {
    if (!state) return;
    if (state.s === seq) return;
    seq = state.s;
    bag = {
      w: state.w,
      h: state.h,
      items: state.it.map((it) => ({ id: it.i, kind: it.k, x: it.x, y: it.y, rot: it.r })),
    };
    if (open) render();
  }

  // --- Przeciąganie -----------------------------------------------------------

  function pointerCell(event) {
    const rect = grid.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - rect.left) / CELL),
      y: Math.floor((event.clientY - rect.top) / CELL),
    };
  }

  function startDrag(event, itemEl) {
    const id = Number(itemEl.dataset.id);
    const item = bag.items.find((it) => it.id === id);
    if (!item) return;

    const rect = itemEl.getBoundingClientRect();
    drag = {
      id,
      kind: item.kind,
      rot: item.rot,
      // Uchwyt w kratkach: przedmiot ma się trzymać kursora w tym miejscu,
      // w którym go złapano, a nie skakać rogiem pod palec.
      ox: Math.floor((event.clientX - rect.left) / CELL),
      oy: Math.floor((event.clientY - rect.top) / CELL),
      el: itemEl,
    };
    itemEl.classList.add('bag-item--drag');
    moveDrag(event);
  }

  function moveDrag(event) {
    if (!drag) return;
    const size = cellsOf(drag.kind, drag.rot);
    drag.el.style.width = `${size.w * CELL}px`;
    drag.el.style.height = `${size.h * CELL}px`;
    const icon = drag.el.querySelector('.bag-icon');
    if (icon) placeIcon(drag.el, icon, drag.kind, drag.rot);

    const rect = grid.getBoundingClientRect();
    drag.el.style.left = `${event.clientX - rect.left - drag.ox * CELL - CELL / 2}px`;
    drag.el.style.top = `${event.clientY - rect.top - drag.oy * CELL - CELL / 2}px`;

    const cell = pointerCell(event);
    const tx = cell.x - drag.ox;
    const ty = cell.y - drag.oy;
    const ok = fits(bag, drag.kind, drag.rot, tx, ty, drag.id);
    drag.el.classList.toggle('bag-item--bad', !ok);
    drag.target = ok ? { x: tx, y: ty } : null;
  }

  function endDrag(event) {
    if (!drag) return;

    const posprzataj = () => {
      drag.el.classList.remove('bag-item--drag', 'bag-item--bad');
      drag = null;
      render();
    };

    // Upuszczenie **na panel** skrzyni albo karczmarza jest tym, czego gracz
    // próbuje najpierw: widzi pojemnik i ciągnie do niego. Pierwsza wersja
    // wymagała wyciągnięcia poza całe okno i nikt na to nie wpadł — zgłoszone
    // z gry: *do skrzyni nie da się nic odłożyć*.
    const naPanelu = (el) => {
      if (!el || el.style.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right
        && event.clientY >= r.top && event.clientY <= r.bottom;
    };
    if (shop && naPanelu(shopBox)) { onSell?.(drag.id); posprzataj(); return; }
    if (chest && !sack && naPanelu(sackBox)) { onChestPut?.(drag.id); posprzataj(); return; }

    // „Poza panelem" liczymy od **całego okna**, a nie od samej siatki: między
    // ostatnią kratką a krawędzią panelu jest ramka z napisami i puszczenie
    // kłody na niej nie może znaczyć „wyrzuć na ziemię".
    const rect = panel.parentElement.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom;

    // Gniazdo paska sprawdzamy **przed** wyrzuceniem na ziemię. Pasek leży poza
    // panelem plecaka, więc bez tego przeciągnięcie siekiery na gniazdo znaczyłoby
    // „wyrzuć siekierę" — czyli dokładnie odwrotnie, niż wygląda.
    // Kolejność sprawdzania celów jest **kolejnością od najbardziej szczegółowego**:
    // gniazdo zbroi, potem gniazdo paska, potem ziemia. Każdy z nich leży poza
    // siatką, więc bez tego wszystkie znaczyłyby „wyrzuć".
    const nadGniazdem = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest?.('.gear-slot');
    const slot = slotAt?.(event.clientX, event.clientY);
    if (nadGniazdem) onGear?.(drag.id);
    else if (slot !== null && slot !== undefined) onSlot?.(slot, drag.id);
    else if (outside) onDrop?.(drag.id);
    else if (drag.target) onMove?.(drag.id, drag.target.x, drag.target.y, drag.rot);

    drag.el.classList.remove('bag-item--drag', 'bag-item--bad');
    drag = null;
    // Odrysowanie z **ostatniego stanu serwera**, nie z podglądu. Jeśli serwer
    // przyjmie ruch, przyjdzie nowa migawka; jeśli nie, przedmiot wraca tam,
    // gdzie naprawdę leży, i gracz od razu widzi, że się nie zmieściło.
    render();
  }

  // Dwuklik liczymy **sami**, a nie zdarzeniem `dblclick`.
  //
  // Pierwsze kliknięcie zaczyna przeciąganie, a puszczenie przycisku odrysowuje
  // siatkę od zera — więc drugie kliknięcie trafia już w **nowy** element i
  // przeglądarka nie ma czego sparować w dwuklik. Zgłoszone z gry: „lewym się
  // podnosi item i nie da się zjeść". Porównujemy numer przedmiotu, bo on
  // przeżywa odrysowanie, a węzeł nie.
  let lastClick = { id: -1, at: 0 };
  const DBL_MS = 400;

  box.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#shop-upgrade') && shop?.cost !== null) {
      event.preventDefault();
      onUpgrade?.();
      return;
    }
    // Przełożenie z worka. Prośba idzie zawsze — o tym, czy rzecz jeszcze tam
    // leży i czy zmieści się w siatce, rozstrzyga serwer.
    const sackCell = event.target.closest('.sack-cell');
    // **`sack || chest`, nie samo `sack`.** Warunek pytał wyłącznie o worek, więc
    // przy skrzyni ta gałąź nie wchodziła nigdy i nie dało się nic wyjąć.
    // Zgłoszone z gry: „do skrzyni da się włożyć, ze skrzyni nie da się wyjąć".
    if (sackCell && (sack || chest)) {
      event.preventDefault();
      // Kliknięcie bierze — z worka albo ze skrzyni, zależnie od tego, co jest
      // otwarte. Ten sam gest w obu miejscach.
      const id = Number(sackCell.dataset.id);
      if (sack) onTake?.(sack.i, id);
      else if (chest) onChestTake?.(id);
      return;
    }

    // Kliknięcie w zajęte gniazdo zdejmuje rzecz z powrotem do plecaka.
    const gearCell = event.target.closest('.gear-slot');
    if (gearCell) {
      event.preventDefault();
      if (gear.b) onUngear?.(gearCell.dataset.slot);
      return;
    }

    const itemEl = event.target.closest('.bag-item');
    if (!itemEl) return;
    event.preventDefault();
    if (event.button === 2) {
      // Obrót w miejscu prawym przyciskiem — bez chwytania.
      const id = Number(itemEl.dataset.id);
      const item = bag.items.find((it) => it.id === id);
      if (!item) return;
      const rot = item.rot ? 0 : 1;
      if (fits(bag, item.kind, rot, item.x, item.y, item.id)) onMove?.(id, item.x, item.y, rot);
      return;
    }

    const id = Number(itemEl.dataset.id);
    const item = bag.items.find((it) => it.id === id);

    // **Shift przerzuca bez przeciągania.** Przy skrzyni chowa, przy ladzie
    // sprzedaje. Przeciąganie jest w porządku przy jednej rzeczy, ale przy
    // opróżnianiu pełnego plecaka to trzydzieści gestów myszą — a czynność
    // jest za każdym razem ta sama, więc powinna być jednym kliknięciem.
    if (event.shiftKey && item) {
      event.preventDefault();
      if (shop) onSell?.(id);
      else if (chest && !sack) onChestPut?.(id);
      return;
    }

    const now = performance.now();
    if (item && ITEMS[item.kind]?.food && id === lastClick.id && now - lastClick.at < DBL_MS) {
      lastClick = { id: -1, at: 0 };
      onEat?.(id);
      return;
    }
    lastClick = { id, at: now };
    startDrag(event, itemEl);
  });

  window.addEventListener('pointermove', (event) => {
    if (drag) moveDrag(event);
  });
  window.addEventListener('pointerup', (event) => {
    if (drag) endDrag(event);
  });
  // Obrót w trakcie przeciągania.
  window.addEventListener('contextmenu', (event) => {
    if (!open) return;
    if (!box.contains(event.target)) return;
    event.preventDefault();
    if (drag) {
      drag.rot = drag.rot ? 0 : 1;
      moveDrag(event);
    }
  });

  // --- Otwieranie -------------------------------------------------------------

  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (open) {
      document.body.appendChild(box);
      render();
      renderGear();
      renderSack();
      // **Także sklep.** `applyShop()` wychodzi wcześniej, gdy panel jest
      // zamknięty, więc przy otwarciu trzeba narysować to, co już przyszło
      // z serwera. Bez tego panel karczmarza był pusty aż do pierwszej zmiany
      // stanu, czyli w praktyce zawsze.
      renderShop();
    } else {
      drag = null;
      box.remove();
    }
  }

  return {
    useAtlas: (atlasFrames, sheetSize) => { frames = atlasFrames; sheet = sheetSize; },
    apply,
    applyGear,
    applySack,
    applyChest,
    applyShop,
    /** Otwarcie bez przełączania — przy worku `E` ma otwierać, a nie zamykać. */
    openNow: () => setOpen(true),
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    get open() { return open; },
  };
}
