// Zasoby do zebrania: drzewa i głazy.
//
// Lista powstaje **z tego samego świata po obu stronach** i jest deterministyczna,
// więc identyfikator zasobu to zwykły numer w tej liście. Dzięki temu serwer nie
// musi wysyłać, gdzie stoi każde z ośmiuset drzew — wysyła wyłącznie **te, które
// są uszkodzone albo ścięte**. Przy pełnym lesie to zero bajtów na migawkę.
//
// Zasada jest ta sama co przy fizyce ruchu: jeden plik, dwie strony, żadnego
// rozjazdu. Gdyby listy się różniły choćby o jeden wpis, gracz rąbałby jedno
// drzewo, a serwer liczyłby obrażenia innemu.

/**
 * Stożek trafienia w zasoby — **szerszy niż w walce**.
 *
 * Zgłoszone z gry: *uderzam w jego stronę i nie trafiam cały czas, trzeba
 * idealnie pod danym kątem stanąć*. Przyczyna była podwójna i obie połowy
 * wymagały osobnej poprawki.
 *
 * Drzewo i głaz **nie uciekają i nie oddają**, więc precyzja nic tu nie wnosi —
 * jest samą uciążliwością. Trudność ma siedzieć w tym, **czym** się rąbie
 * (siekiera kontra pięść), a nie w tym, pod jakim kątem się stoi. Stąd 150°:
 * wystarczy być zwróconym w stronę drzewa, a nie wycelować w jego oś.
 */
export const NODE_ARC = 150;

/**
 * Doliczany zasięg przy zasobach.
 *
 * Pięść ma 0,37 × 46 px ≈ 17 px liczone od środka postaci, więc po odjęciu
 * promienia celu zostawało kilkanaście pikseli okna — trzeba było wejść w pień.
 * Zasoby stoją nieruchomo, więc bezpiecznie można tu dołożyć pół kafla.
 */
export const NODE_REACH_BONUS = 8;

export const NODE_KINDS = {
  tree: {
    hp: 3,             // trzy ciosy siekierą... na razie trzy ciosy czymkolwiek
    // **Promień celu ma odpowiadać temu, co widać.** Było 7 — czyli sam pień —
    // przy sprite'cie szerokim na 34 px. Gracz celuje w koronę, bo to ją widzi,
    // a gra sprawdzała pień i trafienie wychodziło tylko z bliska i na osi.
    // Trzynaście to nadal mniej niż połowa korony, więc nie da się ściąć drzewa
    // stojącego obok tego, w które się celuje.
    radius: 13,
    torso: 20,         // w co się celuje: pień na wysokości pasa
    respawn: 90_000,   // las odrasta, ale nie od razu
    drop: 'wood',
    dropCount: [2, 4],
  },
  boulder: {
    hp: 4,
    // Głaz ma 17 px szerokości sprite'a, więc promień 14 obejmuje go w całości
    // z niewielkim zapasem. Leży nisko, przez co był jeszcze trudniejszy do
    // trafienia niż drzewo: cios liczy się od tułowia do tułowia, a `torso: 8`
    // stawia punkt celu tuż nad ziemią.
    radius: 14,
    torso: 8,
    respawn: 120_000,
    drop: 'stone',
    dropCount: [1, 3],
  },
};

/**
 * Buduje listę zasobów z obiektów świata.
 *
 * Kolejność wynika z kolejności `world.props`, a ta jest deterministyczna, bo
 * generator używa ziarna. **Nie wolno tu niczego sortować ani filtrować losowo** —
 * numer w tej liście jest identyfikatorem w sieci.
 */
export function buildNodes(world) {
  const nodes = [];
  for (const prop of world.props) {
    const kind = prop.key === 'tree' ? 'tree'
      : prop.key === 'boulder' ? 'boulder'
        : null;
    if (!kind) continue;
    const spec = NODE_KINDS[kind];
    nodes.push({
      id: nodes.length,
      kind,
      x: prop.x,
      y: prop.y,
      hp: spec.hp,
      maxHp: spec.hp,
      radius: spec.radius,
      torso: spec.torso,
    });
  }
  return nodes;
}

/**
 * Etap zniszczenia — 0 nietknięty, potem coraz bardziej.
 *
 * Osobno od punktów życia, bo etapów jest mniej niż ciosów i to etap decyduje
 * o rysunku. Przy czterech punktach i trzech etapach dwa pierwsze ciosy nie
 * zmieniają obrazka i to jest w porządku: gracz widzi wtedy pękanie, a nie
 * migotanie.
 */
export function nodeStage(kind, hp) {
  const max = NODE_KINDS[kind].hp;
  if (hp >= max) return 0;
  if (hp <= 0) return 3;
  return hp / max > 0.5 ? 1 : 2;
}
