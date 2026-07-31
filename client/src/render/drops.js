// Rzeczy leżące na ziemi.
//
// Lista przychodzi z serwera **w całości** (to, co gracz widzi), więc rysowanie
// sprowadza się do dopasowania sprite'ów do tej listy: czego w niej nie ma, tego
// u gracza nie ma. Klient nie decyduje o podniesieniu ani o zniknięciu — przy
// grze, w której łupi się innych graczy, o zawartości ziemi musi rozstrzygać
// serwer, tak samo jak potem o zawartości plecaka.

const KLATKI = { wood: 'item_wood', stone: 'item_stone' };

// Kołysanie w pionie. Bardzo małe, ale bez niego rzecz na ziemi wtapia się
// w podłoże i gracz jej po prostu nie zauważa — a to jedyne, co po ścięciu
// drzewa ma go do siebie przyciągnąć.
const BOB_PX = 1.5;
const BOB_HZ = 1.8;

export class Drops {
  constructor(scene, shadows) {
    this.scene = scene;
    this.shadows = shadows;
    this.items = new Map();   // id → { sprite, shadow, x, y, faza }
  }

  apply(list) {
    const widziane = new Set();

    for (const drop of list) {
      widziane.add(drop.i);
      let item = this.items.get(drop.i);
      if (!item) {
        const key = KLATKI[drop.k];
        if (!key) continue;
        const sprite = this.scene.add.image(drop.x, drop.y, 'props', key)
          .setOrigin(0.5, 1)
          // Ta sama głębokość co reszta świata, więc sortowanie po Y działa samo:
          // idąc w dół gracz zasłania kłodę, idąc w górę chowa się za nią.
          .setDepth(drop.y);
        const shadow = this.shadows?.add(drop.x, drop.y, 'props', key, {
          squash: 0.5,
          width: sprite.width + 2,
        });
        item = {
          sprite,
          shadow,
          x: drop.x,
          y: drop.y,
          // Własna faza kołysania, żeby kupka rzeczy nie pulsowała jednym rytmem.
          faza: (drop.x * 0.7 + drop.y * 1.3) % (Math.PI * 2),
        };
        this.items.set(drop.i, item);
      }
    }

    for (const [id, item] of this.items) {
      if (widziane.has(id)) continue;
      item.sprite.destroy();
      this.shadows?.remove(item.shadow);
      this.items.delete(id);
    }
  }

  update(time) {
    const t = (time / 1000) * BOB_HZ * Math.PI * 2;
    for (const item of this.items.values()) {
      item.sprite.y = item.y + Math.sin(t + item.faza) * BOB_PX;
    }
  }
}
