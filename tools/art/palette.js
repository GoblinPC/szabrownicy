// Zamknięta paleta świata. Każdy piksel w grze pochodzi stąd.
//
// Zasada cieniowania: cień i światło zostają w obrębie rampy danego materiału,
// a obrys to jej najciemniejszy odcień — nigdy czysta czerń. To sprawia, że kafel
// i postać wyglądają jak z jednego świata, mimo że powstają w innych plikach.
//
// Rampy idą od najciemniejszego (indeks 0) do najjaśniejszego (indeks 4).

export const RAMPS = {
  soot:    ['#14100f', '#1f1a19', '#2e2725', '#453b37', '#5c4f49'], // sadza, węgiel, kowalskie brudy
  stone:   ['#4a423c', '#6b5d54', '#857569', '#a08d7e', '#bda997'], // mur, bruk, skała
  wood:    ['#2a1d15', '#3d2b1f', '#5a3f2b', '#7a5738', '#9c7047'], // belki, beczki, stoły
  earth:   ['#231c15', '#352a20', '#48392b', '#5b4a38', '#6f5c47'], // ubita ziemia placu — chłodniejsza od drewna
  iron:    ['#262b31', '#3a4048', '#545c66', '#767f8c', '#9aa4b0'], // kowadło, broń, okucia
  ember:   ['#7a1f0a', '#c43a0d', '#f2700f', '#ffa524', '#ffe08a'], // żar, ogień, rozgrzany metal
  goblin:  ['#1e3316', '#2f4a22', '#476b30', '#66913f', '#8ab355'], // skóra goblinów
  foliage: ['#14260f', '#1e3a1c', '#33582a', '#4f7a33', '#6b9c45'], // trawa, drzewa, krzaki
  night:   ['#0d1220', '#182238', '#2a3a58', '#445a80', '#5f7aa8'], // chłodne cienie na zewnątrz

  // Rampy interfejsu. Osobne od świata, bo mają inne zadanie: pasek życia musi
  // być **czerwony**, bo to konwencja starsza niż ta gra i nikt nie będzie się
  // jej uczył od nowa.
  //
  // Wszystkie trzy są **przygaszone**. Pierwsza wersja brała życie z rampy
  // `ember` i wyglądała jak neon: barwy o pełnym nasyceniu należą do ognia
  // i błysków, a nie do panelu, na który patrzy się bez przerwy. Odcień
  // zdejmuje się nasyceniem, nie jasnością — przyciemniony jaskrawy kolor
  // dalej jest jaskrawy, tylko ciemny.
  life:    ['#2e1416', '#4d2024', '#7a3236', '#a04a4a', '#c47a74'], // pasek życia
  stamina: ['#16242e', '#22394a', '#365a70', '#527f96', '#7ba5b8'], // wytrzymałość
  food:    ['#2b2113', '#463620', '#6e5630', '#977a45', '#bda06a'], // głód
};

export const ACCENT = {
  copper:    '#b87333', // okucia, klamry, monety
  magic:     '#4fc3f7', // portale, efekty magiczne
  parchment: '#e8dcc0', // tablice, tekst, papier
  bone:      '#fffaf0', // najjaśniejsze rozbłyski, iskry
  blood:     '#8e2233', // chorągwie, akcenty klanu
};

// Kolor otoczenia (mnożony na scenę przez warstwę świetlną).
export const AMBIENT = {
  forge: '#2a1c14', // wnętrze kuźni — ciepły mrok
  yard:  '#182238', // plac na zewnątrz — chłodny zmierzch
};

/** Skrót: `c('wood', 2)` albo `c('copper')`. */
export function c(name, shade) {
  if (shade === undefined) {
    const accent = ACCENT[name];
    if (!accent) throw new Error(`Nieznany kolor akcentu: ${name}`);
    return accent;
  }
  const ramp = RAMPS[name];
  if (!ramp) throw new Error(`Nieznana rampa: ${name}`);
  const value = ramp[shade];
  if (!value) throw new Error(`Rampa ${name} nie ma odcienia ${shade}`);
  return value;
}

/** Cała paleta spłaszczona do listy — używane przez próbnik i walidację. */
export function allColors() {
  const out = [];
  for (const [name, ramp] of Object.entries(RAMPS)) {
    ramp.forEach((hex, i) => out.push({ group: name, index: i, hex }));
  }
  for (const [name, hex] of Object.entries(ACCENT)) {
    out.push({ group: 'accent', index: name, hex });
  }
  return out;
}
