// Kształt dymka czatu — sama geometria, bez rysowania.
//
// Ten plik nie zna ani Phasera, ani płótna: zwraca listę prostokątów. Dzięki temu
// tego samego kodu używa gra (`scenes/Hud.js`) i generator podglądu
// (`tools/art/preview_bubble.js`), a podgląd nie może pokazać czegoś innego, niż
// widzi gracz. Przy dwóch kopiach geometrii dokładnie to by się stało.
//
// Dymek jest rysowany pikselami, nie łukami:
//
// - narożniki są **ścięte po dwa piksele**, nie zaokrąglone — łuk w tej skali
//   wychodzi rozmyty i od razu widać, że nie należy do świata z pikseli;
// - ogonek to **schodki**, nie gładki trójkąt, z tego samego powodu;
// - obrys ma **dwa piksele**. Przy jednym całość czyta się jak ramka okienka
//   interfejsu, a nie jak kartka nad głową — tak wyglądała pierwsza wersja
//   i została odrzucona.

export const BUBBLE = {
  padX: 6,
  padY: 4,
  outline: 2,
  corner: 2,
  // [szerokość, wysokość] kolejnych schodków, od dymka w dół.
  tailSteps: [[10, 2], [7, 2], [4, 2], [2, 2]],
};

BUBBLE.tailH = BUBBLE.tailSteps.reduce((sum, [, height]) => sum + height, 0);

/**
 * Kolory z zamkniętej palety.
 *
 * Obrys to `soot 0`, nie `wood 0`, i to jest wynik obejrzenia podglądu:
 * najciemniejsze drewno (#2a1d15) jest praktycznie w tym samym kolorze co ciepły
 * mrok wnętrza kuźni (#2a1c14), więc obrys po prostu znikał. Sadza jest
 * najciemniejszym odcieniem w całej palecie i odcina się i od ciepłej podłogi
 * hali, i od chłodnej trawy na placu. Reguła „nigdy czysta czerń" zostaje
 * dotrzymana — to nadal kolor z palety.
 *
 * Tekst zostaje w najciemniejszym drewnie: na pergaminie ma być atramentem,
 * a nie drugim obrysem.
 */
export const BUBBLE_COLORS = {
  fill: '#e8dcc0',    // parchment
  ink: '#14100f',     // soot 0 — obrys
  text: '#2a1d15',    // wood 0 — atrament
  shade: '#bda997',   // stone 4 — grubość kartki przy dolnej krawędzi
};

/** Pełna szerokość dymka wraz z obrysem — potrzebna, zanim policzymy resztę. */
export function bubbleWidth(textWidth) {
  return Math.round(textWidth) + BUBBLE.padX * 2 + BUBBLE.outline * 2;
}

/**
 * @param textWidth  szerokość napisu w pikselach
 * @param textHeight wysokość napisu w pikselach
 * @param tailShift  o ile ogonek jest przesunięty od środka dymka. Niezerowy
 *                   wtedy, gdy dymek został wsunięty do kadru przy krawędzi
 *                   ekranu, a ogonek ma dalej wskazywać postać.
 *
 * Zwraca prostokąty we współrzędnych lokalnych — (0,0) to lewy górny narożnik
 * całości — oraz punkty zaczepienia: czubek ogonka i miejsce na napis.
 */
export function bubbleShape(textWidth, textHeight, tailShift = 0) {
  const { padX, padY, outline, corner, tailSteps, tailH } = BUBBLE;

  const boxW = Math.round(textWidth) + padX * 2;
  const boxH = Math.round(textHeight) + padY * 2;
  const boxX = outline;
  const boxY = outline;
  const boxBottom = boxY + boxH;

  const mouth = tailSteps[0][0];
  // Ogonek nie może wyjechać poza ramkę dymka ani wejść w ścięty narożnik.
  const limit = Math.max(0, boxW / 2 - mouth / 2 - corner);
  const tailX = Math.round(boxX + boxW / 2 + Math.max(-limit, Math.min(limit, tailShift)));

  const rects = [];

  // Prostokąt ze ściętymi narożnikami składamy z dwóch pasów na krzyż. Wynik jest
  // ścięty co do piksela, bez rysowania łuku.
  const plate = (x, y, w, h, tone) => {
    rects.push({ x: x + corner, y, w: w - corner * 2, h, tone });
    rects.push({ x, y: y + corner, w, h: h - corner * 2, tone });
  };

  const tail = (grow, tone) => {
    let y = boxBottom;
    for (const [width, height] of tailSteps) {
      rects.push({ x: Math.round(tailX - width / 2) - grow, y, w: width + grow * 2, h: height, tone });
      y += height;
    }
    // Obrys musi wystawać także pod czubkiem, inaczej ogonek kończy się urwanym
    // jasnym pikselem.
    if (grow > 0) {
      const [last] = tailSteps[tailSteps.length - 1];
      rects.push({ x: Math.round(tailX - last / 2) - grow, y, w: last + grow * 2, h: grow, tone });
    }
  };

  // Kolejność jest istotna: najpierw cały obrys, potem całe wypełnienie. Rysowane
  // po kolei „ramka i tło dymka, ramka i tło ogonka" zostawiałoby ciemną kreskę
  // dokładnie tam, gdzie ogonek styka się z dymkiem.
  plate(boxX - outline, boxY - outline, boxW + outline * 2, boxH + outline * 2, 'ink');
  tail(outline, 'ink');
  plate(boxX, boxY, boxW, boxH, 'fill');
  tail(0, 'fill');

  // Pas cienia przy dolnej krawędzi — bez niego pergamin jest płaską plamą.
  // Z przerwą na wylot ogonka: przeciągnięty przez całą szerokość odcinałby
  // ogonek kreską w miejscu, w którym ma być połączenie.
  const shadeY = boxBottom - 1;
  const shadeFrom = boxX + corner;
  const shadeTo = boxX + boxW - corner;
  const gapFrom = Math.round(tailX - mouth / 2);
  const gapTo = Math.round(tailX + mouth / 2);
  if (gapFrom > shadeFrom) {
    rects.push({ x: shadeFrom, y: shadeY, w: gapFrom - shadeFrom, h: 1, tone: 'shade' });
  }
  if (shadeTo > gapTo) {
    rects.push({ x: gapTo, y: shadeY, w: shadeTo - gapTo, h: 1, tone: 'shade' });
  }

  return {
    rects,
    width: boxW + outline * 2,
    height: boxH + outline * 2 + tailH,
    // Czubek ogonka — tym punktem dymek zaczepia się nad głową postaci.
    tipX: tailX,
    tipY: boxBottom + tailH,
    // Napis stawiany z zaczepieniem (0.5, 1), czyli środek dołu.
    textX: boxX + boxW / 2,
    textY: boxBottom - padY,
  };
}
