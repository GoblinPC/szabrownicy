// Suwaki głośności.
//
// Zwykłe elementy HTML nad kanwą, a nie rysowane w grze — dzięki temu działają
// od razu z myszką, dotykiem i klawiaturą, bez pisania własnej obsługi.
//
// Jedna pułapka: suwak, który zostanie zaznaczony, przechwytuje strzałki i gracz
// nie może się ruszyć. Dlatego po każdej zmianie odbieramy mu zaznaczenie.

import { audio } from '../audio/audio.js';

const CHANNELS = [
  { name: 'music', label: 'muzyka' },
  { name: 'ambience', label: 'ogień i wiatr' },
  { name: 'sfx', label: 'kroki' },
  { name: 'master', label: 'wszystko' },
];

export function createMixer() {
  const panel = document.createElement('div');
  panel.id = 'mixer';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'mixer-toggle';
  header.textContent = 'dźwięk ▾';
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'mixer-body';
  panel.appendChild(body);

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

  let open = localStorage.getItem('szab_mixer_open') !== '0';
  const refresh = () => {
    body.style.display = open ? 'grid' : 'none';
    header.textContent = open ? 'dźwięk ▾' : 'dźwięk ▸';
  };
  header.addEventListener('click', () => {
    open = !open;
    localStorage.setItem('szab_mixer_open', open ? '1' : '0');
    refresh();
    header.blur();
  });
  refresh();

  document.body.appendChild(panel);
  return panel;
}
