// Trawa gnąca się pod przechodzącą postacią.
//
// Kępki są **osobnymi obiektami**, a nie częścią wypalonej tekstury podłoża —
// tylko dlatego da się nimi w ogóle ruszyć. Reszta śladów (sadza, koleiny, kałuże)
// zostaje wypalona, bo się nie rusza i nie ma po co robić z niej sprite'ów.
//
// Zginanie to obrót wokół **dolnej krawędzi** kafla. Przesuwanie w bok wygląda
// jak ślizganie się kępki po ziemi; obrót wokół podstawy czyta się jako łodyga,
// która ugina się i wraca — a to jest cały efekt.

// Jak daleko postać rozgarnia trawę. Promień stopy to kilka pikseli, ale kępka
// ma szesnaście: przy zasięgu równym stopie trawa uginała się dopiero wtedy, gdy
// gracz był już na niej, czyli o pół sekundy za późno.
const REACH = 15;

// Największe wychylenie w radianach. Ćwierć radiana to jakieś 14 stopni — więcej
// wygląda jak wiatr halny, mniej nie jest widać przy kępce wysokiej na 6 pikseli.
const MAX_BEND = 0.26;

// Kępka wraca sprężyście, z przeregulowaniem. Bez niego wraca jak zamykane
// drzwiczki i widać, że to interpolacja, a nie roślina.
const SPRING = 130;
const DAMPING = 11;

// Wiatr rusza trawą także wtedy, gdy nikt obok nie stoi — inaczej plac zamiera
// w chwili, gdy gracz przystanie.
const SWAY = 0.055;

export class Grass {
  /**
   * @param scene scena świata
   * @param tufts lista `{ key, x, y }` z `buildWorld()`
   * @param frameIndex mapa nazwa kafla → numer klatki w atlasie `tiles`
   */
  constructor(scene, tufts, frameIndex) {
    this.scene = scene;
    this.blades = tufts.map((tuft) => {
      // Zaczepienie u dołu w środku: obrót ma iść wokół nasady, nie wokół środka
      // kafla. `+ 16` na `y`, bo `tuft.y` to górny róg kafla.
      const image = scene.add.image(tuft.x + 8, tuft.y + 16, 'tiles', frameIndex[tuft.key])
        .setOrigin(0.5, 1)
        // Ta sama głębokość co u obiektów i postaci, więc sortowanie po Y działa
        // samo: idąc w dół gracz zasłania kępkę, idąc w górę chowa się za nią.
        .setDepth(tuft.y + 16);
      return {
        image,
        x: tuft.x + 8,
        y: tuft.y + 16,
        bend: 0,
        speed: 0,
        // Własna faza kołysania, żeby cały plac nie falował jednym rytmem.
        phase: (tuft.x * 0.7 + tuft.y * 1.3) % (Math.PI * 2),
      };
    });
  }

  /**
   * @param dt sekundy
   * @param time czas sceny w ms
   * @param actors lista `{ x, y }` — gracz, inni gracze, moby
   * @param wind 0–1, siła wiatru; deszcz i ulewa mogą ją później podnosić
   */
  update(dt, time, actors, wind = 1) {
    const view = this.scene.cameras.main.worldView;
    // Krok symulacji obcinamy: po przełączeniu karty `dt` bywa wielkie i sprężyna
    // liczona jednym takim krokiem strzela trawą w drugą stronę.
    const step = Math.min(dt, 0.05);

    for (const blade of this.blades) {
      if (blade.x < view.x - 24 || blade.x > view.right + 24
        || blade.y < view.y - 24 || blade.y > view.bottom + 24) continue;

      // Docelowe wychylenie od najbliższej postaci. Kępka kładzie się **na
      // przeciwną stronę** niż ta, z której nadchodzi postać.
      let target = 0;
      for (const actor of actors) {
        const dx = blade.x - actor.x;
        const dy = blade.y - actor.y;
        const distance = Math.hypot(dx, dy * 1.6);
        if (distance > REACH) continue;
        const push = (1 - distance / REACH) * MAX_BEND;
        // Bliżej środka kępki znak `dx` skacze — przy `dx` bliskim zeru bierzemy
        // stronę z kierunku ruchu, żeby trawa nie migotała pod stojącą postacią.
        const side = Math.abs(dx) < 1 ? Math.sign(actor.vx ?? 1) || 1 : Math.sign(dx);
        if (Math.abs(push) > Math.abs(target)) target = push * side;
      }

      target += Math.sin(time * 0.0011 + blade.phase) * SWAY * wind;

      // Sprężyna z tłumieniem. Zwykłe dochodzenie do celu (`bend += (t-b)*k`)
      // nie ma bezwładności, więc trawa nie odbija — a odbicie jest tym, co
      // sprzedaje, że coś przez nią przeszło.
      blade.speed += (target - blade.bend) * SPRING * step;
      blade.speed -= blade.speed * DAMPING * step;
      blade.bend += blade.speed * step;

      blade.image.rotation = blade.bend;
    }
  }
}
