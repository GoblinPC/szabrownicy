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

import { ITEMS, sizeOf, fits, RECIPES, countOf, canCraft } from '../world/items.js';

// Kratka na ekranie. Ikony są rysowane w 16 px, więc trójka daje 48 px i cały
// obrazek zostaje ostry — dwójka była za mała, żeby rozpoznać kłodę od kamienia,
// czwórka nie mieściła plecaka na niższych ekranach.
const CELL = 48;
const ICON_PX = 16;

export function createBackpack({ onMove, onDrop, onEat, onCraft }) {
  const box = document.createElement('div');
  box.id = 'backpack';
  box.innerHTML = `
    <div id="bag-wrap">
      <div id="bag-panel">
        <div id="bag-title">plecak</div>
        <div id="bag-grid"></div>
        <div id="bag-hint">przeciągnij &nbsp;·&nbsp; <b>PPM</b> obróć &nbsp;·&nbsp; <b>2×LPM</b> zjedz &nbsp;·&nbsp; wyrzuć poza siatkę</div>
      </div>
      <div id="bag-forge">
        <div id="bag-title">kuźnia</div>
        <div id="forge-list"></div>
        <div id="bag-hint">kujesz tylko przy kowadle</div>
      </div>
    </div>
  `;

  const grid = box.querySelector('#bag-grid');
  const panel = box.querySelector('#bag-panel');
  const forge = box.querySelector('#bag-forge');
  const forgeList = box.querySelector('#forge-list');
  let atAnvil = false;

  let open = false;
  let bag = { w: 0, h: 0, items: [] };
  let seq = -1;
  let frames = null;          // ramki z props.json
  let drag = null;            // { id, kind, rot, dx, dy, ghost }

  /** Rozmiar całego arkusza — bez niego nie da się przeskalować tła. */
  let sheet = { w: 0, h: 0 };

  /**
   * Ikona jako wycinek z `props.png`.
   *
   * Powiększamy **cały arkusz** i przesuwamy go tak, żeby w kadrze została ta
   * jedna ramka. Prostsze niż krojenie atlasu na osobne pliki i nie mnoży
   * plików do wygenerowania.
   */
  function iconStyle(el, kind, rot) {
    const spec = ITEMS[kind];
    const frame = frames?.[spec?.icon]?.frame;
    if (!frame || !sheet.w) return;
    const scale = CELL / ICON_PX;
    el.style.backgroundImage = 'url(assets/gen/props.png)';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    el.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
    // Obrót rysunku, nie zamiana ikon: dzida obrócona to ta sama dzida położona
    // na boku. Osobny rysunek na każdy obrót byłby dwa razy większym atlasem
    // i dwa razy większą szansą, że któryś przestanie pasować.
    el.style.transform = rot ? 'rotate(90deg)' : '';
    el.style.transformOrigin = 'center';
  }

  function cellsOf(kind, rot) {
    return sizeOf(kind, rot) ?? { w: 1, h: 1 };
  }

  /**
   * Wstawia ikonę w pole przedmiotu.
   *
   * Ikona ma **zawsze rozmiar przy obrocie zero**, a obraca ją `transform`.
   * Obrót idzie wokół środka ikony, a ten po zamianie boków nie pokrywa się ze
   * środkiem pola — dzida położona na boku uciekała o siedemdziesiąt pikseli
   * w górę i w prawo. Stąd wyśrodkowanie liczone wprost: ikona jest pozycjonowana
   * bezwzględnie tak, żeby jej środek trafił w środek pola.
   */
  function placeIcon(el, icon, kind, rot) {
    const base = cellsOf(kind, 0);
    const size = cellsOf(kind, rot);
    const bw = base.w * CELL;
    const bh = base.h * CELL;
    icon.style.position = 'absolute';
    icon.style.width = `${bw}px`;
    icon.style.height = `${bh}px`;
    icon.style.left = `${(size.w * CELL - bw) / 2}px`;
    icon.style.top = `${(size.h * CELL - bh) / 2}px`;
    iconStyle(icon, kind, rot);
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
   * Lista wyrobów.
   *
   * Siedzi **obok otwartego plecaka**, a nie w osobnym oknie — bo składniki
   * leżą w plecaku i to na nie się patrzy, decydując, czy stać cię na siekierę.
   * Osobne okno kuźni kazałoby przełączać się tam i z powrotem, żeby policzyć
   * kamienie.
   *
   * Kujesz **tylko przy kowadle** i widać to wprost: z dala od niego lista jest
   * przygaszona. To nie jest utrudnienie, tylko powód, dla którego miasto jest
   * miastem — droga do kuźni i z powrotem jest pętlą gry, a nie przerwą w niej.
   */
  function renderForge() {
    forge.classList.toggle('bag-forge--far', !atAnvil);
    forgeList.innerHTML = '';

    RECIPES.forEach((recipe, index) => {
      const spec = ITEMS[recipe.out];
      const stac = canCraft(bag, recipe);

      const row = document.createElement('div');
      row.className = `forge-row${stac && atAnvil ? '' : ' forge-row--no'}`;
      row.dataset.index = String(index);

      const icon = document.createElement('div');
      icon.className = 'forge-icon';
      icon.style.width = `${CELL}px`;
      icon.style.height = `${CELL}px`;
      iconMini(icon, recipe.out);

      const opis = document.createElement('div');
      opis.className = 'forge-text';
      // Koszt pokazujemy jako **posiadane z potrzebnych**, nie samą cenę:
      // „drewno 1/2" mówi od razu, czego brakuje i ile.
      const czesci = Object.entries(recipe.cost).map(([kind, n]) => {
        const mam = countOf(bag, kind);
        const brak = mam < n ? ' forge-lack' : '';
        return `<span class="${brak.trim()}">${ITEMS[kind]?.name ?? kind} ${mam}/${n}</span>`;
      });
      opis.innerHTML = `<b>${spec?.name ?? recipe.out}</b><span class="forge-cost">${czesci.join(' &nbsp; ')}</span>`;

      row.append(icon, opis);
      forgeList.appendChild(row);
    });
  }

  /** Ikona zmniejszona do jednej kratki — na liście liczy się rozpoznanie, nie rozmiar. */
  function iconMini(el, kind) {
    const spec = ITEMS[kind];
    const frame = frames?.[spec?.icon]?.frame;
    if (!frame || !sheet.w) return;
    // Skala dobrana tak, żeby **dłuższy bok** ikony zmieścił się w kratce.
    const scale = CELL / Math.max(frame.w, frame.h);
    el.style.backgroundImage = 'url(assets/gen/props.png)';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    el.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
  }

  /** Nowy stan z serwera. Odrysowujemy tylko przy zmianie znacznika. */
  function apply(state, anvil = false) {
    const anvilZmiana = anvil !== atAnvil;
    atAnvil = anvil;
    if (!state) return;
    if (state.s === seq && !anvilZmiana) return;
    if (state.s !== seq) {
      seq = state.s;
      bag = {
        w: state.w,
        h: state.h,
        items: state.it.map((it) => ({ id: it.i, kind: it.k, x: it.x, y: it.y, rot: it.r })),
      };
    }
    if (open) {
      render();
      renderForge();
    }
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
    // „Poza panelem" liczymy od **całego okna**, razem z listą wyrobów obok.
    // Gdyby liczyć od samej siatki, przeciągnięcie kłody nad kuźnię wyrzucałoby
    // ją na ziemię — a to jest ostatnia rzecz, jakiej gracz się tam spodziewa.
    const rect = panel.parentElement.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom;

    if (outside) onDrop?.(drag.id);
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
    const forgeRow = event.target.closest('.forge-row');
    if (forgeRow) {
      event.preventDefault();
      // Prośba idzie zawsze — o tym, czy stoimy przy kowadle i czy starczy
      // składników, rozstrzyga serwer. Klient tylko przygasza to, co nie wyjdzie.
      onCraft?.(Number(forgeRow.dataset.index));
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
      renderForge();
    } else {
      drag = null;
      box.remove();
    }
  }

  return {
    useAtlas: (atlasFrames, sheetSize) => { frames = atlasFrames; sheet = sheetSize; },
    apply,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    get open() { return open; },
  };
}
