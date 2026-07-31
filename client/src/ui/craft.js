// Okno warsztatu.
//
// **Osobne okno, a nie zakładka w plecaku.** Poprzednia wersja doklejała listę
// wyrobów z boku otwartego plecaka i była zawsze na ekranie — przygaszona, gdy
// nie było gdzie pracować. Wychodziło z tego okno, które w dziewięciu na dziesięć
// otwarć plecaka nie służyło do niczego, a mimo to zajmowało pół ekranu.
//
// Teraz warsztat jest **miejscem w świecie**: podchodzisz, nad blatem zapala się
// `E`, wchodzisz w nie i dopiero wtedy widzisz, co da się zrobić. To jest ta sama
// zasada, na której stoi cała gra — droga do warsztatu ma być częścią pętli, a nie
// przerwą w niej — tylko wreszcie widać ją w interfejsie.
//
// Ikony biorą się z tego samego atlasu co reszta świata (`props.png`), więc
// kilof na liście to **ten sam rysunek**, który potem leży w plecaku.

import { ITEMS, RECIPES, countOf, canCraft } from '../world/items.js';

// Kratka ikony. Wyroby są wysokie i wąskie (dzida to 16×64 px w atlasie), więc
// pole jest wyższe niż szersze — inaczej dzida musiałaby zjechać do jednej
// czwartej wielkości, żeby się zmieścić, i przestawała być rozpoznawalna.
const ICON_W = 40;
const ICON_H = 56;

export function createCraftPanel({ onCraft }) {
  const box = document.createElement('div');
  box.id = 'craft';
  box.innerHTML = `
    <div id="craft-panel">
      <div id="craft-title">warsztat</div>
      <div id="craft-list"></div>
      <div id="craft-hint"><b>E</b> albo <b>ESC</b> — odejdź od stołu</div>
    </div>
  `;

  const list = box.querySelector('#craft-list');
  const tytuł = box.querySelector('#craft-title');

  // Nazwy stanowisk. Tytuł okna ma mówić, **przy czym stoisz** — bez tego dwa
  // różne stanowiska dają dwa nierozróżnialne okna z inną listą.
  const NAZWY = { workbench: 'warsztat', tanrack: 'stojak do skór' };

  let open = false;
  // Przy którym stanowisku stoimy — to ono decyduje, co widać na liście.
  let station = null;
  let bag = { w: 0, h: 0, items: [] };
  let seq = -1;
  let frames = null;
  let sheet = { w: 0, h: 0 };

  /**
   * Ikona wyrobu — **wycinek przycięty do swojej ramki**.
   *
   * Tu siedział błąd, który użytkownik nazwał „jakieś coś dziwnego": poprzednia
   * wersja skalowała cały arkusz i wstawiała go w kwadratowe pole, nie zmieniając
   * rozmiaru samego pola. Ikony w atlasie stoją obok siebie (dzida na x=0, siekiera
   * na x=17, kilof na x=34), a ramka dzidy ma 16 px szerokości — więc w polu
   * szerokim na 48 px mieściły się **wszystkie trzy naraz**, jedna za drugą.
   * Każdy wiersz listy pokazywał ten sam poszatkowany pasek trzech narzędzi.
   *
   * Lekarstwo jest jednoznaczne: element dostaje rozmiar **swojej** ramki po
   * przeskalowaniu i tylko ona się w nim mieści. Sąsiadów z atlasu nie ma jak
   * wpuścić, bo nie ma ich gdzie narysować.
   */
  function drawIcon(el, kind) {
    const spec = ITEMS[kind];
    const frame = frames?.[spec?.icon]?.frame;
    if (!frame || !sheet.w) return;
    // Skala liczona z **obu** boków: ikona ma się zmieścić w polu w całości,
    // a nie wyjść poza nie tym bokiem, którego nie sprawdziliśmy.
    const scale = Math.min(ICON_W / frame.w, ICON_H / frame.h);
    el.style.width = `${Math.round(frame.w * scale)}px`;
    el.style.height = `${Math.round(frame.h * scale)}px`;
    el.style.backgroundImage = 'url(assets/gen/props.png)';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    el.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
  }

  function render() {
    list.innerHTML = '';
    tytuł.textContent = NAZWY[station] ?? 'warsztat';

    // Numer wyrobu zostaje **numerem w pełnej liście**, także po odsianiu obcych
    // stanowisk: serwer sięga po `RECIPES[i]`, więc numerowanie od nowa po
    // odsianiu wskazywałoby inny wyrób niż ten klikniięty.
    RECIPES.forEach((recipe, index) => {
      if (recipe.station !== station) return;
      const spec = ITEMS[recipe.out];
      const stac = canCraft(bag, recipe);

      const row = document.createElement('div');
      row.className = `craft-row${stac ? '' : ' craft-row--no'}`;
      row.dataset.index = String(index);

      const pole = document.createElement('div');
      pole.className = 'craft-slot';
      const icon = document.createElement('div');
      icon.className = 'craft-icon';
      drawIcon(icon, recipe.out);
      pole.appendChild(icon);

      const opis = document.createElement('div');
      opis.className = 'craft-text';
      // Koszt jako **posiadane z potrzebnych**, nie sama cena: „kłoda 1/2" mówi
      // od razu, czego brakuje i ile, bez zaglądania do plecaka.
      const czesci = Object.entries(recipe.cost).map(([kind, n]) => {
        const mam = countOf(bag, kind);
        const brak = mam < n ? ' class="craft-lack"' : '';
        return `<span${brak}>${ITEMS[kind]?.name ?? kind} ${mam}/${n}</span>`;
      });
      opis.innerHTML = `<b>${spec?.name ?? recipe.out}</b>`
        + `<span class="craft-cost">${czesci.join(' &nbsp; ')}</span>`;

      row.append(pole, opis);
      list.appendChild(row);
    });
  }

  /**
   * Nowa zawartość plecaka. Przy zamkniętym oknie tylko zapamiętujemy.
   *
   * Znacznik `s` odsiewa migawki bez zmian — bez tego lista przerysowywałaby się
   * sześćdziesiąt razy na sekundę, a każde przerysowanie wymienia węzły pod
   * kursorem i gubi podświetlenie wiersza.
   */
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

  box.addEventListener('pointerdown', (event) => {
    const row = event.target.closest('.craft-row');
    if (!row) return;
    event.preventDefault();
    // Prośba idzie zawsze — o tym, czy starczy składników i czy naprawdę stoimy
    // przy warsztacie, rozstrzyga serwer. Okno tylko przygasza to, co nie wyjdzie.
    onCraft?.(Number(row.dataset.index));
  });

  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (open) {
      document.body.appendChild(box);
      // Otwarcie wymusza przerysowanie: przy zamkniętym oknie migawki tylko się
      // odkładały i lista pamiętałaby stan sprzed wyprawy po drewno.
      render();
    } else {
      box.remove();
    }
  }

  return {
    useAtlas: (atlasFrames, sheetSize) => { frames = atlasFrames; sheet = sheetSize; },
    apply,
    /** Zmiana stanowiska przerysowuje listę — inne miejsce, inne wyroby. */
    setStation(name) {
      if (name === station) return;
      station = name;
      if (open) render();
    },
    open: () => setOpen(true),
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    get isOpen() { return open; },
  };
}
