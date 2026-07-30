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
export const AMBIENT_FORGE = [122, 96, 84];
export const FORGE_NIGHT = 0.74; // ile zostaje z tej jasności w środku nocy

// Ile mocy zostaje pochodni w samo południe. Zero wygląda źle — pochodnia jednak
// się pali i widać ją po ciepłym odcieniu na murze; pełna moc w dzień wygląda
// jeszcze gorzej, bo płomień świeci mocniej niż słońce.
export const TORCH_DAY = 0.34;

// Ile zostaje z winiety w samo południe. Zero jest kuszące, ale wtedy kadr traci
// obramowanie i robi się płaski — chodzi o to, żeby w dzień nie było widać, że
// rogi są przygaszone, a nie żeby ich nie przygaszać wcale.
export const VIGNETTE_DAY = 0.3;

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
    const steps = 3;
    const stepPx = 4 / RESOLUTION;
    for (let i = steps; i >= 0; i--) {
      const inset = i * stepPx;
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
    if (player) {
      const px = toMaskX(player.x);
      const py = toMaskY(player.y);
      const REACH = 900 / RESOLUTION;

      // Otwór traktujemy jako szerszy, niż jest naprawdę. Klin liczony co do
      // piksela z okna szerokiego na kilkanaście pikseli daje na placu wąski
      // pasek, przez który nic nie widać — a chodzi o to, żeby przez okno dało
      // się cokolwiek zobaczyć. Rozszerzenie jest świadomym oszustwem.
      const SPREAD = 10 / RESOLUTION;

      for (const win of this.world.windows ?? []) {
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

        o.fillStyle = 'rgba(0,0,0,0.82)';
        o.beginPath();
        o.moveTo(ax, ay);
        o.lineTo(bx, by);
        o.lineTo(fbx, fby);
        o.lineTo(fax, fay);
        o.closePath();
        o.fill();
      }
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
    const toMaskX = (x) => (x - view.x) / RESOLUTION;
    const toMaskY = (y) => (y - view.y) / RESOLUTION;

    // 1. Światło otoczenia — plac na całości, wnętrze hali nadpisane cieplejszym.
    const night = darkness(phase);
    const yard = overcast(skyColor(phase), rain);
    const forgeDim = 1 - (1 - FORGE_NIGHT) * night;
    const forge = AMBIENT_FORGE.map((c) => Math.round(c * forgeDim));

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${yard.join(',')})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgb(${forge.join(',')})`;
    ctx.fillRect(
      toMaskX(this.interior.x), toMaskY(this.interior.y),
      this.interior.w / RESOLUTION, this.interior.h / RESOLUTION
    );

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
    this.occlude(ctx, w, h, {
      x0: toMaskX(this.building.x),
      y0: toMaskY(this.building.y),
      x1: toMaskX(this.building.x + this.building.w),
      y1: toMaskY(this.building.y + this.building.h),
    }, this.hidden, player, toMaskX, toMaskY);

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
    this.image.setPosition(view.x, view.y).setDisplaySize(w * RESOLUTION, h * RESOLUTION);
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
