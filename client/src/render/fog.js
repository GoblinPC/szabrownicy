// Mgła ścieląca się przy ziemi.
//
// Pierwsza rzecz z listy „klimat i efekty głębi" i celowo najtańsza. Dwie nazwy
// z tamtej listy są w pixel arcie **szkodliwe** i nie ma ich tutaj: antyaliasing
// rozmywa piksele i psuje wszystko, na czym stoi ten projekt, a klasyczne
// ambient occlusion liczy się z geometrii 3D, której tu nie ma. Mgła daje to,
// o co naprawdę chodziło — **głębię i klimat** — i daje to uczciwie.
//
// Trzy zasady, z których wynika cała reszta:
//
// 1. **Idzie pod maskę światła.** Mgła jest w świecie, nie przed obiektywem:
//    w nocy ma ciemnieć razem z placem, a przy palenisku łapać ciepły kant.
//    Deszcz robi odwrotnie i z dokładnie odwrotnego powodu — krople lecą między
//    okiem a światem, więc w ulewie widać je najlepiej właśnie po ciemku.
// 2. **Rusza się wolniej niż deszcz i niż wiatr w trawie.** Mgła, która płynie
//    szybko, czyta się jako dym. Dwie warstwy o różnym tempie dają wrażenie
//    głębi bez żadnej trzeciej wymiary.
// 3. **Pod dachem jej nie ma.** Wnętrze ma własny mrok i własne reguły
//    widoczności; mgła w karczmie wyglądałaby jak pożar.

import { makeRng, seedFrom } from '../util/rng.js';

const KEY = 'fog_puff';

// Bok kafla mgły. Duży, bo powtarzalność wzoru widać tym bardziej, im mniejszy
// kafel — a przy dwóch warstwach przesuwających się w różnym tempie 256 px
// wystarcza, żeby oko nie złapało rytmu.
const TILE = 256;

// Kolor mgły. **Nie czysta biel**: biała mgła na ciemnym placu czyta się jak
// dziura w obrazie. Chłodna szarość z rampy `night` (`#445a80`) rozjaśniona do
// wartości, która jeszcze przepuszcza świat pod spodem.
const COLOR = 0xa8b6cc;

/**
 * Kafel mgły — kilkadziesiąt miękkich kłębów, **zapętlony w obie strony**.
 *
 * Zapętlenie robi się przez rysowanie każdego kłębu dziewięć razy: w miejscu
 * i w ośmiu przesunięciach o bok kafla. Kłąb wychodzący prawą krawędzią wraca
 * lewą, więc szew nie istnieje — a bez tego przy przewijaniu widać kratę.
 */
function ensureTexture(scene) {
  if (scene.textures.exists(KEY)) return KEY;

  const texture = scene.textures.createCanvas(KEY, TILE, TILE);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, TILE, TILE);

  // Ziarno stałe, żeby mgła wyglądała tak samo po każdym odświeżeniu strony.
  // Ta sama zasada co przy świecie: losowość ma być powtarzalna.
  const rng = makeRng(seedFrom('mgla'));

  for (let i = 0; i < 42; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    // Kłęby **spłaszczone**: mgła ściele się przy ziemi, więc jest szeroka
    // i niska. Koło daje kulę waty, nie mgłę.
    const rx = rng.range(44, 104);
    const ry = rx * rng.range(0.32, 0.5);
    // Krycie kłębu.
    //
    // Pierwsza wersja miała 0,05–0,13 i **nie było jej widać**: to krycie mnoży
    // się jeszcze przez gęstość warstwy, więc szczyt wypadał koło ośmiu procent,
    // a osiem procent chłodnej szarości na trawie to nic. Zgłoszone z gry wprost:
    // *a gdzie ta mgła, bo jej nie widzę*.
    const moc = rng.range(0.16, 0.34);

    for (const [ox, oy] of [[0, 0], [TILE, 0], [-TILE, 0], [0, TILE], [0, -TILE],
      [TILE, TILE], [-TILE, -TILE], [TILE, -TILE], [-TILE, TILE]]) {
      const cx = x + ox;
      const cy = y + oy;
      if (cx < -rx || cx > TILE + rx || cy < -ry || cy > TILE + ry) continue;
      // **Gradient powstaje po przesunięciu układu, nie przed.** To był ten błąd,
      // przez który mgły nie było widać w ogóle — przy żadnej porze dnia i przy
      // suwaku wykręconym na maksa.
      //
      // Wypełnienie gradientem jest liczone w **bieżącym układzie współrzędnych**.
      // Gradient budowany na (cx, cy) przed `translate(cx, cy)` ląduje więc
      // faktycznie na (2cx, 2cy) — czyli poza rysowaną elipsą. Cały kłąb dostawał
      // wtedy ostatni przystanek gradientu, a ten ma krycie zero. Tekstura
      // wychodziła **pusta**: obiekty istniały, miały krycie i pozycje, a nie
      // rysowały ani jednego piksela.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255,255,255,${moc.toFixed(3)})`);
      g.addColorStop(0.55, `rgba(255,255,255,${(moc * 0.45).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return KEY;
}

/**
 * Ile mgły o danej porze doby.
 *
 * Najgęstsza **tuż przed wschodem i w trakcie**, znika w ciągu poranka. To nie
 * jest wybór estetyczny, tylko to, jak mgła działa naprawdę: powstaje, gdy ziemia
 * wychłodzi się przez noc, i rozchodzi się, gdy słońce ją ogrzeje. Punkty
 * dobrane pod `daylight.js`, gdzie świt wypada koło 0,24.
 */
export function fogByPhase(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.12) return 0.12;                       // resztka nocnej mgiełki
  if (p < 0.24) return 0.12 + (p - 0.12) / 0.12 * 0.88;   // narasta do wschodu
  if (p < 0.34) return 1 - (p - 0.24) / 0.10 * 0.75;      // rozchodzi się rano
  if (p < 0.86) return 0.25 - (p - 0.34) / 0.52 * 0.18;   // dzień: ledwo widoczna
  return 0.07 + (p - 0.86) / 0.14 * 0.05;                 // wieczorem wraca
}

/**
 * Wolna zmienność między porankami — żeby dwa świty z rzędu nie były identyczne.
 *
 * Liczona z **zegara bezwzględnego**, tak samo jak pogoda w `weather.js`, i z tego
 * samego powodu: nie ma wtedy żadnego stanu do trzymania, restart serwera nie
 * przestawia mgły, a wszyscy gracze widzą to samo, bo wszyscy patrzą na ten sam
 * zegar. Okres siedem minut, więc kolejne świty w trakcie sesji wypadają różnie.
 */
export function fogMood(now = Date.now()) {
  const t = now / (7 * 60 * 1000);
  return 0.55 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
}

export class Fog {
  constructor(scene) {
    this.scene = scene;
    ensureTexture(scene);

    // Dwie warstwy: dolna gęstsza i wolniejsza, górna rzadsza i szybsza.
    // Różnica tempa jest tu **całą głębią** — jedna warstwa, choćby najlepiej
    // narysowana, jedzie płasko jak tapeta.
    this.warstwy = [
      this.dodaj(0.62, 1.35, 2.6, -0.5),
      this.dodaj(0.38, 0.85, 5.1, 1.2),
    ];

    this.gęstość = 0;
    this.poDeszczu = 0;
    this.czas = 0;
    // Ręczne wymuszenie gęstości z panelu testowego. `null` znaczy „licz z doby".
    this.wymuszona = null;
  }

  /** Suwak mgły z panelu pod `K`. Ustawia widok u siebie, nic więcej. */
  setOverride(v) {
    this.wymuszona = v;
  }

  /**
   * Warstwa mgły jako **siatka zwykłych obrazków**, a nie `tileSprite`.
   *
   * Pierwsza wersja używała `tileSprite` i nie było widać **nic** — ani na placu,
   * ani w lesie, przy żadnej gęstości. Powód: powtarzane wypełnienie rysuje się
   * w WebGL-u z tekstury zawijanej sprzętowo, a tekstura narysowana na płótnie
   * (`textures.createCanvas`) nie zawsze się do tego nadaje i wychodzi z tego
   * pusty prostokąt. Zwykłe obrazki są w tym projekcie sprawdzone — tak rysują
   * się cienie i plamy kontaktowe.
   *
   * Kafli w kadrze jest kilkanaście, więc koszt jest żaden, a szew nie powstaje,
   * bo sam rysunek kafla jest zapętlony w obie strony.
   */
  dodaj(waga, skala, prędkośćX, prędkośćY) {
    return { kafle: [], waga, skala, prędkośćX, prędkośćY };
  }

  /** Dokłada obrazki, gdy kadr urósł. Pula rośnie i już nie maleje. */
  kafel(w) {
    const obraz = this.scene.add.image(0, 0, KEY)
      .setOrigin(0, 0)
      // Pod maską światła (9000) i pod dachem (8600), nad wszystkim w świecie.
      // Dach musi być nad mgłą, bo inaczej mgła kładłaby się na gontach.
      .setDepth(8400)
      .setTint(COLOR)
      .setScale(w.skala)
      .setAlpha(0);
    w.kafle.push(obraz);
    return obraz;
  }

  /**
   * @param inside czy gracz stoi pod dachem — wtedy mgły nie ma wcale
   * @param rain   siła opadu 0–1; mgła podnosi się **po deszczu**, nie w jego trakcie
   */
  update(dt, view, phase, rain = 0, inside = false) {
    this.czas += dt;

    // Ślad po deszczu: rośnie z opadem od razu, opada powoli. Dzięki temu mgła
    // zostaje na placu jeszcze długo po tym, jak przestało padać — a to jest ta
    // jedna rzecz, po której widać, że przed chwilą lało.
    this.poDeszczu = Math.max(rain, this.poDeszczu - dt * 0.06);

    const zDoby = Math.min(1, fogByPhase(phase) * fogMood() + this.poDeszczu * 0.55);
    // Wymuszona gęstość **ignoruje dach**: suwak służy do sprawdzenia, czy warstwa
    // rysuje, a nie do grania. Bez tego sprawdzanie jej w karczmie dawałoby zero
    // i wyglądało dokładnie jak awaria.
    const cel = this.wymuszona !== null && this.wymuszona !== undefined
      ? this.wymuszona
      : (inside ? 0 : zDoby);
    // Dochodzenie do celu, nie skok: wejście pod dach ma mgłę wygasić w ciągu
    // kilku kroków, tak samo jak gaśnie widok na plac.
    this.gęstość += (cel - this.gęstość) * Math.min(1, dt * 1.6);

    for (const w of this.warstwy) {
      if (this.gęstość < 0.004) {
        for (const k of w.kafle) k.setVisible(false);
        continue;
      }

      const bok = TILE * w.skala;
      // Dryf **odejmowany od pozycji świata**, więc mgła płynie po placu, a nie
      // jedzie razem z kamerą. Reszta z dzielenia daje przesunięcie pierwszego
      // kafla w lewo i w górę, zawsze w przedziale (-bok, 0].
      const przesX = -(((view.x - this.czas * w.prędkośćX) % bok) + bok) % bok;
      const przesY = -(((view.y - this.czas * w.prędkośćY) % bok) + bok) % bok;
      const kolumny = Math.ceil((view.width - przesX) / bok);
      const wiersze = Math.ceil((view.height - przesY) / bok);

      let i = 0;
      for (let r = 0; r < wiersze; r++) {
        for (let c = 0; c < kolumny; c++) {
          const obraz = w.kafle[i] ?? this.kafel(w);
          i++;
          obraz.setVisible(true);
          obraz.setScale(w.skala);
          obraz.setPosition(
            Math.round(view.x + przesX + c * bok),
            Math.round(view.y + przesY + r * bok)
          );
          obraz.setAlpha(this.gęstość * w.waga);
        }
      }
      // Nadmiar z poprzedniej, większej klatki chowamy — pula nie maleje.
      for (let j = i; j < w.kafle.length; j++) w.kafle[j].setVisible(false);
    }
  }
}
