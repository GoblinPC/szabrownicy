// Pasek narzędzi — cztery gniazda na dole ekranu.
//
// **To nie jest wygoda, tylko naprawa zasady.** Wcześniej o tym, czym gracz
// pracuje, decydowała sama zawartość plecaka: kto miał w nim siekierę, ten ścinał
// drzewo czymkolwiek, a w ręce widać było broń — zgłoszone z gry jako *włócznia
// zbiera drewno i kamienie*. Odkąd liczy się wybrane gniazdo, „czym uderzam"
// i „czym rąbię" mają jedną odpowiedź, tę samą u klienta i na serwerze.
//
// Zwykły HTML nad kanwą, jak plecak i czat. Dzięki temu przeciągnięcie rzeczy
// z plecaka **wprost na gniazdo** działa za darmo — a to jest jedyny naturalny
// sposób przypisania.
//
// Pasek jest widoczny **zawsze**, także przy zamkniętym plecaku: to jedyna rzecz
// w interfejsie, która odpowiada na pytanie „co mam w ręce", a odpowiadać na nie
// trzeba w biegu.

import { ITEMS } from '../world/items.js';

const CELL = 44;

export function createHotbar({ onPick }) {
  const box = document.createElement('div');
  box.id = 'hotbar';

  const cells = [];
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'hot-cell';
    cell.dataset.slot = String(i);

    const numer = document.createElement('span');
    numer.className = 'hot-num';
    numer.textContent = String(i + 1);

    const icon = document.createElement('div');
    icon.className = 'hot-icon';

    cell.append(numer, icon);
    box.appendChild(cell);
    cells.push({ cell, icon });
  }

  // Poprzednia strona mogła zostawić swój pasek, gdy scena się przeładowała.
  document.getElementById('hotbar')?.remove();
  document.body.appendChild(box);

  let frames = null;
  let sheet = { w: 0, h: 0 };
  let stan = { h: [null, null, null, null], a: 0, s: -1 };
  let bag = null;
  let pokazane = '';

  box.addEventListener('pointerdown', (event) => {
    const cell = event.target.closest('.hot-cell');
    if (!cell) return;
    event.preventDefault();
    onPick?.(Number(cell.dataset.slot));
  });

  /** Ikona przycięta do własnej ramki — inaczej w kratce widać sąsiadów z atlasu. */
  function drawIcon(el, kind) {
    if (!kind) {
      el.style.backgroundImage = '';
      el.style.width = '0px';
      el.style.height = '0px';
      return;
    }
    const frame = frames?.[ITEMS[kind]?.icon]?.frame;
    if (!frame || !sheet.w) return;
    const scale = Math.min((CELL - 8) / frame.w, (CELL - 8) / frame.h);
    el.style.width = `${Math.round(frame.w * scale)}px`;
    el.style.height = `${Math.round(frame.h * scale)}px`;
    el.style.backgroundImage = 'url(assets/gen/props.png)';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    el.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
  }

  function render() {
    // Rodzaj przedmiotu bierzemy z plecaka po numerze: gniazdo trzyma **numer**,
    // nie kopię, więc rzecz wyrzucona albo stracona przy śmierci znika z paska
    // sama, bez sprzątania w drugim miejscu.
    const rodzaj = (id) => bag?.it?.find((it) => it.i === id)?.k ?? null;

    cells.forEach(({ cell, icon }, i) => {
      cell.classList.toggle('hot-cell--on', i === stan.a);
      drawIcon(icon, rodzaj(stan.h[i]));
    });
  }

  return {
    useAtlas: (atlasFrames, sheetSize) => { frames = atlasFrames; sheet = sheetSize; },
    /**
     * Nowy stan z serwera. Przerysowujemy dopiero przy zmianie — pasek wisi na
     * ekranie przez całą grę, więc sześćdziesiąt przeliczeń układu na sekundę
     * byłoby najdroższą rzeczą w interfejsie.
     */
    apply(hot, bagState) {
      if (hot) stan = hot;
      if (bagState) bag = bagState;
      const odcisk = `${stan.s}/${stan.a}/${stan.h.join(',')}/${bag?.s ?? -1}`;
      if (odcisk === pokazane) return;
      pokazane = odcisk;
      render();
    },
    /** Czy pod tym punktem ekranu leży gniazdo — pyta plecak przy puszczeniu rzeczy. */
    slotAt(x, y) {
      const el = document.elementFromPoint(x, y)?.closest?.('.hot-cell');
      return el ? Number(el.dataset.slot) : null;
    },
  };
}
