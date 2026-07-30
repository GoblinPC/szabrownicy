// Panel gracza — jeden rysunek, nie ramka rozciągana.
//
// Zmiana podejścia wyniesiona z czterech nieudanych prób odtworzenia wzoru.
// Ramka dziewięciodzielna jest wygodna, ale wymusza **idealną powtarzalność**:
// każdy bok jest tym samym kawałkiem powielonym, więc nic nie może być
// nieregularne. A cała uwaga użytkownika o wzorze sprowadzała się do tego, że
// naturalne rzeczy nie są równe.
//
// Panel gracza ma stały rozmiar, więc nie ma powodu go rozciągać. Rysujemy go
// w całości i wolno mu być krzywym tam, gdzie krzywy być powinien.
//
// Cztery zasady, wprost z uwag użytkownika:
//
// 1. **Kolory przygaszone.** Życie czerwone, głód bursztynowy — ale z ramp `life`
//    i `food`, nie z `ember`. Nasycenie zdejmuje się nasyceniem, nie jasnością.
// 2. **Zaokrąglenia.** Żadnych kątów prostych na krawędziach, które ma oglądać oko.
// 3. **Treść.** Portret, imię i liczby — bez nich panel jest ozdobą, a nie panelem.
// 4. **Cienie, i to nierówne.** Idealny cień o stałej grubości czyta się jak
//    obwódka. Nierówny czyta się jak cień.

import { Canvas } from './canvas.js';
import { c } from './palette.js';
import { makeRng, seedFrom } from './rng.js';

export const PANEL_W = 232;
export const PANEL_H = 92;

// Paski: **tylko te, które istnieją w grze.**
//
// Poprzedni układ miał trzy: życie, wytrzymałość i głód. Wytrzymałości nie ma
// i długo nie będzie — jej rolę pełnią ładunki uniku — a głód dojdzie dopiero
// razem z jedzeniem. Trzy gniazda, z których jedno świeciło pustką, a drugie
// pokazywało nieistniejącą wartość, to była główna przyczyna wrażenia pustki:
// panel obiecywał trzy rzeczy, a niósł jedną.
export const BAR_SLOTS = [
  { key: 'life', x: 78, y: 34, w: 142, h: 22 },
];
export const PORTRAIT = { x: 8, y: 8, r: 32 };
export const NAME_SLOT = { x: 78, y: 8, w: 142, h: 20 };

// Gniazda znaczników uniku — w panelu, nie obok niego. Żaden znak ani tekst nie
// może wisieć luzem na ekranie: bez pojemnika czyta się jak nakładka na grę.
export const PIP_SLOTS = [
  { x: 80, y: 62 }, { x: 106, y: 62 }, { x: 132, y: 62 },
];
export const ZONE_SLOT = { x: 160, y: 62, w: 60, h: 22 };

/**
 * Twarz goblina do portretu — **rysowana osobno**, w rozdzielczości portretu.
 *
 * Nie jest to powiększony sprite z gry i to jest tu sedno. Postać w świecie ma
 * czaszkę wysoką na dziewięć pikseli: po powiększeniu do portretu widać z niej
 * dziewięć wielkich kwadratów, a nie twarz. Portret ma pięćdziesiąt pikseli
 * i mieści to, czego w sprite'cie nie da się zmieścić — brew, fałdę nosa,
 * kieł, cień pod kością policzkową.
 *
 * Rysowana **sama głowa**, nie sylwetka. Cała postać wciśnięta w kółko czyta się
 * jak figurka w słoiku; portret to twarz.
 */
export function goblinFace(name, { skin = ['#1e3316', '#476b30', '#8ab355'] } = {}) {
  const rng = makeRng(seedFrom(name));
  const S = 50;
  const t = new Canvas(S, S);
  const [dark, mid, light] = skin;
  const edge = c('soot', 0);

  const cx = 25;
  const cy = 27;

  // Uszy: długie, spiczaste, odstające. To one robią goblina — bez nich każda
  // zielona głowa jest po prostu zielona.
  const ear = (dir) => {
    for (let i = 0; i < 16; i++) {
      const x = cx + dir * (13 + i);
      const y = cy - 4 - Math.round(i * 0.85);
      const grubosc = Math.max(1, 7 - Math.round(i * 0.45));
      for (let g = 0; g < grubosc; g++) t.px(x, y + g, i < 10 ? mid : dark);
      t.px(x, y - 1, edge);
      t.px(x, y + grubosc, edge);
    }
  };
  ear(-1);
  ear(1);

  // Czaszka: szeroka u góry, zwężająca się w podbródek.
  for (let y = -19; y <= 20; y++) {
    const k = (y + 19) / 39;
    const szer = Math.round(17 - k * k * 9);
    for (let x = -szer; x <= szer; x++) {
      const brzeg = Math.abs(x) >= szer - 1 || y === -19 || y === 20;
      t.px(cx + x, cy + y, brzeg ? edge : mid);
    }
  }
  // Światło z góry z lewej, cień po prawej i pod policzkami.
  for (let y = -17; y <= 4; y++) {
    const k = (y + 17) / 21;
    const szer = Math.round(15 - k * 4);
    for (let x = -szer; x <= -szer + 4; x++) t.px(cx + x, cy + y, light);
  }
  for (let y = -8; y <= 18; y++) {
    const szer = Math.round(15 - Math.abs(y) * 0.35);
    for (let x = szer - 3; x <= szer; x++) t.px(cx + x, cy + y, dark);
  }

  // Brwi: gruba, nawisająca kość — goblin patrzy spode łba.
  for (let x = -13; x <= 13; x++) {
    const h = 3 + Math.round(Math.cos(x * 0.24) * 2);
    for (let g = 0; g < h; g++) t.px(cx + x, cy - 8 + g, g === 0 ? edge : dark);
  }

  // Oczy pod brwiami, głęboko osadzone.
  for (const side of [-1, 1]) {
    const ex = cx + side * 7;
    t.rect(ex - 3, cy - 4, 6, 4, edge);
    t.rect(ex - 2, cy - 3, 4, 2, c('parchment'));
    t.rect(ex - (side < 0 ? 0 : 2), cy - 3, 2, 2, c('soot', 0));
  }

  // Nos: szeroki, zadarty, z nozdrzami.
  for (let y = 0; y <= 8; y++) {
    const szer = 2 + Math.round(y * 0.45);
    for (let x = -szer; x <= szer; x++) t.px(cx + x, cy + y, x > szer - 2 ? dark : mid);
  }
  t.px(cx - 2, cy + 7, edge);
  t.px(cx + 2, cy + 7, edge);
  t.hline(cx - 5, cx + 5, cy + 9, edge);

  // Usta z kłem wystającym z dolnej wargi.
  t.hline(cx - 7, cx + 7, cy + 13, edge);
  t.hline(cx - 6, cx + 6, cy + 14, dark);
  t.px(cx - 4, cy + 12, c('bone'));
  t.px(cx - 4, cy + 11, c('bone'));
  t.px(cx + 5, cy + 12, c('bone'));

  // Cętki na skórze — nierówne, po kilka pikseli. Gładka zieleń wygląda jak plastik.
  for (let i = 0; i < 22; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(4, 14);
    const x = Math.round(cx + Math.cos(a) * d);
    const y = Math.round(cy + Math.sin(a) * d * 1.2);
    if (t.alphaAt(x, y)) t.px(x, y, rng.chance(0.5) ? dark : light);
  }

  return t;
}

/** Czy punkt leży w prostokącie o zaokrąglonych rogach. */
function inRound(x, y, rect, r) {
  const cx = Math.min(Math.max(x, rect.x + r), rect.x + rect.w - 1 - r);
  const cy = Math.min(Math.max(y, rect.y + r), rect.y + rect.h - 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r + r * 0.5;
}

/**
 * Nierówna krawędź cienia.
 *
 * Zwraca głębokość cienia w danym miejscu — zmienną, nie stałą. To jest ta
 * jedna funkcja, przez którą panel przestaje wyglądać jak wygenerowany:
 * suma dwóch fal o niewspółmiernych okresach plus szum, więc grubość nigdzie
 * się nie powtarza i nigdzie nie widać rytmu.
 */
function ragged(rng, along, base) {
  // Same fale, **bez szumu na piksel**. Pierwsza wersja dorzucała losowy piksel
  // co trzeci wiersz i krawędź wyglądała jak darta tektura, a nie jak struganie:
  // nierówność ma być powolna, nie drobna. Deska ma falę, nie strzępy.
  const wave = Math.sin(along * 0.07) * 1.1 + Math.sin(along * 0.023) * 0.9;
  return Math.max(0, Math.round(base + wave));
}

export function playerPanel(name) {
  const rng = makeRng(seedFrom(name));
  const t = new Canvas(PANEL_W, PANEL_H);

  const edge = c('soot', 0);
  const dark = c('wood', 0);
  const body = c('wood', 2);
  const lit = c('wood', 3);
  const hot = c('wood', 4);
  const brass = c('stone', 3);
  const inside = c('soot', 1);

  const outer = { x: 0, y: 0, w: PANEL_W, h: PANEL_H };

  // 1. Korpus deski, z zaokrąglonymi rogami.
  for (let y = 0; y < PANEL_H; y++) {
    for (let x = 0; x < PANEL_W; x++) {
      if (!inRound(x, y, outer, 14)) continue;
      t.px(x, y, body);
    }
  }

  // 2. Faza: światło od góry i z lewej, cień od dołu i z prawej — **o nierównej
  // grubości**. Stała grubość daje obwódkę, zmienna daje drewno.
  for (let y = 0; y < PANEL_H; y++) {
    for (let x = 0; x < PANEL_W; x++) {
      if (!inRound(x, y, outer, 14)) continue;
      // Faza musi być **kontrastowa**, bo to ona daje grubość. Wersja z jednym
      // odcieniem jaśniejszym czytała się jak plama, nie jak oświetlona krawędź.
      const top = ragged(rng, x, 4);
      const bottom = ragged(rng, x + 71, 5);
      const left = ragged(rng, y + 17, 4);
      const right = ragged(rng, y + 133, 5);
      if (y < top || x < left) t.px(x, y, (y < top - 2 || x < left - 2) ? hot : lit);
      else if (y >= PANEL_H - bottom || x >= PANEL_W - right) {
        t.px(x, y, (y >= PANEL_H - bottom + 2 || x >= PANEL_W - right + 2) ? edge : dark);
      }
    }
  }

  // 3. Obrys: czarny, ale tylko tam, gdzie kończy się deska. Rysowany testem
  // sąsiedztwa, więc idzie po zaokrągleniu i nie trzeba go liczyć osobno.
  const shape = t.clone();
  for (let y = 0; y < PANEL_H; y++) {
    for (let x = 0; x < PANEL_W; x++) {
      if (!shape.alphaAt(x, y)) continue;
      const brzeg = !shape.alphaAt(x - 1, y) || !shape.alphaAt(x + 1, y)
        || !shape.alphaAt(x, y - 1) || !shape.alphaAt(x, y + 1);
      if (brzeg) t.px(x, y, edge);
    }
  }

  // 4. Wnętrze: ciemne pole pod paski, wpuszczone w deskę. Cień pada od górnej
  // krawędzi do środka — jak w prawdziwym wgłębieniu.
  const well = { x: 92, y: 8, w: PANEL_W - 92 - 8, h: PANEL_H - 8 - 16 };
  for (let y = well.y; y < well.y + well.h; y++) {
    for (let x = well.x; x < well.x + well.w; x++) {
      if (!inRound(x, y, well, 8)) continue;
      const depth = y - well.y;
      const cast = ragged(rng, x + 200, 3);
      t.px(x, y, depth < cast ? edge : inside);
    }
  }

  // 5. Gniazda pasków — same wgłębienia, wypełnienie maluje gra.
  for (const slot of BAR_SLOTS) {
    const r = Math.floor(slot.h / 2);
    for (let y = slot.y - 1; y < slot.y + slot.h + 1; y++) {
      for (let x = slot.x - 1; x < slot.x + slot.w + 1; x++) {
        const wewnatrz = inRound(x, y, slot, r);
        // Obwódka gniazda liczona testem sąsiedztwa, więc idzie po zaokrągleniu.
        const przy = !wewnatrz && (
          inRound(x - 1, y, slot, r) || inRound(x + 1, y, slot, r)
          || inRound(x, y - 1, slot, r) || inRound(x, y + 1, slot, r)
        );
        if (przy) { t.px(x, y, edge); continue; }
        if (!wewnatrz) continue;
        // Cień od górnej krawędzi w głąb gniazda — bez niego pasek leży na
        // desce, zamiast siedzieć w niej.
        const depth = y - slot.y;
        t.px(x, y, depth < 2 ? c('soot', 0) : c('soot', 1));
      }
    }
  }

  // 5b. Gniazda znaczników uniku: okrągłe wgłębienia w desce, po lewej pod
  // portretem. Znacznik ma w czym siedzieć, a nie wisieć na tle.
  for (const pip of PIP_SLOTS) {
    for (let y = -11; y <= 11; y++) {
      for (let x = -11; x <= 11; x++) {
        const d = Math.hypot(x, y);
        if (d > 11) continue;
        const px = pip.x + 11 + x;
        const py = pip.y + 11 + y;
        if (d > 10) t.px(px, py, edge);
        else t.px(px, py, y < -4 ? edge : inside);
      }
    }
  }

  // 5c. Gniazda na tekst: nazwa strefy i imię. Wgłębienia, żeby napis miał swoje
  // miejsce, a nie wisiał na desce.
  for (const slot of [ZONE_SLOT, NAME_SLOT]) {
    for (let y = slot.y - 1; y < slot.y + slot.h + 1; y++) {
      for (let x = slot.x - 1; x < slot.x + slot.w + 1; x++) {
        const wewnatrz = inRound(x, y, slot, 6);
        const przy = !wewnatrz && (
          inRound(x - 1, y, slot, 6) || inRound(x + 1, y, slot, 6)
          || inRound(x, y - 1, slot, 6) || inRound(x, y + 1, slot, 6)
        );
        if (przy) { t.px(x, y, edge); continue; }
        if (!wewnatrz) continue;
        t.px(x, y, y - slot.y < 2 ? c('soot', 0) : inside);
      }
    }
  }

  // 6. Portret: okrągła rama z okuciem, wpuszczona w lewą stronę panelu.
  const { x: pxc, y: pyc, r } = PORTRAIT;
  const cx = pxc + r;
  const cy = pyc + r;
  for (let y = pyc - 4; y <= pyc + r * 2 + 4; y++) {
    for (let x = pxc - 4; x <= pxc + r * 2 + 4; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // Grubość obręczy faluje — równa obręcz wygląda jak narysowana cyrklem.
      const grubosc = 4 + Math.sin((x + y) * 0.4) * 0.8;
      if (d > r + grubosc) continue;
      if (d > r) {
        // Obręcz: jasna u góry z lewej, ciemna u dołu z prawej.
        const swiatlo = (x - cx) + (y - cy) < -r * 0.3;
        t.px(x, y, d > r + grubosc - 1 ? edge : (swiatlo ? hot : dark));
      } else if (d > r - 1) {
        t.px(x, y, edge);
      } else {
        t.px(x, y, inside);
      }
    }
  }
  // Nity na obręczy, w nierównych odstępach.
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    t.rect(Math.round(cx + Math.cos(a) * (r + 2)) - 1, Math.round(cy + Math.sin(a) * (r + 2)) - 1, 2, 2, brass);
  }

  return t;
}
