// Deszcz.
//
// Trzy warstwy, bo sam padający deszcz nie wygląda jak deszcz:
//
// 1. **Krople** — krótkie kreski lecące skosem. Rysowane **nad maską światła**,
//    bo padają między okiem a światem; gdyby szły pod maskę, w nocy zniknęłyby
//    razem z placem, mimo że w prawdziwej ulewie deszcz widać właśnie najlepiej.
// 2. **Pryśnięcia** — ślad w miejscu, gdzie kropla trafiła w ziemię. To one
//    przywiązują deszcz do gruntu. Bez nich krople przelatują przez obraz jak
//    tapeta puszczona przed kamerą i widać, że nic nie dotyka świata.
// 3. **Przygaszenie i kolor** — po stronie `lighting.js`, bo to ta sama maska.
//
// Pryśnięcia idą **pod maskę**, więc ogień je podświetla i przy palenisku deszcz
// dostaje ciepły kant. To jedyny powód, dla którego są osobnym rysunkiem.

const DROP_COLOR = 0xb8c8e0;
const SPLASH_COLOR = 0xd0dcec;

const MAX_DROPS = 300;

// Skos kropli: ile pikseli w bok na jeden piksel w dół. Pion wygląda jak firanka,
// a zbyt duży skos jak zamieć — jedna piąta czyta się jako wiatr.
const SLANT = 0.2;

// Krople lądują na różnych głębokościach kadru, nie na jednej linii. W rzucie 3/4
// każdy piksel w dół to zarazem „dalej", więc kropla musi mieć własne dno.
//
// `FALL_MIN` to zapas pod dolną krawędzią kadru — bez niego ostatnie kilkanaście
// pikseli ekranu byłoby suche, bo żadna kropla nie miałaby tam dna.
const FALL_MIN = 40;
const FALL_SPAN = 210;

const SPLASH_MS = 190;

export class Rain {
  constructor(scene) {
    this.scene = scene;
    this.drops = [];
    this.splashes = [];
    this.level = 0;

    this.sheet = scene.add.graphics().setDepth(9200);
    this.ground = scene.add.graphics().setDepth(7900);
  }

  spawn(view, above = true) {
    // Dno kropli losujemy **z wysokości kadru**, a nie od miejsca startu.
    //
    // Pierwsza wersja dawała `landY = start + 40..250`, a krople startowały nad
    // górną krawędzią — więc najniższy punkt, w jaki mogły trafić, wypadał gdzieś
    // w trzech czwartych ekranu i **dolny pas nigdy nie dostawał deszczu**.
    // Liczone od kadru każda kropla ma własną głębokość i pada wszędzie.
    const landY = view.y + Math.random() * (view.height + FALL_MIN);
    // Kropla w locie zaczyna gdzieś nad swoim dnem, żeby po wyjściu z hali deszcz
    // nie zjeżdżał falą z góry ekranu.
    const y = above
      ? view.y - 20 - Math.random() * 160
      : landY - 20 - Math.random() * FALL_SPAN;
    return {
      x: view.x - 60 + Math.random() * (view.width + 160),
      y,
      // Szybsze krople są dłuższe — to ta sama zasada co przy rozmyciu ruchu
      // i bez niej wszystkie wyglądają jakby leciały z jedną prędkością.
      speed: 300 + Math.random() * 240,
      landY,
    };
  }

  /**
   * @param dt sekundy
   * @param rain 0–1, siła opadu
   * @param inside czy gracz stoi pod dachem
   */
  update(dt, rain, inside) {
    this.sheet.clear();
    this.ground.clear();

    // Pod dachem deszczu nie rysujemy w ogóle. Krople idą nad maską światła, więc
    // w hali przeświecałyby przez dach — a hala to jedyne miejsce, w którym gracz
    // ma poczuć, że jest sucho.
    const target = inside ? 0 : rain;
    // Do zera dochodzimy szybciej niż do pełnej siły: wejście pod dach ma odciąć
    // deszcz od razu, a ulewa ma narastać.
    this.level += (target - this.level) * Math.min(1, dt * (target > this.level ? 1.6 : 9));
    if (this.level < 0.01 && this.drops.length === 0 && this.splashes.length === 0) return;

    const view = this.scene.cameras.main.worldView;
    const want = Math.round(MAX_DROPS * this.level);

    // Przy pierwszym uzupełnianiu rozstawiamy krople na całej wysokości kadru,
    // a nie tylko nad nim. Inaczej po wyjściu z hali widać, jak fala deszczu
    // zjeżdża z góry ekranu.
    const seeding = this.drops.length === 0 && want > 0;
    while (this.drops.length < want) this.drops.push(this.spawn(view, !seeding));
    if (this.drops.length > want) this.drops.length = want;

    const wind = SLANT * (0.8 + 0.35 * Math.sin(this.scene.time.now * 0.0004));
    this.sheet.lineStyle(1, DROP_COLOR, 0.34 + 0.2 * this.level);

    for (const drop of this.drops) {
      const step = drop.speed * dt;
      drop.y += step;
      drop.x += step * wind;

      if (drop.y >= drop.landY) {
        this.splashes.push({ x: drop.x, y: drop.landY, at: this.scene.time.now });
        Object.assign(drop, this.spawn(view));
        continue;
      }

      // Kropla, która wyszła bokiem, wraca na drugą stronę kadru — taniej niż
      // liczyć ją dalej poza ekranem.
      if (drop.x > view.right + 60) drop.x -= view.width + 120;
      if (drop.x < view.x - 60) drop.x += view.width + 120;

      const len = drop.speed * 0.022;
      this.sheet.lineBetween(drop.x, drop.y, drop.x - len * wind, drop.y - len);
    }

    const now = this.scene.time.now;
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      const k = (now - s.at) / SPLASH_MS;
      if (k >= 1) {
        this.splashes.splice(i, 1);
        continue;
      }
      // Pierścień rozchodzi się i gaśnie. Dwa piksele po bokach zamiast koła:
      // przy kaflu 16×16 okrąg o promieniu trzech pikseli to już kałuża.
      const spread = Math.round(k * 3);
      const alpha = (1 - k) * 0.5;
      this.ground.fillStyle(SPLASH_COLOR, alpha);
      this.ground.fillRect(Math.round(s.x) - spread, Math.round(s.y), 1, 1);
      this.ground.fillRect(Math.round(s.x) + spread, Math.round(s.y), 1, 1);
      if (k < 0.4) this.ground.fillRect(Math.round(s.x), Math.round(s.y) - 1, 1, 1);
    }
  }
}
