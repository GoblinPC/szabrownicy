// Rzeczy leżące na ziemi.
//
// Lista przychodzi z serwera **w całości** (to, co gracz widzi), więc rysowanie
// sprowadza się do dopasowania sprite'ów do tej listy: czego w niej nie ma, tego
// u gracza nie ma. Klient nie decyduje o podniesieniu ani o zniknięciu — przy
// grze, w której łupi się innych graczy, o zawartości ziemi musi rozstrzygać
// serwer, tak samo jak potem o zawartości plecaka.

// Nazwa klatki wynika **z rodzaju przedmiotu**, a nie z osobnej tabelki.
//
// Tabelka wymieniała trzy rodzaje: kłodę, kamień i mięso. Siekiera, kilof i dzida
// miały w niej luki, a kod na brak wpisu robił `continue` — czyli narzędzie
// wyrzucone na ziemię **leżało niewidzialne**: serwer o nim wiedział, podpowiedź
// `E` się zapalała, podnieść się dało, tylko nie było czego zobaczyć. Klasyczny
// przypadek jednego faktu zapisanego w dwóch miejscach, które się rozjechały.
//
// Umowa jest teraz jedna: rzecz o rodzaju `x` leży w świecie jako klatka `item_x`.
// Pilnuje jej `npm run sprawdz`, więc nowy przedmiot bez rysunku nie przejdzie
// cicho — a to była tu jedyna prawdziwa trudność.
const klatkaDla = (kind) => `item_${kind}`;

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
    // Rysowana klatka, nie napis fontem interfejsu: podpowiedź stoi **w świecie**,
    // więc powiększa ją zoom kamery. Napis wielkości HUD-u wychodził przy zoomie
    // 3× kilka razy większy niż postać.
    this.hint = scene.add.image(0, 0, 'props', 'key_e')
      .setOrigin(0.5, 1)
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
        const key = klatkaDla(drop.k);
        // Brak rysunku nie może znaczyć „nie rysuj nic": rzecz **jest** w świecie,
        // można ją podnieść i trzeba ją widzieć. Zamiast pomijać, mówimy o tym
        // głośno i rysujemy kłodę — brzydko, ale widocznie.
        if (!this.scene.textures.get('props').has(key)) {
          console.warn(`brak rysunku rzeczy na ziemi: ${key}`);
        }
        const uzyta = this.scene.textures.get('props').has(key) ? key : 'item_wood';
        const sprite = this.scene.add.image(drop.x, drop.y, 'props', uzyta)
          .setOrigin(0.5, 1)
          // Ta sama głębokość co reszta świata, więc sortowanie po Y działa samo:
          // idąc w dół gracz zasłania kłodę, idąc w górę chowa się za nią.
          .setDepth(drop.y);
        const shadow = this.shadows?.add(drop.x, drop.y, 'props', uzyta, {
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
  updateHint(dt, x, y, mozna, zapasowy = null) {
    // Rzeczy leżące mają pierwszeństwo przed zasobami — tak samo jak na serwerze
    // w `pickRequest()`. Gdyby kolejność się różniła, litera świeciłaby nad
    // gałęzią, a `E` podnosiłoby leżącą obok kłodę.
    const cel = mozna ? (this.nearest(x, y, 26) ?? zapasowy) : null;
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
