// Suwak pory dnia — narzędzie testowe, nie element gry.
//
// Doba trwa szesnaście minut, więc obejrzenie jednej konkretnej godziny znaczy
// czekanie do niej w czasie rzeczywistym. Przy dobieraniu kolorów nieba to jest
// nie do zniesienia: żeby porównać świt z zachodem, trzeba by siedzieć osiem minut.
//
// Suwak przestawia **wyłącznie widok u siebie**. Zegar dalej prowadzi serwer i po
// zwolnieniu suwaka światło wraca tam, gdzie naprawdę jest pora dnia. Nie ma tu
// więc nic do oszukiwania — a gdy dojdą nocne potwory i głód, i tak będą liczone
// po stronie serwera, dla którego ten suwak nie istnieje.
//
// Panel chodzi razem z panelem diagnostycznym pod `F1`, bo to ten sam rodzaj
// rzeczy: przyrząd, nie interfejs gracza.

import { partOfDay } from '../world/daylight.js';

/** Ułamek doby jako godzina zegarowa — czytelniej niż „0.734". */
function asClock(phase) {
  const minutes = Math.round(phase * 1440) % 1440;
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * @param {(phase: number|null) => void} onChange wywoływane z ułamkiem doby,
 *   albo z `null`, gdy wracamy do zegara serwera.
 */
export function createClockSlider(onChange) {
  const panel = document.createElement('div');
  panel.id = 'clock';
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'clock-head';

  const title = document.createElement('span');
  title.textContent = 'pora dnia';

  // Guzik, a nie drugi suwak: „wróć do zegara serwera" to jedna decyzja, nie zakres.
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'clock-auto';
  auto.textContent = 'auto';

  header.append(title, auto);
  panel.appendChild(header);

  const row = document.createElement('label');
  row.className = 'mixer-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1439';
  slider.step = '1';
  slider.value = '720';

  const readout = document.createElement('span');
  readout.className = 'mixer-value';

  const caption = document.createElement('div');
  caption.className = 'clock-caption';

  let manual = false;
  let visible = false;
  let shownMinute = -1;

  const paint = (phase, live) => {
    readout.textContent = asClock(phase);
    caption.textContent = live ? `${partOfDay(phase)} · zegar serwera` : `${partOfDay(phase)} · ręcznie`;
    caption.classList.toggle('clock-caption--manual', !live);
    auto.classList.toggle('clock-auto--on', live);
  };

  slider.addEventListener('input', () => {
    manual = true;
    const phase = Number(slider.value) / 1440;
    paint(phase, false);
    onChange(phase);
  });
  // Ta sama pułapka co przy suwakach głośności: zaznaczony suwak zjada strzałki
  // i postać przestaje chodzić.
  slider.addEventListener('pointerup', () => slider.blur());
  slider.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') slider.blur();
  });

  auto.addEventListener('click', () => {
    manual = false;
    onChange(null);
    auto.blur();
  });

  row.append(slider, readout);
  panel.append(row, caption);
  // Scena świata potrafi się przeładować (np. przy zerwanym połączeniu), a wtedy
  // panel doszedłby drugi raz.
  document.getElementById('clock')?.remove();
  document.body.appendChild(panel);

  return {
    /** Pokazuje albo chowa panel. Zwolnienie sterowania zostawiamy graczowi. */
    setVisible(on) {
      visible = on;
      panel.style.display = on ? 'block' : 'none';
    },
    /**
     * Pora dnia z gry — dopóki nikt nie ruszył suwaka, on ją tylko pokazuje.
     * Przepisujemy dopiero przy zmianie minuty: sześćdziesiąt razy na sekundę
     * to sześćdziesiąt przeliczeń układu strony na nic.
     */
    follow(phase) {
      if (manual || !visible) return;
      const minute = Math.round(phase * 1440) % 1440;
      if (minute === shownMinute) return;
      shownMinute = minute;
      slider.value = String(minute);
      paint(phase, true);
    },
  };
}
