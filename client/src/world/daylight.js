// Pora dnia i kolor światła, jaki z niej wynika.
//
// Plik jest wspólny dla klienta i serwera, tak samo jak fizyka ruchu. Serwer
// prowadzi zegar i rozsyła go w migawce — inaczej każdy gracz miałby własną
// godzinę i stojąc obok siebie widzieliby inną porę dnia.
//
// Wysyłamy **sam czas**, nie policzony kolor: to kilka bajtów zamiast trzech
// liczb na klatkę, a przeliczenie i tak musi być po stronie klienta, bo to on
// rysuje. Klient dostaje czas raz na migawkę i między migawkami sam go posuwa,
// więc przejście jest gładkie mimo dwudziestu paczek na sekundę.

// Doba w milisekundach czasu rzeczywistego.
//
// Szesnaście minut to kompromis wyniesiony z tego, jak gra się testuje: przy
// dobie godzinnej nikt nie zobaczy nocy w trakcie jednej sesji, a przy pięciu
// minutach światło miga jak stroboskop i nie da się niczego obejrzeć.
export const DAY_MS = 16 * 60 * 1000;

/**
 * Czy doba w grze ma odpowiadać prawdziwej godzinie.
 *
 * Domyślnie **nie** i to jest przemyślana decyzja, nie zaniedbanie:
 *
 * - świat jest współdzielony, więc gracze z różnych stref czasowych widzieliby
 *   o tej samej chwili inną porę dnia, stojąc obok siebie;
 * - grywa się wieczorami, więc przy prawdziwej dobie prawie każda sesja
 *   wypadałaby w nocy i dnia nikt by nie oglądał;
 * - przy dobie 16-minutowej świat zmienia się **w trakcie jednej sesji** — świt,
 *   dzień, zmierzch, noc. To właśnie daje wrażenie, że świat żyje.
 *
 * Przełączenie na `true` wystarczy, żeby wrócić do prawdziwej godziny; reszta
 * kodu liczy się z ułamka doby i nie musi o tym wiedzieć.
 */
export const FOLLOW_REAL_CLOCK = false;

/**
 * Punkty kluczowe doby. `at` to ułamek doby (0 = północ), `sky` to kolor światła
 * otoczenia na otwartym terenie.
 *
 * Kolory pochodzą z rampy `night` i `ember` z zamkniętej palety — noc jest
 * chłodna i granatowa, świt i zmierzch ciepłe, południe jasne i lekko wyblakłe.
 * Nie ma tu czerni: przy zupełnie czarnej nocy gra przestaje być czytelna,
 * a pochodnie zamiast dodawać nastroju stają się jedynym sposobem, żeby cokolwiek
 * zobaczyć.
 *
 * Punktem odniesienia jest `[86, 100, 140]` — kolor placu z czasów, gdy doby nie
 * było. Wypada mniej więcej między zmierzchem a nocą i tak właśnie wyglądała gra
 * przez cały czas: wiecznie po zachodzie. Noc jest od tego wyraźnie ciemniejsza,
 * ale nie tak, żeby przestać widzieć — sprawdzone na `docs/preview/doba.png`
 * obok tego samego kadru bez światła.
 */
const KEYFRAMES = [
  { at: 0.00, sky: [56, 68, 104] },   // 00:00  głęboka noc
  { at: 0.18, sky: [64, 78, 116] },   // 04:19  przed świtem
  { at: 0.24, sky: [158, 104, 92] },  // 05:46  świt, czerwono
  { at: 0.31, sky: [212, 192, 166] }, // 07:26  wczesny ranek
  { at: 0.40, sky: [240, 234, 218] }, // 09:36  dzień
  { at: 0.50, sky: [248, 244, 230] }, // 12:00  południe
  { at: 0.65, sky: [242, 230, 206] }, // 15:36  wciąż dzień
  { at: 0.74, sky: [236, 216, 182] }, // 17:46  popołudnie, ledwie ciepłe
  { at: 0.82, sky: [218, 164, 110] }, // 19:41  złota godzina
  { at: 0.87, sky: [186, 106, 72] },  // 20:53  zachód
  { at: 0.92, sky: [102, 88, 120] },  // 22:05  zmierzch
  { at: 0.96, sky: [66, 78, 114] },   // 23:02  zapada noc
  { at: 1.00, sky: [56, 68, 104] },
];

/** Ułamek doby dla podanego czasu zegara. */
export function phaseOf(now = Date.now()) {
  if (FOLLOW_REAL_CLOCK) {
    // Godzina serwera, nie gracza — świat musi mieć jedną porę dnia dla wszystkich.
    const date = new Date(now);
    const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    return seconds / 86400;
  }
  return (now % DAY_MS) / DAY_MS;
}

/**
 * Posuwa porę dnia o podany czas rzeczywisty.
 *
 * Klient dostaje zegar dwadzieścia razy na sekundę i między migawkami liczy go
 * sam — inaczej światło drgałoby w rytmie pakietów. Długość doby siedzi tutaj,
 * a nie w kliencie, żeby przełącznik `FOLLOW_REAL_CLOCK` działał w jednym miejscu.
 */
export function advance(phase, elapsedMs) {
  const span = FOLLOW_REAL_CLOCK ? 86400000 : DAY_MS;
  return (((phase + elapsedMs / span) % 1) + 1) % 1;
}

const lerp = (a, b, k) => a + (b - a) * k;

/** Kolor światła na otwartym terenie o danej porze doby. */
export function skyColor(phase) {
  const p = ((phase % 1) + 1) % 1;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const from = KEYFRAMES[i];
    const to = KEYFRAMES[i + 1];
    if (p < from.at || p > to.at) continue;
    const k = to.at === from.at ? 0 : (p - from.at) / (to.at - from.at);
    return [
      Math.round(lerp(from.sky[0], to.sky[0], k)),
      Math.round(lerp(from.sky[1], to.sky[1], k)),
      Math.round(lerp(from.sky[2], to.sky[2], k)),
    ];
  }
  return KEYFRAMES[0].sky.slice();
}

/**
 * Jak ciemno jest na dworze: 0 w południe, 1 w środku nocy.
 *
 * Po tej jednej liczbie sterują się rzeczy, które mają się dziać po zmroku —
 * świetliki, ćmy przy ogniu, głośniejsze cykanie. Liczona z jasności nieba,
 * więc nie trzeba jej utrzymywać osobno i nie może rozjechać się z kolorem.
 */
export function darkness(phase) {
  const [r, g, b] = skyColor(phase);
  const light = (r + g + b) / 3;
  const min = 76;    // mniej więcej jasność środka nocy
  const max = 241;   // mniej więcej jasność południa
  return Math.max(0, Math.min(1, 1 - (light - min) / (max - min)));
}

/** Nazwa pory dnia — do panelu diagnostycznego i na przyszłość do interfejsu. */
export function partOfDay(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.21) return 'noc';
  if (p < 0.30) return 'świt';
  if (p < 0.43) return 'ranek';
  if (p < 0.58) return 'południe';
  if (p < 0.78) return 'popołudnie';
  if (p < 0.90) return 'zachód';
  if (p < 0.955) return 'zmierzch';
  return 'noc';
}
