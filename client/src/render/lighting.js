// Warstwa świetlna.
//
// Maskę światła rysujemy na małym płótnie 2D (jeden piksel maski = 2 piksele
// świata) i rozciągamy na widok kamery w trybie mnożenia. Przy tej rozdzielczości
// kilkanaście gradientów na klatkę nic nie kosztuje, a rozmycie przy skalowaniu
// daje miękki spadek światła, którego nie da się uzyskać samymi pikselami.
//
// Kolor otoczenia zależy od tego, gdzie patrzy kamera: wnętrze hali dostaje
// ciepły mrok, plac barwę nieba o danej porze doby. Kontrast między nimi jest tym,
// co sprzedaje przejście przez bramę.

import { skyColor, darkness } from '../world/daylight.js';

const RESOLUTION = 2; // piksele świata na jeden piksel maski

// Ciepły mrok hali — wartość dzienna. Wnętrze zmienia się z dobą znacznie mniej
// niż plac, bo oświetla je palenisko, a nie niebo: przez bramę i okna wpada tyle
// światła, żeby było widać różnicę, ale hala nigdy nie robi się jasna.
// Podniesione ze 122,96,84 po zgłoszeniu z gry: *strasznie ciemno jest w tej
// karczmie, niby klimat, ale aż oczy bolą*. Ciemne wnętrze ma być **nastrojem,
// a nie przeszkodą** — gracz spędza tu czas przy kowadle i przy ladzie, więc
// musi widzieć, co robi. Ciepły odcień zostaje, bo to on niesie klimat; rośnie
// sama jasność.
export const AMBIENT_FORGE = [158, 126, 108];
export const FORGE_NIGHT = 0.8;  // ile zostaje z tej jasności w środku nocy

// Ile mocy zostaje pochodni w samo południe. Zero wygląda źle — pochodnia jednak
// się pali i widać ją po ciepłym odcieniu na murze; pełna moc w dzień wygląda
// jeszcze gorzej, bo płomień świeci mocniej niż słońce.
export const TORCH_DAY = 0.34;

// Ile zostaje z winiety w samo południe. Zero jest kuszące, ale wtedy kadr traci
// obramowanie i robi się płaski — chodzi o to, żeby w dzień nie było widać, że
// rogi są przygaszone, a nie żeby ich nie przygaszać wcale.
export const VIGNETTE_DAY = 0.3;

// Od jakiej odległości od okna cokolwiek przez nie widać. Przy 40 px, czyli
// dwóch i pół kafla, klin jest pełny; od 150 px w górę okno nie pokazuje nic.
// Liczby dobrane pod to, jak stoi się przy oknie w tej grze: kafel ma 16 px,
// więc pełna widoczność zaczyna się mniej więcej wtedy, gdy postać jest już
// przy ścianie.
const WINDOW_NEAR = 40;
const WINDOW_FAR = 150;

// Deszcz nie tylko przygasza — **zabiera kolor**. Sama ciemniejsza wersja tego
// samego nieba wygląda jak wieczór, nie jak ulewa; dopiero zjazd w stronę szarości
// czyta się jako chmury. Stąd dwa ruchy naraz: mniej jasności i mniej nasycenia.
const RAIN_DIM = 0.42;   // ile jasności zabiera pełna ulewa
const RAIN_GREY = 0.65;  // ile koloru zabiera pełna ulewa

/** Niebo przykryte chmurami: ciemniejsze i wyprane z barwy. */
export function overcast([r, g, b], rain) {
  if (rain <= 0.001) return [r, g, b];
  const grey = (r + g + b) / 3;
  const dim = 1 - RAIN_DIM * rain;
  const wash = RAIN_GREY * rain;
  return [
    Math.round((r + (grey - r) * wash) * dim),
    Math.round((g + (grey - g) * wash) * dim),
    Math.round((b + (grey - b) * wash) * dim),
  ];
}

export class Lighting {
  constructor(scene, world, interior, building = interior) {
    this.scene = scene;
    this.world = world;
    this.interior = interior;
    // Obrys budynku razem z murami — po nim tniemy widoczność. Różni się od
    // `interior`, który opisuje samą podłogę hali i steruje kolorem otoczenia.
    this.building = building;
    this.key = 'lightmask';
    this.texture = null;
    this.width = 0;
    this.height = 0;

    this.image = scene.add.image(0, 0, '__WHITE')
      .setOrigin(0, 0)
      .setDepth(9000)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  ensureSize(w, h) {
    if (this.width === w && this.height === h) return;
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    this.texture = this.scene.textures.createCanvas(this.key, w, h);
    // Płótno pomocnicze na przygaszanie — nie trafia do gry, służy tylko do
    // złożenia maski widoczności przed nałożeniem jej na scenę.
    this.occlusion = document.createElement('canvas');
    this.occlusion.width = w;
    this.occlusion.height = h;
    // Wygładzanie jest tu pożądane — chcemy miękką plamę światła, nie kwadraty.
    this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.image.setTexture(this.key);
    this.width = w;
    this.height = h;
  }

  /**
   * Przygasza wszystko poza budynkiem. Używane, gdy gracz stoi w hali: plac za
   * murem ma zniknąć w mroku, tak jak w prawdziwym wnętrzu nie widać, co dzieje
   * się na dworze.
   *
   * Krawędź jest rozmyta pasem gradientu. Ostry prostokąt czytał się jak błąd
   * renderowania — to była znana wada tej warstwy jeszcze przy samym ambiencie.
   */
  occlude(ctx, w, h, box, strength, player, toMaskX, toMaskY) {
    if (strength <= 0.01) return;

    // Rysujemy na osobnym płótnie: najpierw zaciemniamy wszystko, potem
    // **wycinamy** to, co widać. Tylko tak da się wyciąć klin przez okno —
    // przy rysowaniu wprost na maskę można by dokładać ciemność, ale nie
    // odejmować jej wybiórczo.
    const o = this.occlusion.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.globalCompositeOperation = 'source-over';
    o.fillStyle = `rgba(10,8,16,${(0.92 * strength).toFixed(3)})`;
    o.fillRect(0, 0, w, h);

    o.globalCompositeOperation = 'destination-out';

    // 1. Wnętrze budynku — widać całe.
    //
    // Rozmycie krawędzi idzie do WNĘTRZA, nie na zewnątrz. Wersja rozszerzająca
    // prostokąt odsłaniała kilka pikseli za ścianą i przez to zza karczmy
    // wystawał pas trawy. Najszerszy wycięty prostokąt kończy się dokładnie
    // na linii murów.
    // Najszerszy wycięty prostokąt kończy się **piksel maski przed licem muru**,
    // a nie na nim. Powód jest w wygładzaniu: maska jest rozciągana dwukrotnie
    // przez filtr liniowy (miękkie plamy ognia są tego warte), więc na każdej
    // granicy powstaje przejście szerokie na dwa piksele świata — po jednym na
    // stronę. Przy cięciu dokładnie na licu ten jeden piksel wypadał **za murem**
    // i dostawał domieszkę światła wnętrza: zgłoszone z gry jako *pasek na
    // wielkość piksela na zewnątrz*, na dolnej ścianie widoczny na stałe, bo tam
    // spód muru jest najciemniejszy i kontrast największy.
    //
    // Cofnięcie o jeden piksel maski przesuwa całe przejście na mur, gdzie i tak
    // leży najciemniejszy rząd kafla. To ta sama zasada, co przy rozmyciu:
    // **do wnętrza, nigdy na zewnątrz**.
    const EDGE = 1;
    const steps = 3;
    const stepPx = 4 / RESOLUTION;
    for (let i = steps; i >= 0; i--) {
      const inset = EDGE + i * stepPx;
      o.fillStyle = `rgba(0,0,0,${(0.4 + 0.6 * (1 - i / (steps + 1))).toFixed(3)})`;
      o.fillRect(
        box.x0 + inset, box.y0 + inset,
        Math.max(0, (box.x1 - box.x0) - inset * 2),
        Math.max(0, (box.y1 - box.y0) - inset * 2)
      );
    }

    // 2. Klin widoczności przez każdy otwór.
    //
    // Geometria jest ta sama co przy rzucaniu cienia, tylko odwrócona: promienie
    // biegną od gracza przez oba końce otworu i dalej. To, co między nimi, widać.
    //
    // Sam klin to jednak za mało i pierwsza wersja wyglądała źle z trzech powodów
    // naraz, wszystkich wskazanych przez użytkownika: krawędzie były **ostre jak
    // nożyczki**, wszystkie okna działały **z każdej odległości**, a przez to cały
    // plac migotał wachlarzami przy każdym kroku. Trzy poprawki, po jednej na każdy:
    //
    // 1. **Rozmycie** — klin rysujemy przez filtr, więc boki są miękkie.
    // 2. **Zanik z odległością od okna** — światło wpadające przez okno nie oświetla
    //    w nieskończoność, a wachlarz sięgający krańca mapy czyta się jak reflektor.
    // 3. **Zanik z odległością gracza** — okno pokazuje coś dopiero, gdy się do
    //    niego podejdzie. To najważniejsza z trzech: patrząc z drugiego końca hali
    //    nie widzi się przez okno i tak, a właśnie te dalekie kliny robiły ruch.
    if (player) {
      const px = toMaskX(player.x);
      const py = toMaskY(player.y);
      const REACH = 340 / RESOLUTION;

      // Otwór traktujemy jako szerszy, niż jest naprawdę. Klin liczony co do
      // piksela z okna szerokiego na kilkanaście pikseli daje na placu wąski
      // pasek, przez który nic nie widać — a chodzi o to, żeby przez okno dało
      // się cokolwiek zobaczyć. Rozszerzenie jest świadomym oszustwem.
      const SPREAD = 10 / RESOLUTION;

      // Rozmycie krawędzi klina. Dwa piksele maski to cztery piksele świata —
      // dość, żeby bok przestał być kreską, i za mało, żeby klin się rozlał.
      o.filter = 'blur(2px)';

      for (const win of this.world.windows ?? []) {
        const midX = (win.a.x + win.b.x) / 2;
        const midY = (win.a.y + win.b.y) / 2;

        // Ile gracz widzi przez to konkretne okno. Przy oknie — wszystko,
        // z drugiego końca hali — nic.
        const near = Math.hypot(player.x - midX, player.y - midY);
        const closeness = Math.max(0, Math.min(1,
          (WINDOW_FAR - near) / (WINDOW_FAR - WINDOW_NEAR)));
        if (closeness <= 0.01) continue;

        const dx = win.b.x - win.a.x;
        const dy = win.b.y - win.a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ex = (dx / len) * SPREAD * RESOLUTION;
        const ey = (dy / len) * SPREAD * RESOLUTION;

        const ax = toMaskX(win.a.x - ex);
        const ay = toMaskY(win.a.y - ey);
        const bx = toMaskX(win.b.x + ex);
        const by = toMaskY(win.b.y + ey);

        // Promień od gracza przez koniec otworu, przedłużony na zewnątrz.
        const ray = (ex, ey) => {
          const dx = ex - px;
          const dy = ey - py;
          const len = Math.hypot(dx, dy) || 1;
          return [ex + (dx / len) * REACH, ey + (dy / len) * REACH];
        };
        const [fax, fay] = ray(ax, ay);
        const [fbx, fby] = ray(bx, by);

        // Zanik z odległością od okna — liczony od **środka otworu**, nie od
        // gracza. Dzięki temu klin gaśnie tam, gdzie kończyłby się snop światła,
        // a nie tam, gdzie akurat stoi patrzący.
        const mx = toMaskX(midX);
        const my = toMaskY(midY);
        const fade = o.createRadialGradient(mx, my, 0, mx, my, REACH);
        const peak = 0.86 * closeness;
        fade.addColorStop(0, `rgba(0,0,0,${peak.toFixed(3)})`);
        fade.addColorStop(0.45, `rgba(0,0,0,${(peak * 0.72).toFixed(3)})`);
        fade.addColorStop(1, 'rgba(0,0,0,0)');

        o.fillStyle = fade;
        o.beginPath();
        o.moveTo(ax, ay);
        o.lineTo(bx, by);
        o.lineTo(fbx, fby);
        o.lineTo(fax, fay);
        o.closePath();
        o.fill();
      }

      o.filter = 'none';
    }

    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.occlusion, 0, 0);
  }

  update(time, inside = false, player = null, phase = 0.5, rain = 0) {
    const view = this.scene.cameras.main.worldView;
    const w = Math.ceil(view.width / RESOLUTION) + 2;
    const h = Math.ceil(view.height / RESOLUTION) + 2;
    this.ensureSize(w, h);

    const ctx = this.texture.getContext();

    // Początek maski **przyciągnięty do siatki świata**, a nie postawiony tam,
    // gdzie akurat stoi kamera.
    //
    // Tu siedział błąd zgłoszony z gry: *pasek wzdłuż zewnętrznej ściany, 1 piksel
    // dookoła — na dolnej ścianie na stałe, po prawej mryga, po lewej i u góry
    // mryga cień*. Jeden piksel maski to dwa piksele świata, więc granica maski
    // może wypaść tylko na parzystym odstępie od kamery. Kamera stoi na ułamku,
    // mur na 976 — i ta granica lądowała raz na 975, raz na 977. Raz piksel dworu
    // dostawał światło wnętrza (jasna kreska), raz piksel muru dostawał mrok dworu
    // (ciemna kreska), a przy ruchu kamery przeskakiwało to co klatkę. Każda ściana
    // zaokrąglała się osobno, stąd „po lewej cień, po prawej światło".
    //
    // Po przyciągnięciu początku do wielokrotności `RESOLUTION` odwzorowanie świata
    // na maskę przestaje zależeć od kamery. Wszystkie krawędzie budynku są
    // wielokrotnościami kafla, czyli i tak parzyste, więc trafiają w piksel maski
    // **co do jednego** i nie ma czego zaokrąglać.
    const ox = Math.floor(view.x / RESOLUTION) * RESOLUTION;
    const oy = Math.floor(view.y / RESOLUTION) * RESOLUTION;
    const toMaskX = (x) => (x - ox) / RESOLUTION;
    const toMaskY = (y) => (y - oy) / RESOLUTION;

    // 1. Światło otoczenia — plac na całości, wnętrze hali nadpisane cieplejszym.
    const night = darkness(phase);
    const yard = overcast(skyColor(phase), rain);
    const forgeDim = 1 - (1 - FORGE_NIGHT) * night;
    const forge = AMBIENT_FORGE.map((c) => Math.round(c * forgeDim));

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${yard.join(',')})`;
    ctx.fillRect(0, 0, w, h);
    // Przygaszamy **cały budynek**, nie samą podłogę.
    //
    // Prostokąt `interior` opisuje deski, a mury leżą poza nim — dostawały więc
    // kolor nieba i w dzień świeciły jak oświetlone słońcem, mimo że są ścianami
    // ciemnej hali. Użytkownik nazwał to wprost: *ściany dookoła są rozświetlone
    // na maxa jakby były na słońcu*. Do testu „czy jestem w środku" dalej służy
    // `interior`, bo tam chodzi o podłogę, po której się chodzi.
    //
    // Krawędzie w całych pikselach maski. Po przyciągnięciu początku maski do
    // siatki świata wychodzą one równo same z siebie — zaokrąglenie zostaje jako
    // zabezpieczenie na wypadek prostokąta o nieparzystym boku, bo `fillRect()`
    // na ułamku wygładza krawędź i skrajny piksel wyszedłby mieszanką wnętrza
    // z dworem.
    const bx0 = Math.round(toMaskX(this.building.x));
    const by0 = Math.round(toMaskY(this.building.y));
    const bx1 = Math.round(toMaskX(this.building.x + this.building.w));
    const by1 = Math.round(toMaskY(this.building.y + this.building.h));
    ctx.fillStyle = `rgb(${forge.join(',')})`;
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

    // 2. Źródła światła, dodawane do maski.
    //
    // W dzień pochodnie na placu przygasają. Nie dlatego, że mniej się palą, tylko
    // dlatego, że maska jest już prawie biała i dokładanie do niej pełnej mocy daje
    // przepalone plamy. Ognie **w hali** zostają na pełnej mocy niezależnie od pory:
    // wnętrze jest ciemne przez całą dobę, a przygaszone palenisko robiło z niego
    // płaską szarość.
    const outdoorDim = TORCH_DAY + (1 - TORCH_DAY) * night;

    ctx.globalCompositeOperation = 'lighter';
    for (const light of this.world.lights) {
      const sheltered = this.isInterior(light.x, light.y);
      const dim = sheltered ? 1 : outdoorDim;
      const flicker = this.flickerAt(light, time);
      const radius = (light.radius * (0.92 + flicker * 0.16) * (0.7 + 0.3 * dim)) / RESOLUTION;
      const x = toMaskX(light.x);
      const y = toMaskY(light.y);
      if (x < -radius || y < -radius || x > w + radius || y > h + radius) continue;

      const strength = light.intensity * flicker * dim;
      const [r, g, b] = light.color;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, strength)})`);
      gradient.addColorStop(0.4, `rgba(${r},${g},${b},${strength * 0.42})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Ograniczona widoczność. Wygaszamy stopniowo, żeby przejście przez bramę
    // nie było przeskokiem — mrok na placu narasta w trakcie wchodzenia.
    this.hidden = (this.hidden ?? 0) + ((inside ? 1 : 0) - (this.hidden ?? 0)) * 0.08;
    // Ten sam prostokąt w całych pikselach maski, i z tego samego powodu:
    // wycięcie na ułamku zostawia wzdłuż muru pas wygaszony tylko częściowo.
    this.occlude(ctx, w, h, { x0: bx0, y0: by0, x1: bx1, y1: by1 },
      this.hidden, player, toMaskX, toMaskY);

    // 4. Winieta — przygasza rogi kadru i zbiera uwagę na środku.
    //
    // W dzień musi zelżeć. Winieta pełną mocą w południe zjadała całą jasność,
    // którą właśnie dodało niebo, i południe wyglądało jak popołudnie w chmurach —
    // widać to było dopiero na arkuszu obok kadru bez światła.
    const vignetteAlpha = (VIGNETTE_DAY + (1 - VIGNETTE_DAY) * night) * 0.55;
    ctx.globalCompositeOperation = 'source-over';
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(6,4,8,${vignetteAlpha.toFixed(3)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    this.texture.refresh();
    // Maskę stawiamy w tym samym przyciągniętym punkcie, z którego była liczona —
    // inaczej cała praca z siatką idzie na marne przy samym wyświetleniu.
    this.image.setPosition(ox, oy).setDisplaySize(w * RESOLUTION, h * RESOLUTION);
  }

  /** Czy punkt leży na podłodze hali — po tym poznajemy ogień pod dachem. */
  isInterior(x, y) {
    const box = this.interior;
    if (!box) return false;
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  }

  /**
   * Migotanie to suma dwóch sinusoid o niewspółmiernych okresach. Dzięki temu
   * ogień nigdy nie łapie słyszalnego rytmu i nie wygląda jak pulsująca dioda.
   */
  flickerAt(light, time) {
    if (!light.flicker) return 1;
    const a = Math.sin(time * 0.0061 + light.phase);
    const b = Math.sin(time * 0.0173 + light.phase * 2.3);
    return 1 + (a * 0.6 + b * 0.4) * light.flicker;
  }
}
