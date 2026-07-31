// Rzeczy leżące na ziemi.
//
// Lista przychodzi z serwera **w całości** (to, co gracz widzi), więc rysowanie
// sprowadza się do dopasowania sprite'ów do tej listy: czego w niej nie ma, tego
// u gracza nie ma. Klient nie decyduje o podniesieniu ani o zniknięciu — przy
// grze, w której łupi się innych graczy, o zawartości ziemi musi rozstrzygać
// serwer, tak samo jak potem o zawartości plecaka.

const KLATKI = { wood: 'item_wood', stone: 'item_stone', meat: 'item_meat' };

// Rzeczy na ziemi **leżą nieruchomo**.
//
// Pierwsza wersja kołysała nimi w pionie, żeby rzucały się w oczy. Odrzucone:
// unoszący się kamień przeczy temu, co widać dookoła — cała reszta świata trzyma
// się ziemi, a cienie i plamy kontaktowe są tu po to, żeby nic nie pływało.
// Zauważalność załatwia podpowiedź podnoszenia, a nie ruch przedmiotu.

export class Drops {
  constructor(scene, shadows) {
    this.scene = scene;
    this.shadows = shadows;
    this.items = new Map();   // id → { sprite, shadow, x, y }

    // Podpowiedź podnoszenia: jedna na całą grę, przestawiana nad najbliższą
    // rzecz. Napis przy każdym leżącym przedmiocie zamieniłby polanę po wyrębie
    // w ścianę liter — a i tak podnieść można tylko to, przy czym się stoi.
    this.hint = scene.add.bitmapText(0, 0, 'goblin', 'E', 11)
      .setOrigin(0.5, 1)
      .setTint(0xe8dcc0)
      .setDepth(9200)
      .setAlpha(0);
    this.hintAlpha = 0;
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
        item = { sprite, shadow, x: drop.x, y: drop.y };
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

  /**
   * Podpowiedź podnoszenia.
   *
   * **Delikatnie**, na prośbę użytkownika: litera zapala się i gaśnie płynnie
   * i unosi się tuż nad rzeczą. Skokowe pojawienie się napisu czyta się jak
   * komunikat interfejsu, a to ma być cecha przedmiotu, na który się patrzy.
   *
   * @param dt sekundy
   * @param mozna czy serwer potwierdza, że jest co podnieść — o tym rozstrzyga on,
   *   bo to on wie, czy rzecz już wolno wziąć i czy jeszcze leży
   */
  updateHint(dt, x, y, mozna) {
    const cel = mozna ? this.nearest(x, y, 26) : null;
    this.hintAlpha += ((cel ? 1 : 0) - this.hintAlpha) * Math.min(1, dt * 9);
    this.hint.setAlpha(this.hintAlpha * 0.85);
    if (!cel) return;
    this.hint.setPosition(Math.round(cel.x), Math.round(cel.y) - 9);
    this.hint.setDepth(cel.y + 1);
  }

  /** Najbliższa rzecz do gracza — po niej ustawiamy podpowiedź „E". */
  nearest(x, y, range) {
    let best = null;
    let bestD = range * range;
    for (const item of this.items.values()) {
      const dx = item.x - x;
      const dy = (item.y - y) * 1.6;
      const d = dx * dx + dy * dy;
      if (d >= bestD) continue;
      bestD = d;
      best = item;
    }
    return best;
  }
}
