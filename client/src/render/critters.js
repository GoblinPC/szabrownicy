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

// --- Dzień ---------------------------------------------------------------------
//
// Świetliki i ćmy pilnują nocy, ale w dzień świat znowu stał w miejscu. Trzy
// warstwy, każda o innym torze ruchu — bo gdyby wszystkie latały tak samo, byłby
// to jeden efekt powielony trzy razy:
//
//   pyłki   — dryfują powoli i **bez celu**, jak kurz w słupie światła,
//   motyle  — szarpią się skokami i krążą nad kwiatami,
//   ptaki   — przelatują przez kadr **na wylot**, wysoko, i znikają.
//
// Ptaki są tu najważniejsze, choć najrzadsze: to jedyna rzecz, która przecina
// cały ekran. Ruch przez cały kadr czyta się jako „świat jest większy niż to,
// co widzę" — a o to w tym lesie chodzi.

const MOTE_COLOR = 0xf5e6c8;
const BUTTERFLY_WING = 0xffe08a;
const BUTTERFLY_DARK = 0x7a5738;
const BIRD_COLOR = 0x2e2725;

const MAX_MOTES = 40;
const MAX_BUTTERFLIES = 7;
const MAX_BIRDS = 3;
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

    // Wszystko, co lata za dnia: pylki, motyle i ptaki. Nad maska swiatla, bo
    // sa jasne i maja byc widoczne; ptaki i tak sa tlem, nie celem.
    this.air = scene.add.graphics().setDepth(9150);
    this.motes = [];
    this.butterflies = [];
    this.birds = [];

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
    this.updateDay(dt, time, night, inside);
  }

  /** Pyłki, motyle i ptaki — wszystko, co lata za dnia. */
  updateDay(dt, time, night, inside) {
    this.air.clear();
    // Siła dnia: odwrotność mroku. Pyłki i motyle znikają razem ze światłem,
    // bo w ciemności i tak nie byłoby ich widać, a ptaki idą spać.
    const day = Math.max(0, 1 - night * 1.25);
    if (day <= 0.02 || inside) return;

    const view = this.scene.cameras.main.worldView;
    this.updateMotes(dt, time, day, view);
    this.updateButterflies(dt, time, day, view);
    this.updateBirds(dt, day, view);
  }

  /**
   * Pyłki — kurz i nasiona w powietrzu.
   *
   * Dryfują **bez celu i bardzo wolno**, a jasność pulsuje: raz łapią światło,
   * raz gasną. To one najtaniej robią wrażenie, że powietrze jest ośrodkiem,
   * a nie pustką między obiektami.
   */
  updateMotes(dt, time, day, view) {
    const want = Math.round(MAX_MOTES * day);
    while (this.motes.length < want) {
      this.motes.push({
        x: view.x + Math.random() * view.width,
        y: view.y + Math.random() * view.height,
        vx: (Math.random() - 0.5) * 7,
        vy: -2 - Math.random() * 5,          // lekko w górę: kurz się unosi
        phase: Math.random() * Math.PI * 2,
        size: Math.random() < 0.25 ? 2 : 1,
      });
    }
    if (this.motes.length > want) this.motes.length = want;

    for (const m of this.motes) {
      m.vx += (Math.random() - 0.5) * 6 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // Zawracamy na drugą stronę kadru zamiast tworzyć nowe — pyłek, który
      // znika i pojawia się gdzie indziej, wygląda jak błąd rysowania.
      if (m.x < view.x - 12) m.x = view.right + 12;
      if (m.x > view.right + 12) m.x = view.x - 12;
      if (m.y < view.y - 12) m.y = view.bottom + 12;

      const glow = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.0012 + m.phase));
      this.air.fillStyle(MOTE_COLOR, glow * day);
      this.air.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
    }
  }

  /**
   * Motyle — krążą nad kwiatami i **szarpią się skokami**.
   *
   * Tor liczony jak u ćmy, ale z ostrym trzepotem: motyl nie leci po łuku, tylko
   * podskakuje. Gładki lot czytałby się jak ptak, nie jak motyl.
   */
  updateButterflies(dt, time, day, view) {
    const want = Math.round(MAX_BUTTERFLIES * day);
    while (this.butterflies.length < want) {
      this.butterflies.push({
        x: view.x + Math.random() * view.width,
        y: view.y + Math.random() * view.height,
        angle: Math.random() * Math.PI * 2,
        speed: 16 + Math.random() * 22,
        turnAt: 0,
        bob: Math.random() * Math.PI * 2,
      });
    }
    if (this.butterflies.length > want) this.butterflies.length = want;

    for (const b of this.butterflies) {
      if (time > b.turnAt) {
        b.turnAt = time + 180 + Math.random() * 600;
        b.angle += (Math.random() - 0.5) * 2.4;
      }
      b.x += Math.cos(b.angle) * b.speed * dt;
      // Podskok: ruch w pionie ma własny, szybszy rytm niż lot w poziomie.
      b.y += Math.sin(b.angle) * b.speed * 0.6 * dt + Math.sin(time * 0.02 + b.bob) * 26 * dt;

      if (b.x < view.x - 20 || b.x > view.right + 20
        || b.y < view.y - 20 || b.y > view.bottom + 20) {
        b.x = view.x + Math.random() * view.width;
        b.y = view.y + Math.random() * view.height;
      }

      const x = Math.round(b.x);
      const y = Math.round(b.y);
      // Skrzydła otwarte i zamknięte — dwa piksele różnicy, a widać trzepot.
      const open = Math.sin(time * 0.028 + b.bob) > 0;
      this.air.fillStyle(BUTTERFLY_WING, 0.9 * day);
      if (open) {
        this.air.fillRect(x - 2, y, 2, 1);
        this.air.fillRect(x + 1, y, 2, 1);
      } else {
        this.air.fillRect(x - 1, y - 1, 1, 2);
        this.air.fillRect(x + 1, y - 1, 1, 2);
      }
      this.air.fillStyle(BUTTERFLY_DARK, 0.9 * day);
      this.air.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Ptaki — sylwetki przelatujące **przez cały kadr**.
   *
   * Nie krążą i nie zawracają: wlatują z jednej strony, wylatują z drugiej.
   * Właśnie to, że przecinają cały ekran, daje wrażenie, że świat sięga dalej
   * niż widok. Rysowane wysoko i nie rzucają cienia — są tłem, nie celem.
   */
  updateBirds(dt, day, view) {
    if (this.birds.length < MAX_BIRDS && Math.random() < 0.004 * day) {
      const fromLeft = Math.random() < 0.5;
      this.birds.push({
        x: fromLeft ? view.x - 40 : view.right + 40,
        y: view.y + 20 + Math.random() * view.height * 0.5,
        vx: (fromLeft ? 1 : -1) * (34 + Math.random() * 26),
        vy: (Math.random() - 0.5) * 10,
        flap: Math.random() * Math.PI * 2,
        span: 2 + Math.round(Math.random()),
      });
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.flap += dt * 9;

      if (b.x < view.x - 80 || b.x > view.right + 80) {
        this.birds.splice(i, 1);
        continue;
      }

      // Sylwetka jak litera „v": dwa skrzydła, których kąt zmienia się z machnięciem.
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      const lift = Math.sin(b.flap) > 0 ? -1 : 1;
      this.air.fillStyle(BIRD_COLOR, 0.75 * day);
      for (let s = 1; s <= b.span; s++) {
        this.air.fillRect(x - s, y + lift * s, 1, 1);
        this.air.fillRect(x + s, y + lift * s, 1, 1);
      }
      this.air.fillRect(x, y, 1, 1);
    }
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

