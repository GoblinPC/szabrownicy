// Drobne żywe rzeczy, które pojawiają się po zmroku: świetliki nad trawą i ćmy
// przy ogniu.
//
// Obie są **czystą dekoracją i istnieją tylko u gracza** — serwer o nich nie wie
// i wiedzieć nie musi. Nie da się w nie uderzyć ani na nie nadepnąć, więc nie ma
// czego uzgadniać między graczami; gdyby kiedyś dało się je łapać, przeniosłyby
// się do świata i zaczęły przychodzić w migawce.
//
// Gęstość obu bierze się z jednej liczby — `darkness(phase)` z `world/daylight.js`.
// Dzięki temu nie da się doprowadzić do sytuacji, w której świetliki świecą
// w południe, bo ktoś zapomniał przestawić drugi próg.

// Rampy są zamknięte tak samo jak w grafice: świetlik to najjaśniejszy odcień
// `foliage` rozjaśniony w stronę `ember 4`, ćma to przybrudzona kość.
const FIREFLY_CORE = 0xd8f08a;
const FIREFLY_HALO = 0x8ab355;
const MOTH_WING = 0xbda997;
const MOTH_BODY = 0x6b5d54;

// Świetliki zapalają się dopiero, gdy naprawdę zrobi się ciemno. Próg jest wyższy
// niż zero, bo o zmierzchu nie widać ich blasku — świeciłyby na jasnym tle jak
// zabrudzone piksele.
const FIREFLY_DUSK = 0.55;
const MOTH_DUSK = 0.42;

// Świetlik ma być **ledwie widoczny**. Pełna moc czytała się jako lampka, nie jako
// owad — a robaczek świętojański świeci naprawdę słabo i o to w tym efekcie chodzi:
// ma się go zauważyć kątem oka, nie patrzeć na niego.
const FIREFLY_PEAK = 0.5;
const FIREFLY_FLOOR = 0.14;

const MAX_FIREFLIES = 34;
const MOTHS_PER_FLAME = 3;

// Świetliki trzymamy w prostokącie nieco większym niż widok. Gdyby był równy
// widokowi, każdy ruch kamery wstawiałby nowe owady dokładnie na krawędzi ekranu
// i było by widać, że się „włączają".
const MARGIN = 64;

const lerp = (a, b, k) => a + (b - a) * k;

// Ile świetlików ma się zjawić przy drzewie, a nie gdziekolwiek na otwartym.
// Pierwsza wersja rozsypywała je równo po całym placu i wyglądały jak szum — rój
// czyta się jako coś żywego dopiero wtedy, gdy ma się czego trzymać.
const NEAR_TREE = 0.65;
const TREE_SPREAD = 30;

export class Critters {
  /**
   * @param scene scena świata
   * @param world wynik `buildWorld()`
   * @param tile rozmiar kafla w pikselach
   * @param building prostokąt budynku — pod dachem świetlików nie ma
   */
  constructor(scene, world, tile, building) {
    this.scene = scene;
    this.world = world;
    this.tile = tile;
    this.building = building;

    // Świetliki trzymają się drzew. Trawy na mapie jest 68 kafli i to w dwóch
    // wąskich zaułkach za kuźnią — reguła „tylko nad trawą" brzmiała ładnie,
    // ale na placu, czyli tam, gdzie gracz stoi, nie dałaby ani jednego owada.
    this.trees = world.props.filter((p) => p.key === 'tree');

    this.fireflies = [];
    this.moths = [];

    // Świetliki rysujemy **nad maską światła** (9000), bo mają świecić własnym
    // światłem. Pod maską nocny mnożnik przygasiłby je razem z resztą świata
    // i zostałyby po nich ledwie widoczne zielonkawe kropki.
    this.glow = scene.add.graphics().setDepth(9100);

    // Ćmy odwrotnie: są ciemne i mają być **oświetlone ogniem**, więc idą pod
    // maskę. Przy okazji znikają razem z placem, gdy gracz wejdzie do hali —
    // za darmo, bo tym zajmuje się już warstwa widoczności.
    this.dust = scene.add.graphics().setDepth(8000);

    for (const flame of world.flames) {
      for (let i = 0; i < MOTHS_PER_FLAME; i++) {
        this.moths.push({
          flame,
          angle: Math.random() * Math.PI * 2,
          speed: 1.1 + Math.random() * 1.5,
          radius: 12 + Math.random() * 16,
          radiusPhase: Math.random() * Math.PI * 2,
          bob: Math.random() * Math.PI * 2,
          // Ćma nie krąży równo. Co chwilę szarpie w bok i wraca — bez tego
          // wygląda jak kropka na orbicie, czyli jak planeta, nie jak owad.
          jitterAt: 0,
          jitterX: 0,
          jitterY: 0,
        });
      }
    }
  }

  /**
   * Czy w tym punkcie może się zjawić świetlik: otwarty teren na zewnątrz hali.
   *
   * Pytamy o siatkę kolizji, a nie o nazwę kafla. `surfaceAt` odpowiada za dźwięk
   * kroków i wszystko, czego nie zna, nazywa ziemią — także skałę, po której nikt
   * nie chodzi. Świetliki wychodziłyby wtedy ze zbocza.
   */
  canSpawn(x, y) {
    const tx = Math.floor(x / this.tile);
    const ty = Math.floor(y / this.tile);
    const row = this.world.solid[ty];
    if (!row || row[tx] !== false) return false;
    const b = this.building;
    return !(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }

  /** Nowy świetlik: najczęściej przy drzewie, czasem gdziekolwiek na otwartym. */
  spawnFirefly(view) {
    const near = this.trees.filter((t) =>
      t.x > view.x - MARGIN && t.x < view.right + MARGIN
      && t.y > view.y - MARGIN && t.y < view.bottom + MARGIN);

    for (let attempt = 0; attempt < 6; attempt++) {
      let x;
      let y;
      if (near.length && Math.random() < NEAR_TREE) {
        const tree = near[Math.floor(Math.random() * near.length)];
        x = tree.x + (Math.random() - 0.5) * 2 * TREE_SPREAD;
        // W górę bardziej niż w dół — świetliki krążą wokół korony, a `y` propa
        // to jego podstawa.
        y = tree.y - Math.random() * TREE_SPREAD * 1.4 + 6;
      } else {
        x = view.x - MARGIN + Math.random() * (view.width + MARGIN * 2);
        y = view.y - MARGIN + Math.random() * (view.height + MARGIN * 2);
      }
      if (!this.canSpawn(x, y)) continue;
      this.fireflies.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 9,
        vy: (Math.random() - 0.5) * 6,
        // Każdy błyska we własnym rytmie. Wspólny dałby stroboskop, a to zjawisko
        // z zupełnie innej bajki.
        blink: Math.random() * Math.PI * 2,
        blinkSpeed: 1.5 + Math.random() * 1.1,
        bob: Math.random() * Math.PI * 2,
        life: 6 + Math.random() * 10,
      });
      return;
    }
  }

  /**
   * @param dt sekundy
   * @param night `darkness(phase)` — 0 w południe, 1 w nocy
   * @param inside czy gracz stoi w budynku
   */
  update(dt, time, night, inside) {
    this.updateFireflies(dt, time, night, inside);
    this.updateMoths(dt, time, night);
  }

  updateFireflies(dt, time, night, inside) {
    this.glow.clear();

    // W budynku świetlików nie ma i nie może być: rysujemy je nad maską światła,
    // więc przeświecałyby przez ścianę, mimo że placu stąd nie widać.
    const strength = inside ? 0 : Math.max(0, (night - FIREFLY_DUSK) / (1 - FIREFLY_DUSK));
    const target = Math.round(MAX_FIREFLIES * strength);
    const view = this.scene.cameras.main.worldView;

    // Dochodzą po jednym na klatkę, a nie wszystkie naraz — o zmierzchu mają się
    // zapalać stopniowo, tak jak naprawdę.
    if (this.fireflies.length < target) this.spawnFirefly(view);

    for (let i = this.fireflies.length - 1; i >= 0; i--) {
      const f = this.fireflies[i];
      f.life -= dt;

      // Bezwładny błąd losowy: kierunek zmienia się powoli, więc lot jest
      // leniwy, a nie drgający.
      f.vx = lerp(f.vx, (Math.random() - 0.5) * 14, dt * 0.9);
      f.vy = lerp(f.vy, (Math.random() - 0.5) * 9, dt * 0.9);
      f.x += f.vx * dt;
      f.y += f.vy * dt + Math.sin(time * 0.002 + f.bob) * 3 * dt;

      const gone = f.life <= 0
        || f.x < view.x - MARGIN * 1.5 || f.x > view.right + MARGIN * 1.5
        || f.y < view.y - MARGIN * 1.5 || f.y > view.bottom + MARGIN * 1.5;
      if (gone || this.fireflies.length > target + 6) {
        this.fireflies.splice(i, 1);
        continue;
      }

      // Błysk: krótki rozbłysk i długa przerwa. Zwykła sinusoida daje równomierne
      // pulsowanie, które czyta się jak dioda — stąd potęga, która spłaszcza
      // dolinę i zostawia sam szczyt. `FIREFLY_FLOOR` zostawia po świetliku ślad
      // także między błyskami: bez niego rój znika co chwilę w całości i widać,
      // że to jeden wspólny efekt, a nie kilkadziesiąt osobnych owadów.
      f.blink += dt * f.blinkSpeed;
      const pulse = FIREFLY_FLOOR + (1 - FIREFLY_FLOOR) * Math.max(0, Math.sin(f.blink)) ** 3;

      const alpha = pulse * FIREFLY_PEAK * Math.min(1, strength * 1.4);
      const x = Math.round(f.x);
      const y = Math.round(f.y);

      // Poświata z pikseli, nie z koła.
      //
      // Pierwsza wersja miała `fillCircle` o promieniu 3,5 px i to był błąd nie
      // do obronienia: Phaser wygładza okręgi, więc przy `pixelArt: true` wychodzi
      // gładka kulka obok świata złożonego z twardych pikseli. Z daleka czytało
      // się to jako mrygające kółka, a nie jako owady. Krzyż z czterech pikseli
      // trzyma się siatki i jest ledwie widoczny — o to chodziło.
      this.glow.fillStyle(FIREFLY_HALO, alpha * 0.22);
      this.glow.fillRect(x - 1, y, 1, 1);
      this.glow.fillRect(x + 1, y, 1, 1);
      this.glow.fillRect(x, y - 1, 1, 1);
      this.glow.fillRect(x, y + 1, 1, 1);
      this.glow.fillStyle(FIREFLY_CORE, alpha);
      this.glow.fillRect(x, y, 1, 1);
    }
  }

  updateMoths(dt, time, night) {
    this.dust.clear();
    const strength = Math.max(0, (night - MOTH_DUSK) / (1 - MOTH_DUSK));
    if (strength <= 0.02) return;

    const view = this.scene.cameras.main.worldView;

    for (const m of this.moths) {
      const flame = m.flame;
      if (flame.x < view.x - 80 || flame.x > view.right + 80
        || flame.y < view.y - 80 || flame.y > view.bottom + 80) continue;

      m.angle += m.speed * dt;
      // Promień oddycha, więc ćma raz podlatuje do ognia, raz się cofa.
      const radius = m.radius + Math.sin(time * 0.0013 + m.radiusPhase) * 7;

      if (time > m.jitterAt) {
        m.jitterAt = time + 90 + Math.random() * 260;
        m.jitterX = (Math.random() - 0.5) * 7;
        m.jitterY = (Math.random() - 0.5) * 5;
      }

      const x = Math.round(flame.x + Math.cos(m.angle) * radius + m.jitterX);
      const y = Math.round(flame.y - 10 + Math.sin(m.angle) * radius * 0.45
        + Math.sin(time * 0.004 + m.bob) * 2 + m.jitterY);

      // Skrzydła: dwa piksele, których szerokość zmienia się z machnięciem.
      // Cały owad ma trzy piksele — więcej i przestaje być ćmą, a zaczyna być
      // ptakiem.
      const flap = Math.abs(Math.sin(time * 0.021 + m.bob));
      const span = flap > 0.5 ? 1 : 0;

      this.dust.fillStyle(MOTH_WING, 0.85 * strength);
      this.dust.fillRect(x - 1 - span, y, 1 + span, 1);
      this.dust.fillRect(x + 1, y, 1 + span, 1);
      this.dust.fillStyle(MOTH_BODY, 0.9 * strength);
      this.dust.fillRect(x, y, 1, 1);
    }
  }
}
