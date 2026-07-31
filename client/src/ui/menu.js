// Menu pod `ESC`.
//
// Powstało po to, żeby **zdjąć rzeczy z ekranu**. Suwaki głośności wisiały
// wcześniej w prawym górnym rogu przez całą grę, choć ustawia się je raz na
// sesję; potem zostały stamtąd zdjęte i przez jakiś czas nie było ich nigdzie
// (`createMixer()` przestało być wołane). To jest ich miejsce docelowe.
//
// **`ESC` nie ma tu pierwszeństwa.** Jeśli otwarty jest plecak, worek albo
// warsztat, `ESC` zamyka najpierw je — bo tego oczekuje każdy, kto właśnie coś
// otworzył. Menu wchodzi dopiero wtedy, gdy nie ma czego zamknąć. Kolejność jest
// w scenie, nie tutaj: to ona wie, co jest otwarte.
//
// Gra **nie zatrzymuje się** pod menu, tak samo jak nie zatrzymuje się pod
// plecakiem. Przy grze sieciowej pauza i tak byłaby kłamstwem — świat leci dalej,
// a ktoś może właśnie biec w twoją stronę.

import { createMixerRows } from './mixer.js';

export function createMenu({ onHelp = null } = {}) {
  const box = document.createElement('div');
  box.id = 'menu';

  const panel = document.createElement('div');
  panel.id = 'menu-panel';

  const title = document.createElement('div');
  title.id = 'menu-title';
  title.textContent = 'menu';

  const dźwięk = document.createElement('div');
  dźwięk.className = 'menu-section';
  dźwięk.textContent = 'dźwięk';

  const wróć = document.createElement('button');
  wróć.type = 'button';
  wróć.className = 'menu-button';
  wróć.textContent = 'wróć do gry';
  wróć.addEventListener('click', () => setOpen(false));

  panel.append(title, dźwięk, createMixerRows());

  if (onHelp) {
    const pomoc = document.createElement('button');
    pomoc.type = 'button';
    pomoc.className = 'menu-button';
    pomoc.textContent = 'sterowanie';
    pomoc.addEventListener('click', () => onHelp());
    panel.appendChild(pomoc);
  }

  const skróty = document.createElement('div');
  skróty.className = 'menu-keys';
  // Skróty wypisane **tutaj, nie na ekranie gry**. Podpowiedź wisząca nad grą
  // przez cały czas jest szumem: czyta się ją raz, a przeszkadza zawsze.
  skróty.innerHTML = [
    '<b>WASD</b> ruch &nbsp; <b>Shift</b> bieg &nbsp; <b>SPACJA</b> unik',
    '<b>MYSZ</b> cios &nbsp; <b>E</b> podnieś, warsztat, worek',
    '<b>TAB</b> plecak &nbsp; <b>1–4</b> narzędzie &nbsp; <b>Enter</b> czat',
    '<b>K</b> panel &nbsp; <b>M</b> cisza &nbsp; <b>N</b> muzyka',
  ].join('<br>');
  panel.append(skróty, wróć);

  box.appendChild(panel);

  // Kliknięcie **poza panelem** zamyka menu. Ten sam odruch co przy każdym oknie
  // na przyciemnionym tle; bez tego jedynym wyjściem jest trafienie w guzik.
  box.addEventListener('pointerdown', (event) => {
    if (event.target === box) setOpen(false);
  });

  let open = false;

  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (open) document.body.appendChild(box);
    else box.remove();
  }

  return {
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    get isOpen() { return open; },
  };
}
