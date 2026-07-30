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

export const PANEL_W = 300;
export const PANEL_H = 142;

// Gniazda pasków w układzie panelu — gra maluje w nich wypełnienie i liczby.
export const BAR_SLOTS = [
  { key: 'life', x: 100, y: 30, w: 186, h: 20 },
  { key: 'stamina', x: 100, y: 56, w: 186, h: 14 },
  { key: 'food', x: 100, y: 76, w: 186, h: 14 },
];
export const PORTRAIT = { x: 12, y: 14, r: 36 };
export const NAME_AT = { x: 100, y: 12 };

// Gniazda znaczników uniku i pasek nazwy strefy — **w panelu**, nie obok niego.
//
// Zasada wyniesiona wprost od użytkownika: żaden tekst ani znak nie może wisieć
// luzem na ekranie. Napis bez pojemnika czyta się jak nakładka na grę, a nie jak
// jej część — i to wybija z gry mocniej niż brak informacji.
export const PIP_SLOTS = [
  { x: 14, y: 96 }, { x: 40, y: 96 }, { x: 66, y: 96 },
];
export const ZONE_SLOT = { x: 100, y: 96, w: 186, h: 22 };

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

  // 5c. Pasek nazwy strefy — wgłębienie na tekst, żeby napis miał swoje miejsce.
  for (let y = ZONE_SLOT.y; y < ZONE_SLOT.y + ZONE_SLOT.h; y++) {
    for (let x = ZONE_SLOT.x; x < ZONE_SLOT.x + ZONE_SLOT.w; x++) {
      if (!inRound(x, y, ZONE_SLOT, 7)) continue;
      t.px(x, y, y - ZONE_SLOT.y < 2 ? edge : inside);
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
