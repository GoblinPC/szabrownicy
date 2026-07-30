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
const SWAY = { tree: 0.022, bush: 0.055, flowers: 0.075 };

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
    this.plants.push({
      sprite,
      amp: SWAY[kind] ?? SWAY.bush,
      // Faza z położenia — sąsiedzi kołyszą się razem, jak pod jednym podmuchem.
      phase: (sprite.x * 0.021 + sprite.y * 0.013) % (Math.PI * 2),
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
        if (s.rotation !== 0) s.rotation = 0;
        continue;
      }
      s.rotation = Math.sin(time * 0.0016 + plant.phase) * plant.amp * breath * gust;
    }
  }
}
