// Zasoby po stronie gracza: etapy zniszczenia, przewracanie drzewa i pniak.
//
// Serwer przysyła **tylko odstępstwa** — numer zasobu i jego punkty życia. Reszta
// bierze się z `world/nodes.js`, czyli z pliku wspólnego dla obu stron. Numer
// w liście jest identyfikatorem, więc lista nie może się tu różnić od tej na
// serwerze ani o jeden wpis.
//
// Klient **niczego tu nie przewiduje**. Drzewo pada wtedy, gdy padnie na
// serwerze, a nie wtedy, gdy gracz wyprowadzi cios — inaczej po chybieniu albo
// po korekcie sieci drzewo wstawałoby z powrotem, a to najgorszy rodzaj
// szarpnięcia: taki, który dotyczy świata, a nie własnej postaci.

import { buildNodes, nodeStage, NODE_KINDS } from '../world/nodes.js';

// Ile trwa przewrócenie. Krócej wygląda jak zniknięcie, dłużej jak zwolnione
// tempo — drzewo ma mieć ciężar, ale nie ma na siebie czekać.
const FALL_MS = 700;
// Ile leży, zanim zniknie. Musi starczyć, żeby gracz zdążył zobaczyć, że upadło,
// i żeby zauważył, co spod niego wypadło.
const LIE_MS = 1800;
const FADE_MS = 500;

export class Nodes {
  /**
   * @param scene scena świata
   * @param world wynik `buildWorld()`
   * @param shadows warstwa cieni — pniak też ma rzucać cień
   */
  constructor(scene, world, shadows, wind) {
    this.scene = scene;
    this.shadows = shadows;
    this.wind = wind;
    this.list = buildNodes(world);
    // Sprite'y przypisujemy po fakcie, bo tworzy je `spawnProps()` w tej samej
    // kolejności, w jakiej idzie `buildNodes()`.
    this.sprites = new Map();     // id zasobu → { sprite, shadow }
    this.state = new Map();       // id → { hp, falling, fellAt, dx, stump }
  }

  /** Podpięcie sprite'a utworzonego przez scenę. */
  attach(id, sprite, shadow) {
    this.sprites.set(id, { sprite, shadow, key: sprite.frame.name });
  }

  /**
   * Nowa migawka. `list` to wpisy `{ i, h, dx, dy, t }` — wyłącznie zasoby
   * uszkodzone albo ścięte.
   */
  apply(list, now) {
    const widziane = new Set();

    for (const entry of list) {
      widziane.add(entry.i);
      const node = this.list[entry.i];
      const ref = this.sprites.get(entry.i);
      if (!node || !ref) continue;

      let st = this.state.get(entry.i);
      if (!st) {
        st = { hp: node.maxHp, falling: false, fellAt: 0, dx: 0, stump: null };
        this.state.set(entry.i, st);
      }

      if (entry.h > 0) {
        // Uszkodzony, ale stoi — sama podmiana klatki.
        if (st.hp !== entry.h) {
          st.hp = entry.h;
          this.setStage(entry.i, node, nodeStage(node.kind, entry.h));
        }
        continue;
      }

      if (!st.falling) {
        st.falling = true;
        st.hp = 0;
        st.dx = entry.dx ?? 0;
        // Spod wiatru, bo on ustawia obrót co klatkę i nadpisałby przewracanie.
        this.wind?.release(ref.sprite);
        // **Doganiamy animację**, jeśli gracz dopiero podszedł do miejsca, gdzie
        // coś padło minutę temu. Bez tego wchodzenie do wyrąbanego kawałka lasu
        // wyglądałoby jak seria drzew przewracających się na powitanie.
        st.fellAt = entry.t ? Math.min(now, entry.t) : now;
      }
    }

    // Czego nie ma w migawce, to stoi całe: albo odrosło, albo gracz się oddalił
    // i serwer przestał je wysyłać. W obu przypadkach wracamy do stanu pełnego.
    for (const [id, st] of this.state) {
      if (widziane.has(id)) continue;
      this.reset(id);
      this.state.delete(id);
      void st;
    }
  }

  setStage(id, node, stage) {
    const ref = this.sprites.get(id);
    if (!ref) return;
    const key = stage === 0 ? ref.key : `${ref.key}${stage}`;
    if (this.scene.textures.get('props').has(key)) ref.sprite.setFrame(key);
    void node;
  }

  /** Powrót do stanu nietkniętego — zasób odrósł. */
  reset(id) {
    const ref = this.sprites.get(id);
    if (!ref) return;
    const st = this.state.get(id);
    if (st?.stump) {
      st.stump.destroy();
      this.shadows?.remove(st.stumpShadow);
      st.stump = null;
      st.stumpShadow = null;
    }
    ref.sprite.setFrame(ref.key);
    ref.sprite.setVisible(true).setAlpha(1).setRotation(0);
    if (ref.shadow) {
      ref.shadow.contact.setVisible(true);
      ref.shadow.cast.setVisible(true);
    }
    if (st?.falling && ref.key === 'tree') this.wind?.add(ref.sprite, 'tree');
  }

  update(now) {
    for (const [id, st] of this.state) {
      if (!st.falling) continue;
      const ref = this.sprites.get(id);
      if (!ref) continue;
      const node = this.list[id];
      const t = now - st.fellAt;

      if (t < FALL_MS) {
        // Obrót wokół **podstawy**, bo zaczepienie sprite'a to (0.5, 1).
        // Przesuwanie w bok wyglądałoby jak ślizganie się drzewa po ziemi.
        //
        // Przyspieszenie kwadratowe: drzewo rusza wolno i przewraca się coraz
        // szybciej, tak jak coś, co przewraca się pod własnym ciężarem. Ruch
        // liniowy czyta się jak wskazówka zegara.
        const p = t / FALL_MS;
        let e = p * p;
        // Odbicie na końcu — uderzenie o ziemię. Bez niego drzewo zatrzymuje się
        // w poziomie tak gładko, jakby je ktoś położył.
        if (p > 0.88) e = 1 - Math.sin(((p - 0.88) / 0.12) * Math.PI) * 0.07;
        ref.sprite.setRotation((Math.PI / 2) * e * (st.dx >= 0 ? 1 : -1));
        if (ref.shadow) {
          // Cień rzucany sylwetką stojącego drzewa przestaje pasować, gdy drzewo
          // się kładzie — zostaje sama plama kontaktowa przy podstawie.
          ref.shadow.cast.setVisible(false);
        }
        continue;
      }

      if (!st.stump) {
        // Drzewo leży płasko; głaz zostaje rozbity i po prostu znika.
        ref.sprite.setRotation((Math.PI / 2) * (st.dx >= 0 ? 1 : -1));
        if (node.kind === 'tree') {
          st.stump = this.scene.add.image(node.x, node.y, 'props', 'stump')
            .setOrigin(0.5, 1)
            .setDepth(node.y);
          st.stumpShadow = this.shadows?.add(node.x, node.y, 'props', 'stump', {
            squash: 0.42,
            width: 20,
          });
        }
      }

      const zanik = t - FALL_MS - LIE_MS;
      if (zanik <= 0) continue;
      const alpha = Math.max(0, 1 - zanik / FADE_MS);
      ref.sprite.setAlpha(alpha);
      if (alpha === 0) ref.sprite.setVisible(false);
    }
  }
}

export { NODE_KINDS };
