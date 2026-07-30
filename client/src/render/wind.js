// Wiatr w roślinności.
//
// Powstało z jednej uwagi użytkownika, która była trafna i którą łatwo zbagatelizować:
// „jest nasrane dużo wszystkiego, ale to nadal nie wygląda, bo nie żyje — wszystko
// stoi w miejscu". **Liczba obiektów nie zastępuje ruchu.** Las z tysiąca
// nieruchomych drzew jest tapetą; ten sam las, w którym korony chodzą, jest lasem.
//
// Kołysanie to obrót wokół **podstawy** — tak samo jak przy trawie. Pień stoi,
// korona się chyla. Przesuwanie całego sprite'a wygląda jak ślizganie się drzewa
// po ziemi.
//
// Dwie rzeczy, przez które to jest tanie mimo dwóch tysięcy krzaków:
//
// 1. **Ruszamy wyłącznie tym, co widać.** Reszta stoi i nikogo to nie kosztuje.
// 2. Faza kołysania bierze się z **położenia**, a nie z losowania na obiekt —
//    więc nie trzeba jej nigdzie trzymać, a sąsiednie krzaki chylą się razem,
//    jakby przechodził przez nie ten sam podmuch.

// Ile radianów wychylenia przy pełnym wietrze. Drzewo mniej niż krzak: ma
// grubszy pień i większą bezwładność, a przy dużym wychyleniu korona odjeżdża
// od pnia i widać, że to obrót obrazka.
// Ile radianów wychylenia przy pełnym wietrze.
//
// **Krzak prawie nie kołysze się w całości** i to jest naprawa realnego błędu:
// obracany jak drzewo wyglądał jak galareta. Powód jest fizyczny — u drzewa
// obraca się sama korona, a gruby pień stoi, więc obrót całego sprite'a jest
// dobrym przybliżeniem. Krzak jest niską kulą liści przy samej ziemi: obrót
// całości przesuwa jego **podstawę**, a to czyta się jak pełzanie, nie jak wiatr.
// Zostaje mu ledwie wyczuwalne drgnienie i lekkie oddychanie szerokością.
//
// Kwiaty za to mogą się chylić mocno: to cienkie łodygi i one naprawdę kładą się
// na wietrze.
const SWAY = { tree: 0.026, bush: 0.008, flowers: 0.09 };

// O ile wolno albo szybko może się kołysać pojedyncza roślina.
//
// **Jedno tempo dla wszystkiego wygląda tragicznie** — cały las oddycha wtedy
// jak jeden organizm i widać, że to pętla. Każda roślina dostaje własny mnożnik
// prędkości, wyliczony z położenia, więc sąsiedzi idą podobnie, ale nie identycznie.
const TEMPO = [0.55, 1.7];

// Margines poza kadrem — obiekty tuż za krawędzią też kołyszemy, żeby nie było
// widać, jak zaczynają się ruszać przy wjeżdżaniu w kadr.
const MARGIN = 48;

export class Wind {
  constructor(scene) {
    this.scene = scene;
    this.plants = [];
  }

  /** @param kind `tree`, `bush` albo `flowers` — decyduje o sile wychylenia. */
  add(sprite, kind) {
    // Zaczepienie u podstawy: obrót ma iść wokół nasady, nie wokół środka.
    sprite.setOrigin(0.5, 1);
    // Ziarno z położenia: powtarzalne, a przy tym różne dla każdej rośliny.
    // Bez trzymania czegokolwiek w pamięci i bez losowania przy tworzeniu.
    const seed = Math.abs(Math.sin(sprite.x * 12.9898 + sprite.y * 78.233) * 43758.5453) % 1;
    this.plants.push({
      sprite,
      kind,
      amp: (SWAY[kind] ?? SWAY.bush) * (0.7 + seed * 0.6),
      // Faza z położenia — sąsiedzi kołyszą się podobnie, jak pod jednym podmuchem.
      phase: (sprite.x * 0.021 + sprite.y * 0.013) % (Math.PI * 2),
      tempo: TEMPO[0] + seed * (TEMPO[1] - TEMPO[0]),
      baseScaleX: sprite.scaleX,
    });
  }

  /**
   * @param time czas sceny w ms
   * @param gust 0–1: siła wiatru. Deszcz ją podnosi — burza ma wyglądać na burzę.
   */
  update(time, gust = 1) {
    const view = this.scene.cameras.main.worldView;
    const x0 = view.x - MARGIN;
    const x1 = view.right + MARGIN;
    const y0 = view.y - MARGIN;
    const y1 = view.bottom + MARGIN;

    // Podmuch jako suma dwóch niewspółmiernych fal — ta sama sztuczka co przy
    // migotaniu ognia. Wiatr nigdy nie łapie słyszalnego rytmu.
    const breath = 0.65 + 0.35 * Math.sin(time * 0.0007) + 0.2 * Math.sin(time * 0.00023);

    for (const plant of this.plants) {
      const s = plant.sprite;
      if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) {
        // Poza kadrem prostujemy raz i zostawiamy w spokoju.
        if (s.rotation !== 0) { s.rotation = 0; s.scaleX = plant.baseScaleX; }
        continue;
      }

      // **Własne tempo każdej rośliny.** Przy wspólnym cały las oddycha jak jeden
      // organizm i od razu widać, że to pętla.
      const t = time * 0.0016 * plant.tempo + plant.phase;
      s.rotation = Math.sin(t) * plant.amp * breath * gust;

      // Krzak zamiast obrotu dostaje **oddychanie szerokością**: rozszerza się
      // i zwęża o ułamek. Podstawa zostaje na miejscu, rusza się sama masa liści —
      // a to jest dokładnie ta część, która ma się ruszać.
      if (plant.kind === 'bush') {
        s.scaleX = plant.baseScaleX * (1 + Math.sin(t * 1.3) * 0.045 * breath * gust);
      }
    }
  }
}
