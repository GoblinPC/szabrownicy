// Panel testowy: pora dnia i pogoda. Narzędzie, nie element gry.
//
// Doba trwa szesnaście minut, a bloki pogody półtorej — obejrzenie konkretnej
// godziny albo ulewy znaczy czekanie na nią w czasie rzeczywistym. Przy dobieraniu
// kolorów nieba to jest nie do zniesienia: żeby porównać świt z zachodem, trzeba by
// siedzieć osiem minut, a na ulewę można trafić dopiero po kilku podejściach.
//
// Suwaki przestawiają **wyłącznie widok u siebie**. Zegar i pogodę dalej prowadzi
// serwer i po naciśnięciu „auto" wszystko wraca tam, gdzie naprawdę jest. Nie ma
// tu czego oszukiwać — a gdy dojdą nocne potwory i głód, będzie je liczył serwer,
// dla którego te suwaki nie istnieją.
//
// Panel chodzi razem z panelem diagnostycznym pod `F1`, bo to ten sam rodzaj
// rzeczy: przyrząd, nie interfejs gracza.

import { partOfDay } from '../world/daylight.js';
import { weatherName } from '../world/weather.js';

/** Ułamek doby jako godzina zegarowa — czytelniej niż „0.734". */
function asClock(phase) {
  const minutes = Math.round(phase * 1440) % 1440;
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Jeden wiersz panelu: suwak, odczyt i podpis.
 *
 * Wspólny dla obu, bo różnią się wyłącznie skalą i opisem — a każdy wiersz sam
 * pilnuje, czy ktoś go już ruszył. Wspólne „ręcznie" dla obu byłoby mylące:
 * przesunięcie pory dnia nie ma zatrzymywać pogody.
 */
function buildRow(label, max, format, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'test-row';

  const head = document.createElement('div');
  head.className = 'test-head';
  const name = document.createElement('span');
  name.textContent = label;
  head.appendChild(name);

  const line = document.createElement('label');
  line.className = 'mixer-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(max);
  slider.step = '1';
  slider.value = '0';

  const readout = document.createElement('span');
  readout.className = 'mixer-value';

  const caption = document.createElement('div');
  caption.className = 'test-caption';

  let manual = false;
  let shown = -1;

  const paint = (value, live) => {
    const [text, note] = format(value);
    readout.textContent = text;
    caption.textContent = live ? `${note} · serwer` : `${note} · ręcznie`;
    caption.classList.toggle('test-caption--manual', !manual);
  };

  slider.addEventListener('input', () => {
    manual = true;
    paint(Number(slider.value), false);
    onChange(Number(slider.value));
  });
  // Ta sama pułapka co przy suwakach głośności: zaznaczony suwak zjada strzałki
  // i postać przestaje chodzić.
  slider.addEventListener('pointerup', () => slider.blur());
  slider.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') slider.blur();
  });

  line.append(slider, readout);
  wrap.append(head, line, caption);

  return {
    el: wrap,
    release() {
      manual = false;
    },
    /**
     * Wartość z gry. Przepisujemy dopiero przy zmianie kroku: sześćdziesiąt razy
     * na sekundę to sześćdziesiąt przeliczeń układu strony na nic.
     */
    follow(value) {
      if (manual) return;
      const step = Math.round(value);
      if (step === shown) return;
      shown = step;
      slider.value = String(step);
      paint(step, true);
    },
  };
}

/**
 * @param {(phase: number|null) => void} onDay
 * @param {(rain: number|null) => void} onRain
 */
export function createTestPanel(onDay, onRain) {
  const panel = document.createElement('div');
  panel.id = 'testpanel';
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'test-title';
  const title = document.createElement('span');
  title.textContent = 'świat';
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'test-auto';
  auto.textContent = 'auto';
  header.append(title, auto);

  const day = buildRow('pora dnia', 1439,
    (v) => [asClock(v / 1440), partOfDay(v / 1440)],
    (v) => onDay(v / 1440));

  const rain = buildRow('deszcz', 100,
    (v) => [`${v}%`, weatherName(v / 100)],
    (v) => onRain(v / 100));

  auto.addEventListener('click', () => {
    day.release();
    rain.release();
    onDay(null);
    onRain(null);
    auto.blur();
  });

  panel.append(header, day.el, rain.el);
  // Scena świata potrafi się przeładować (np. przy zerwanym połączeniu), a wtedy
  // panel doszedłby drugi raz.
  document.getElementById('testpanel')?.remove();
  document.body.appendChild(panel);

  let visible = false;

  return {
    setVisible(on) {
      visible = on;
      panel.style.display = on ? 'block' : 'none';
    },
    follow(phase, rainLevel) {
      if (!visible) return;
      day.follow((phase * 1440) % 1440);
      rain.follow(rainLevel * 100);
    },
  };
}
