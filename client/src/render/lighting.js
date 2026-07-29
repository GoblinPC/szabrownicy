// Warstwa świetlna.
//
// Maskę światła rysujemy na małym płótnie 2D (jeden piksel maski = 2 piksele
// świata) i rozciągamy na widok kamery w trybie mnożenia. Przy tej rozdzielczości
// kilkanaście gradientów na klatkę nic nie kosztuje, a rozmycie przy skalowaniu
// daje miękki spadek światła, którego nie da się uzyskać samymi pikselami.
//
// Kolor otoczenia zależy od tego, gdzie patrzy kamera: wnętrze hali dostaje
// ciepły mrok, plac chłodny zmierzch. Kontrast między nimi jest tym, co sprzedaje
// przejście przez bramę.

const RESOLUTION = 2; // piksele świata na jeden piksel maski

const AMBIENT_FORGE = [122, 96, 84];
const AMBIENT_YARD = [86, 100, 140];

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
  occlude(ctx, w, h, box, strength) {
    if (strength <= 0.01) return;
    const feather = 30 / RESOLUTION;
    const dark = (a) => `rgba(10,8,16,${(a * strength).toFixed(3)})`;
    const SOLID = 0.9;

    ctx.globalCompositeOperation = 'multiply';

    // Pełny mrok poza pasem rozmycia, po każdej ze stron.
    ctx.fillStyle = dark(SOLID);
    ctx.fillRect(0, 0, w, Math.max(0, box.y0 - feather));
    ctx.fillRect(0, Math.min(h, box.y1 + feather), w, h);
    ctx.fillRect(0, 0, Math.max(0, box.x0 - feather), h);
    ctx.fillRect(Math.min(w, box.x1 + feather), 0, w, h);

    // Pasy przejściowe przy samych ścianach.
    const strip = (x, y, sw, sh, gx0, gy0, gx1, gy1) => {
      if (sw <= 0 || sh <= 0) return;
      const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, dark(SOLID));
      g.addColorStop(1, dark(0));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, sw, sh);
    };
    strip(0, box.y0 - feather, w, feather, 0, box.y0 - feather, 0, box.y0);
    strip(0, box.y1, w, feather, 0, box.y1 + feather, 0, box.y1);
    strip(box.x0 - feather, 0, feather, h, box.x0 - feather, 0, box.x0, 0);
    strip(box.x1, 0, feather, h, box.x1 + feather, 0, box.x1, 0);
  }

  update(time, inside = false) {
    const view = this.scene.cameras.main.worldView;
    const w = Math.ceil(view.width / RESOLUTION) + 2;
    const h = Math.ceil(view.height / RESOLUTION) + 2;
    this.ensureSize(w, h);

    const ctx = this.texture.getContext();
    const toMaskX = (x) => (x - view.x) / RESOLUTION;
    const toMaskY = (y) => (y - view.y) / RESOLUTION;

    // 1. Światło otoczenia — plac na całości, wnętrze hali nadpisane cieplejszym.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${AMBIENT_YARD.join(',')})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgb(${AMBIENT_FORGE.join(',')})`;
    ctx.fillRect(
      toMaskX(this.interior.x), toMaskY(this.interior.y),
      this.interior.w / RESOLUTION, this.interior.h / RESOLUTION
    );

    // 2. Źródła światła, dodawane do maski.
    ctx.globalCompositeOperation = 'lighter';
    for (const light of this.world.lights) {
      const flicker = this.flickerAt(light, time);
      const radius = (light.radius * (0.92 + flicker * 0.16)) / RESOLUTION;
      const x = toMaskX(light.x);
      const y = toMaskY(light.y);
      if (x < -radius || y < -radius || x > w + radius || y > h + radius) continue;

      const strength = light.intensity * flicker;
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
    }, this.hidden);

    // 4. Winieta — przygasza rogi kadru i zbiera uwagę na środku.
    ctx.globalCompositeOperation = 'source-over';
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(6,4,8,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    this.texture.refresh();
    this.image.setPosition(view.x, view.y).setDisplaySize(w * RESOLUTION, h * RESOLUTION);
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
