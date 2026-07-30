// Pogoda. Na razie jedna rzecz: deszcz.
//
// Plik jest wspólny dla klienta i serwera, tak samo jak `daylight.js` i fizyka
// ruchu, ale z innego powodu. Tam chodziło o to, żeby obie strony liczyły tak
// samo. Tu — żeby **nikt nie musiał niczego trzymać**: siła deszczu jest funkcją
// czasu, więc restart serwera nie przestawia pogody, a zapis stanu nie istnieje,
// bo nie ma czego zapisywać.
//
// Serwer i tak wysyła wynik w migawce (`r`), zamiast liczyć go osobno u każdego
// gracza z lokalnego zegara. Powód jest ten sam co przy porze dnia: to serwer
// rozstrzyga, jaka jest pogoda, a jedna liczba na migawkę nic nie kosztuje.

// Długość jednego bloku pogody. Półtorej minuty przy dobie 16-minutowej znaczy
// mniej więcej dziesięć bloków na dobę — dość, żeby deszcz zdążył przyjść i zejść
// w trakcie jednej sesji, i za mało, żeby robił się z tego stroboskop.
export const WEATHER_BLOCK_MS = 90 * 1000;

// Ile bloków jest suchych.
//
// Liczba wygląda na przesadną i taka nie jest: deszcz **rozlewa się na bloki
// sąsiednie**, bo między nimi przechodzimy gładko, więc jeden mokry blok moczy
// też pół suchego z każdej strony. Przy 0,62 wychodziło 55% czasu z opadem, czyli
// deszcz był stanem normalnym. Zmierzone rozkładem po całej dobie, nie na oko.
const DRY = 0.82;

/**
 * Powtarzalna liczba 0–1 z numeru bloku.
 *
 * Zwykły `Math.random()` odpada, bo dwie strony muszą dostać ten sam wynik,
 * a zapamiętany stan odpada, bo restart serwera zmieniłby pogodę w środku ulewy.
 * To ten sam pomysł co `seedFrom()` w generatorach grafiki: świat ma być losowy,
 * ale zawsze tak samo losowy.
 */
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Docelowa siła deszczu w danym bloku: 0, mżawka albo ulewa. */
function targetFor(block) {
  const roll = hash(block);
  if (roll < DRY) return 0;
  const wet = (roll - DRY) / (1 - DRY);
  // Mżawka jest częstsza od ulewy — potęga przesuwa rozkład w stronę słabych opadów.
  return 0.22 + 0.78 * wet ** 1.7;
}

const smooth = (k) => k * k * (3 - 2 * k);

/**
 * Siła deszczu dla podanego czasu: 0 sucho, 1 ulewa.
 *
 * Między blokami przechodzimy gładko, więc deszcz **narasta i cichnie**, zamiast
 * włączać się jak przełącznik. To jedyny powód, dla którego bloki w ogóle się
 * mieszają — bez tego ulewa zaczynałaby się w pełnej sile w jednej klatce.
 */
export function rainAt(now = Date.now()) {
  const position = now / WEATHER_BLOCK_MS;
  const block = Math.floor(position);
  const k = smooth(position - block);
  return targetFor(block) * (1 - k) + targetFor(block + 1) * k;
}

/** Nazwa pogody — do panelu diagnostycznego. */
export function weatherName(rain) {
  if (rain < 0.04) return 'sucho';
  if (rain < 0.3) return 'mży';
  if (rain < 0.65) return 'pada';
  return 'ulewa';
}
