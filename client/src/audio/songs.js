// Muzyka zapisana jako dane, tak samo jak grafika.
//
// „Kuźnia". Napisane wokół jednego motywu, bo poprzednia wersja była zbiorem
// luźnych, długich nut — a taki zapis zawsze zabrzmi jak przytrzymywanie
// klawisza, choćby był nie wiadomo jak rzadki.
//
// MOTYW: rytm 3-3-6-4 wiersza, łuk w górę i powrót. Ma dwie różne długości nut
// i cztery wysokości, czyli minimum, poniżej którego ucho nie ma czego zapamiętać.
// Pierwszy raz kończy się na dźwięku niestabilnym (drugi stopień), przez co prosi
// się o ciąg dalszy; wersja domykająca kończy się na tonice.
//
// ROZWINIĘCIE: ten sam rytm wraca nad innymi akordami, z wysokościami dopasowanymi
// do każdego z nich — to najprostszy i najskuteczniejszy sposób rozwijania tematu.
// W ostatnim takcie zostaje z motywu już tylko ogon, dwie ostatnie nuty.
//
// FORMA: osiem taktów w układzie A-cisza-B-domknięcie, A-cisza-rozwinięcie-ogon.
// Puste takty są celowe: melodia ma się odzywać, a nie grać bez przerwy.
//
// BAS: ostinato, ta sama figura w każdym takcie, zmienia się tylko dźwięk podstawy.
// Ruchomy bas to jedyne, co odróżnia „tło" od „bezruchu".

import { track } from './tracker.js';

const ROWS = 32; // dwa takty po szesnaście szesnastek

// Ostinato: podstawa, powtórzenie, oddech, kwinta, podstawa, oddech.
const ostinato = (root, fifth) => `${root}:4 ${root}:2 r:2 ${fifth}:4 ${root}:2 r:2`;

// Akord rozłożony trzymany trzy czwarte taktu — reszta to cisza na oddech.
const chord = (root, shape) => `${root}^${shape}:12 r:4`;
const MINOR = '0,3,7';
const MAJOR = '0,4,7';

const pattern = (lead, harmony, bass, pad) => ({
  channels: [
    {
      instrument: 'lead',
      volume: 0.20,
      attack: 0.03,
      release: 0.10,
      vibrato: { depth: 0.15, rate: 5.2, delay: 0.24 },
      notes: track(lead, ROWS),
    },
    { instrument: 'harmony', volume: 0.06, attack: 0.01, release: 0.04, notes: track(harmony, ROWS) },
    { instrument: 'bass', volume: 0.30, attack: 0.006, release: 0.05, notes: track(bass, ROWS) },
    { instrument: 'pad', volume: 0.09, attack: 0.45, release: 0.55, notes: track(pad, ROWS) },
  ],
});

export const FORGE_AMBIENT = {
  bpm: 84,
  speed: 6,
  rows: ROWS,
  order: [0, 1, 0, 2],
  patterns: [
    // Am | F — motyw w wersji otwierającej, potem takt ciszy na oddech.
    pattern(
      'E4:3 A4:3 C5:6 B4:4   r:16',
      `${chord('A3', MINOR)} ${chord('F3', MAJOR)}`,
      `${ostinato('A2', 'E2')} ${ostinato('F2', 'C3')}`,
      'A3:14 r:2   F3:14 r:2'
    ),
    // G | Am — ten sam rytm nad innym akordem, a potem domknięcie na tonice.
    pattern(
      'G4:3 B4:3 D5:6 B4:4   E4:3 A4:3 C5:6 A4:4',
      `${chord('G3', MAJOR)} ${chord('A3', MINOR)}`,
      `${ostinato('G2', 'D3')} ${ostinato('A2', 'E2')}`,
      'G3:14 r:2   A3:14 r:2'
    ),
    // C | E — rozwinięcie oktawę wyżej, a na koniec sam ogon motywu nad E-dur,
    // który napięciem ściąga całość z powrotem do a-moll i zapętla bez szwu.
    pattern(
      'G4:3 C5:3 E5:6 C5:4   r:6 B4:6 G#4:4',
      `${chord('C4', MAJOR)} ${chord('E3', MAJOR)}`,
      `${ostinato('C3', 'G2')} ${ostinato('E2', 'B2')}`,
      'C4:14 r:2   E3:14 r:2'
    ),
  ],
};
