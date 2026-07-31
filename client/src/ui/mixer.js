// Suwaki głośności.
//
// Zwykłe elementy HTML nad kanwą, a nie rysowane w grze — dzięki temu działają
// od razu z myszką, dotykiem i klawiaturą, bez pisania własnej obsługi.
//
// Jedna pułapka: suwak, który zostanie zaznaczony, przechwytuje strzałki i gracz
// nie może się ruszyć. Dlatego po każdej zmianie odbieramy mu zaznaczenie.
//
// **To są same wiersze, bez własnego okna.** Wcześniej był to panel przyklejony
// do prawego górnego rogu ekranu; zszedł stamtąd, bo głośność ustawia się raz
// i nie ma powodu, żeby zajmowała róg widoku przez całą grę. Mieszkają teraz
// w menu pod `ESC`, a ta funkcja oddaje gotowy kawałek drzewa do wstawienia
// gdziekolwiek — dzięki temu nie ma dwóch kopii obsługi suwaka.

import { audio } from '../audio/audio.js';

const CHANNELS = [
  { name: 'music', label: 'muzyka' },
  { name: 'ambience', label: 'ogień i wiatr' },
  { name: 'sfx', label: 'kroki' },
  { name: 'master', label: 'wszystko' },
];

export function createMixerRows() {
  const body = document.createElement('div');
  body.className = 'mixer-body';

  for (const channel of CHANNELS) {
    const row = document.createElement('label');
    row.className = 'mixer-row';

    const name = document.createElement('span');
    name.className = 'mixer-label';
    name.textContent = channel.label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(audio.volumes[channel.name] * 100));

    const readout = document.createElement('span');
    readout.className = 'mixer-value';
    readout.textContent = `${slider.value}%`;

    slider.addEventListener('input', () => {
      audio.unlock();
      audio.setVolume(channel.name, Number(slider.value) / 100);
      readout.textContent = `${slider.value}%`;
    });
    // Bez tego zaznaczony suwak zjada strzałki i postać przestaje chodzić.
    slider.addEventListener('pointerup', () => slider.blur());
    slider.addEventListener('keyup', (event) => {
      if (event.key === 'Escape') slider.blur();
    });

    row.append(name, slider, readout);
    body.appendChild(row);
  }

  return body;
}
