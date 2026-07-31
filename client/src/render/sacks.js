// Worki po zabitych, leżące w świecie.
//
// Osobno od rzeczy na ziemi (`drops.js`) i to nie jest podział na siłę: rzecz
// podnosi się jednym klawiszem i znika, worek **się otwiera** i zostaje, dopóki
// coś w nim jest. To dwie różne czynności i dwa różne stany, więc dwie listy.
//
// Rysowanie jest tu całe: worek to jeden obrazek plus cień. Zawartość należy do
// serwera i przychodzi wyłącznie wtedy, gdy gracz przy worku stoi.

export class Sacks {
  constructor(scene, shadows = null) {
    this.scene = scene;
    this.shadows = shadows;
    this.items = new Map();
  }

  /** @param list migawka `[[id, x, y], ...]` — same pozycje, bez zawartości. */
  apply(list) {
    const widziane = new Set();

    for (const [id, x, y] of list) {
      widziane.add(id);
      let sack = this.items.get(id);
      if (!sack) {
        const sprite = this.scene.add.image(x, y, 'props', 'sack').setOrigin(0.5, 1);
        // Cień jak u każdego obiektu w świecie — bez niego worek wisi nad ziemią.
        // `ruchomy` nie, bo worek stoi: ma się odświeżać razem ze słońcem.
        const shadow = this.shadows?.add(x, y, 'props', 'sack', { squash: 0.4, width: 16 });
        sack = { sprite, shadow, x, y };
        this.items.set(id, sack);
      }
      sack.x = x;
      sack.y = y;
      sack.sprite.setPosition(x, y);
      sack.sprite.setDepth(y);
    }

    for (const [id, sack] of this.items) {
      if (widziane.has(id)) continue;
      sack.sprite.destroy();
      if (sack.shadow) this.shadows?.remove(sack.shadow);
      this.items.delete(id);
    }
  }

  /** Najbliższy worek w zasięgu — po nim zapala się podpowiedź `E`. */
  nearest(x, y, range) {
    let best = null;
    let bestD = range * range;
    for (const sack of this.items.values()) {
      const dx = sack.x - x;
      const dy = (sack.y - y) * 1.4;
      const d = dx * dx + dy * dy;
      if (d >= bestD) continue;
      bestD = d;
      best = sack;
    }
    return best;
  }
}
