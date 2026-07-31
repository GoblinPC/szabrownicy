// Stan świata po stronie serwera.
//
// Zasada, na której stoi cała reszta: **klient nigdy nie podaje swojej pozycji**.
// Wysyła wyłącznie to, które klawisze trzyma wciśnięte, a serwer sam liczy, dokąd
// go to zaprowadziło. Dzięki temu nie da się przyspieszyć postaci ani przeniknąć
// przez ścianę, grzebiąc w kodzie klienta — najgorsze, co gracz może zrobić, to
// wcisnąć naraz cztery kierunki.
//
// Świat i kolizje pochodzą z tego samego pliku co u klienta.

import {
  buildWorld, SPAWN, WORLD_W, WORLD_H, TRAINING_DUMMY, CITY_PX,
  isWalkable,
} from '../../client/src/world/forge.js';
import {
  advance, poseOf, KEY_MASK, inAttackArc, ATTACK_STEPS, weaponOf,
} from '../../client/src/world/movement.js';
import { buildNodes, NODE_KINDS, NODE_ARC, NODE_REACH_BONUS } from '../../client/src/world/nodes.js';
import { makeBag, addItem, fits, ITEMS } from '../../client/src/world/items.js';

export const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const MAX_PLAYERS = 60;

// Wejście przychodzi jako komendy z własnym czasem trwania — tylko wtedy klient
// jest w stanie odtworzyć u siebie dokładnie ten sam wynik, co serwer, i korekta
// nie objawia się szarpnięciem postaci.
const MAX_COMMAND_DT = 0.05;      // pojedyncza komenda nigdy dłuższa niż 50 ms
const MAX_QUEUED = 48;            // kolejka nie rośnie w nieskończoność
// Klient liczy krokami po 16 ms, więc na jeden tik serwera (50 ms) przypadają
// zwykle trzy komendy. Zapas jest na nadrabianie po przyciętej klatce — gdyby
// był za mały, zaległości odkładałyby się w kolejce i ruch zacinałby się mimo
// poprawnego klienta.
const MAX_PER_TICK = 20;
// Zapas czasu: gracz może zużyć najwyżej 15% więcej czasu symulacji, niż
// naprawdę minęło. To jest zabezpieczenie przed przyspieszaniem postaci przez
// wysyłanie zawyżonego `dt` — bez niego przerobiony klient chodziłby dwa razy
// szybciej, mimo że pozycję liczy serwer.
const BUDGET_RATE = 1.15;
const BUDGET_CAP = 0.35;

// --- Cele do bicia ------------------------------------------------------------
//
// Kukła treningowa jest **wzorcem dla przyszłych mobów**, nie wyjątkiem: ma
// punkty życia, przyjmuje trafienia liczone po stronie serwera, dostaje odrzut,
// przewraca się i wstaje. Potworki będą tym samym kodem, tylko z chodzeniem.
//
// Wszystko poza wyglądem należy do serwera. Klient nie może decydować, że trafił —
// bo docelowo to jest survival PvP i jest o co oszukiwać.

// Odrzut przesuwający cel po ziemi — dla chodzących mobów, gdy takie będą.
//
// Kukła go **nie dostaje** i to jest osobna decyzja, wyniesiona z dwóch nieudanych
// prób. Pozycja celu przychodzi z serwera dwadzieścia razy na sekundę, więc każdy
// jej ruch ma tylko trzy–cztery klatki na całe szarpnięcie. Bez względu na
// dobrane liczby wygląda to jak spowolnione odjeżdżanie, a nie jak cios. Kukła
// jest zresztą przywiązana do słupka i nie ma powodu nigdzie jechać.
//
// Reakcję kukły — szarpnięcie i ściśnięcie — rysuje więc klient, natychmiast
// i gładko, w swoich sześćdziesięciu klatkach. Serwer zostaje właścicielem tego,
// co ma znaczenie dla rozgrywki: punktów życia i faktu trafienia.
const KNOCKBACK = 170;
const KNOCKBACK_DAMPING = 13;
const HOME_PULL = 40;
const RESPAWN_MS = 4000;

// Ile świata dosyłamy graczowi poza to, co widzi. Kamera przy zoomie 2x pokazuje
// jakieś 480 px, więc 700 daje zapas na dojście i na to, żeby rzeczy nie
// pojawiały się dokładnie na krawędzi ekranu.
const VIEW_RANGE = 700;

// Zasięg podnoszenia z ziemi. Trochę większy od promienia stopy, żeby nie trzeba
// było celować w kłodę — ale mniejszy od zasięgu ciosu, bo podnoszenie ma być
// osobną czynnością, nie skutkiem ubocznym machania.
const PICK_RANGE = 22;

// Głód. Pełny pasek starczy na jakieś piętnaście minut gry — mniej więcej dobę
// w świecie. Wyprawa po drewno mieści się spokojnie, dwie już nie.
const FOOD_MAX = 100;
const FOOD_DRAIN = FOOD_MAX / (15 * 60);   // punktów na sekundę
// Pusty żołądek zabiera całe życie w niecałe dwie minuty. Ma boleć, ale ma też
// zostawić czas na dobiegnięcie do czegoś jadalnego.
const STARVE_DPS = 1.0;

// --- Gracz: życie, śmierć, strefa bezpieczna ----------------------------------
//
// Bez tego nie ma pętli gry: wychodzi się po surowce dlatego, że można ich nie
// donieść. Wszystko liczy serwer — kto ile ma życia i kto kogo trafił — bo to
// jest survival PvP i jest o co oszukiwać.

const PLAYER_HP = 100;

// Śmierć jest **natychmiastowa**: zero życia i od razu odrodzenie w hali.
//
// Pierwsza wersja kładła trupa na trzy sekundy i wyglądało to źle z powodu, który
// był do przewidzenia: zabity zostawał w miejscu, przygaszony i bezwładny, więc
// czytało się to jak zawieszenie gry, a nie jak śmierć. Leżące ciało ma sens
// dopiero wtedy, gdy jest po co przy nim stać — czyli gdy wypadną z niego rzeczy.
// Do tego czasu prościej i uczciwiej jest zniknąć.

// **Życie nie regeneruje się samo. Nigdy.**
//
// To jest decyzja o gatunku, nie o balansie, i była już raz podjęta źle: pierwsza
// wersja miała powolne odnawianie poza walką. Przy samoleczeniu każda rana jest
// tymczasowa, więc żadna nie jest decyzją — siada się na chwilę w krzakach i gra
// toczy się dalej. Leczyć mają: mikstury (kupione albo zrobione), łóżko we własnym
// pokoju i jedzenie. Wszystkie kosztują.
//
// Odrodzenie **nie daje pełnego życia** z tego samego powodu. Bez tego istnieje
// najprostsze możliwe nadużycie: zabić się, żeby wrócić zdrowym. Docelowa kara za
// śmierć to utrata niesionych rzeczy — dojdzie razem z ekwipunkiem.
const RESPAWN_HP = 0.5;

/**
 * Czy punkt leży w strefie bezpiecznej, czyli **w mieście**.
 *
 * Miasto to hala kuźni razem z placem. PvP zaczyna się dopiero za murami, po
 * wyjściu jedną z trzech bram — i wtedy przekroczenie bramy jest **decyzją**,
 * a nie przypadkiem. Wcześniejsza wersja robiła strefę tylko z hali i to było
 * za wcześnie: plac jest częścią miasta, a nie dziczy.
 *
 * Uwaga na czas testów: dopóki nie ma świata za bramami, **cała mapa jest
 * bezpieczna** i graczy nie da się bić nigdzie. To jest poprawne, nie zepsute.
 */
export function inSafeZone(x, y) {
  return x >= CITY_PX.x && x <= CITY_PX.x + CITY_PX.w
    && y >= CITY_PX.y && y <= CITY_PX.y + CITY_PX.h;
}

// Worek do bicia ma **wytrzymywać** — służy do strojenia odczucia ciosu, a nie
// do zabijania. Pięćdziesiąt ciosów, więc przy testowaniu nie pada pod ręką.
const DUMMY_HP = 600;

function makeDummy(id) {
  return {
    id,
    kind: 'dummy',
    // Przywiązana do słupka: nie jeździ po placu, a reakcję na cios rysuje klient.
    anchored: true,
    // Promień celu. Trafienie liczy się do środka, a gracz celuje w sylwetkę —
    // bez tego cios wizualnie dotykał kukły, a mimo to nie wchodził.
    radius: 9,
    // Wysokość tułowia nad stopami — punkt, w który mierzy cios.
    torso: 16,
    x: TRAINING_DUMMY.x,
    y: TRAINING_DUMMY.y,
    homeX: TRAINING_DUMMY.x,
    homeY: TRAINING_DUMMY.y,
    vx: 0,
    vy: 0,
    hp: DUMMY_HP,
    maxHp: DUMMY_HP,
    // Znacznik trafienia — rośnie z każdym ciosem. Klient porównuje go z poprzednim
    // i po zmianie odpala reakcję: błysk, krew, wstrząs. Sam spadek punktów życia
    // by nie wystarczył, bo dwa trafienia mogłyby wypaść między migawkami.
    hitSeq: 0,
    hitDx: 0,
    hitDy: 0,
    deadUntil: 0,
  };
}

// --- Zwierzę ---------------------------------------------------------------
//
// Pierwszy mieszkaniec lasu i **wzorzec dla wszystkich przyszłych**.
//
// Zachowanie jest celowo proste, ale ma jedną cechę, na której stoi cała walka
// z nim: **szarżę z zapowiedzią**. Zwierzę zauważa gracza, zatrzymuje się na
// moment i dopiero wtedy rusza po prostej. Ten moment jest wszystkim — to on
// zamienia potwora, który po prostu podchodzi, w przeciwnika, którego trzeba
// przeczytać. Unik istnieje po to, żeby było czego unikać.
//
// Po chybionej szarży zwierzę **musi się zatrzymać i zawrócić**, i to jest jego
// jedyna słabość: wtedy się je bije. Bez tego okna walka byłaby wyścigiem.

const BOAR = {
  hp: 40,
  radius: 10,
  torso: 12,
  damage: 14,
  // Prędkości: wolniejszy od gracza w spokoju, wyraźnie szybszy w szarży.
  walk: 26,
  charge: 190,
  // Czasy fazy. Zapowiedź musi być **widoczna**, więc jest długa jak na walkę.
  noticeRange: 130,
  loseRange: 260,
  windupMs: 620,
  chargeMs: 900,
  restMs: 1100,
  hitCooldownMs: 900,
  respawnMs: 25_000,
};

export class Game {
  constructor() {
    this.world = buildWorld();
    this.players = new Map();
    this.mobs = new Map();
    this.tickNumber = 0;

    const dummy = makeDummy(1);
    this.mobs.set(dummy.id, dummy);
    this.spawnWildlife();

    // Zasoby: pełna lista jest deterministyczna i klient zna ją z tego samego
    // kodu. Trzymamy **tylko odstępstwa od pełnego stanu** — uszkodzone i ścięte.
    // Przy nietkniętym lesie to pusta mapa i zero bajtów na migawkę.
    this.nodes = buildNodes(this.world);
    this.hurtNodes = new Map();   // id → { hp, downUntil }
    // Rzeczy leżące na ziemi. Numerowane rosnąco, bo klient rozpoznaje je po
    // identyfikatorze, a nie po pozycji.
    this.drops = new Map();
    this.nextDrop = 1;
  }

  /**
   * Rozstawia zwierzęta po lesie — **tylko poza murami**.
   *
   * Miejsca losowane z odrzucaniem: musi być przechodnie i dostatecznie daleko
   * od miasta, żeby nikt nie dostał szarży zaraz za bramą. Pierwsze wyjście ma
   * być spokojne; niebezpiecznie robi się głębiej i to jest jedyny wskaźnik
   * trudności w tej grze.
   */
  spawnWildlife() {
    let id = 100;
    let placed = 0;
    for (let attempt = 0; attempt < 4000 && placed < 14; attempt++) {
      const x = 60 + Math.random() * (WORLD_W - 120);
      const y = 60 + Math.random() * (WORLD_H - 120);
      if (inSafeZone(x, y)) continue;
      // Zapas od murów: 120 pikseli to jakieś siedem kafli spokoju za bramą.
      if (x > CITY_PX.x - 120 && x < CITY_PX.x + CITY_PX.w + 120
        && y > CITY_PX.y - 120 && y < CITY_PX.y + CITY_PX.h + 120) continue;
      if (!isWalkable(this.world, x - 8, y - 8, x + 8, y - 0.5)) continue;

      placed++;
      const mob = {
        id: id++,
        kind: 'boar',
        radius: BOAR.radius,
        torso: BOAR.torso,
        x, y, homeX: x, homeY: y,
        vx: 0, vy: 0,
        hp: BOAR.hp,
        maxHp: BOAR.hp,
        hitSeq: 0, hitDx: 0, hitDy: 0,
        deadUntil: 0,
        state: 'wander',
        facing: 'down',
      };
      this.mobs.set(mob.id, mob);
    }
  }

  /** Bieżący stan zasobu — z mapy odstępstw albo pełny. */
  nodeState(node) {
    return this.hurtNodes.get(node.id) ?? { hp: node.maxHp, downUntil: 0 };
  }

  /**
   * Cios gracza w zasób.
   *
   * Zasoby są **celami jak każdy inny** — ten sam łuk trafienia, ten sam znacznik
   * cięcia. Rąbanie drzewa nie ma osobnego przycisku i to jest świadome: jedno
   * uderzenie ma działać na wszystko, w co się trafi.
   */
  chopNodes(player, step, now) {
    for (const node of this.nodes) {
      const state = this.nodeState(node);
      if (state.hp <= 0) continue;
      if (!this.reachesNode(player, node)) continue;

      const hp = Math.max(0, state.hp - 1);
      this.hurtNodes.set(node.id, { hp, downUntil: 0, at: now });

      if (hp === 0) {
        const spec = NODE_KINDS[node.kind];
        this.hurtNodes.set(node.id, { hp: 0, downUntil: now + spec.respawn, at: now });
        // Kierunek ciosu leci razem ze zdarzeniem: drzewo ma się przewrócić
        // **w tę stronę, w którą je uderzono**.
        this.hurtNodes.get(node.id).dx = Math.round(player.atkDx * 100) / 100;
        this.hurtNodes.get(node.id).dy = Math.round(player.atkDy * 100) / 100;
        this.spawnDrop(node, spec, now);
      }
    }
  }

  /** Rzeczy wypadające w danym punkcie — wspólne dla zasobów i dla zwierząt. */
  dropAt(x, y, kind, count, now) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 4 + Math.random() * 10;
      const id = this.nextDrop++;
      this.drops.set(id, {
        id,
        item: kind,
        x: Math.round(x + Math.cos(a) * d),
        y: Math.round(y + Math.sin(a) * d * 0.6),
        ready: now + 300,
        until: now + 120_000,
      });
    }
  }

  /** Rzeczy wypadające ze ściętego zasobu — rozrzucone wokół jego podstawy. */
  spawnDrop(node, spec, now) {
    const [lo, hi] = spec.dropCount;
    const count = lo + Math.floor(Math.random() * (hi - lo + 1));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 14;
      const id = this.nextDrop++;
      this.drops.set(id, {
        id,
        item: spec.drop,
        x: Math.round(node.x + Math.cos(a) * d),
        y: Math.round(node.y + Math.sin(a) * d * 0.6),
        // Chwila zwłoki, zanim da się podnieść. Bez niej rzecz znika w tej samej
        // klatce, w której wypadła — gracz stoi przy pniu, więc jest w zasięgu —
        // i nie widać, że cokolwiek wypadło.
        ready: now + 500,
        // Rzeczy na ziemi znikają po chwili, żeby las nie zarósł drewnem
        // po godzinie rąbania.
        until: now + 120_000,
      });
    }
  }

  /**
   * Odstępstwa od pełnego świata — **tylko zasoby uszkodzone albo ścięte**.
   *
   * Drzew jest kilkaset i wszystkie są w tym samym stanie przez większość czasu,
   * więc wysyłanie ich listy byłoby marnowaniem pasma na powtarzanie zera.
   * Numer w `this.nodes` jest identyfikatorem, bo lista powstaje po obu stronach
   * z tego samego świata (patrz `world/nodes.js`).
   *
   * Filtrujemy po odległości, bo inaczej gracz, który wyrąbał pół lasu, wysyła
   * całą tę listę wszystkim dwadzieścia razy na sekundę.
   */
  nodeSnapshot(me) {
    const list = [];
    for (const [id, state] of this.hurtNodes) {
      const node = this.nodes[id];
      if (!node) continue;
      if (Math.abs(node.x - me.x) > VIEW_RANGE || Math.abs(node.y - me.y) > VIEW_RANGE) continue;
      const entry = { i: id, h: state.hp };
      if (state.hp <= 0) {
        // Kierunek ciosu i chwila ścięcia: drzewo ma się przewrócić w tę stronę,
        // w którą je uderzono, a gracz wchodzący do lasu po fakcie ma zobaczyć
        // pniak, nie drzewo padające drugi raz.
        entry.dx = state.dx ?? 0;
        entry.dy = state.dy ?? 1;
        entry.t = state.at ?? 0;
      }
      list.push(entry);
    }
    return list;
  }

  /** Rzeczy leżące na ziemi w zasięgu wzroku gracza. */
  dropSnapshot(me) {
    const list = [];
    for (const drop of this.drops.values()) {
      if (Math.abs(drop.x - me.x) > VIEW_RANGE || Math.abs(drop.y - me.y) > VIEW_RANGE) continue;
      list.push({ i: drop.id, k: drop.item, x: drop.x, y: drop.y });
    }
    return list;
  }

  /**
   * Podnoszenie z ziemi — samo, przez wejście na rzecz.
   *
   * Bez guzika, bo dopóki nie ma plecaka-siatki, nie ma czego wybierać: wszystko,
   * co leży, i tak się mieści. Gdy dojdzie siatka, to jest **dokładnie to miejsce**,
   * w którym podnoszenie przestanie być automatyczne, bo wtedy pojawi się decyzja
   * „co zostawiam".
   */
  /** Najbliższa rzecz w zasięgu podniesienia, albo `null`. */
  reachableDrop(player, now) {
    let best = null;
    let bestD = Infinity;
    for (const drop of this.drops.values()) {
      if (now < drop.ready) continue;
      const dx = drop.x - player.x;
      const dy = (drop.y - player.y) * 1.6;   // rzut 3/4: w pionie jest ciaśniej
      const d = dx * dx + dy * dy;
      if (d > PICK_RANGE * PICK_RANGE || d >= bestD) continue;
      bestD = d;
      best = drop;
    }
    return best;
  }

  /**
   * Podniesienie **na żądanie**, nie przez wejście na rzecz.
   *
   * Pierwsza wersja wciągała wszystko, po czym się przeszło. Wygodne i złe:
   * przy plecaku, w którym miejsce jest zasobem, wciąganie łupu bez pytania
   * zabiera graczowi dokładnie tę decyzję, dla której siatka powstała — a przy
   * ucieczce z pełnym plecakiem zbierało śmieci wbrew niemu.
   */
  pickRequest(player, now) {
    if (player.hp <= 0) return;
    const drop = this.reachableDrop(player, now);
    if (!drop) return;
    // Pełny plecak zostawia rzecz na ziemi. To jest cały sens siatki: gdy miejsce
    // się kończy, łup przestaje wchodzić i trzeba coś wyrzucić.
    if (!addItem(player.bag, drop.item)) return;
    player.bagSeq++;
    player.pickSeq++;
    this.drops.delete(drop.id);
  }

  /**
   * Zjedzenie z plecaka.
   *
   * Jedzenie jest jedynym sposobem na głód i **nie regeneruje życia** — to dwie
   * różne rzeczy i mieszanie ich zabiłoby jedną z nich. Życie leczą mikstury,
   * łóżko i czas; głód leczy tylko jedzenie.
   */
  eatItem(player, id) {
    const i = player.bag.items.findIndex((it) => it.id === id);
    if (i < 0) return false;
    const spec = ITEMS[player.bag.items[i].kind];
    if (!spec?.food) return false;
    player.bag.items.splice(i, 1);
    player.food = Math.min(FOOD_MAX, player.food + spec.food);
    player.bagSeq++;
    player.foodSeq = (player.foodSeq ?? 0) + 1;
    return true;
  }

  /**
   * Głód.
   *
   * Wzorzec negatywny podany wprost przez użytkownika: głód w Ruście, o który
   * wszyscy mają w nosie, bo trudno od niego umrzeć i prawie nic nie odbiera.
   * Tutaj pusty żołądek **zabija** — powoli, ale bez zatrzymania, i nie da się
   * tego przeczekać, bo życie samo się nie regeneruje.
   *
   * Tempo dobrane tak, żeby pełny pasek starczał na jakieś piętnaście minut gry,
   * czyli mniej więcej jedną dobę w świecie. Wyprawa po drewno mieści się w tym
   * spokojnie, dwie już nie — i to jest ta chwila, w której trzeba zapolować.
   */
  stepHunger(player, dt, now) {
    if (player.hp <= 0) return;
    player.food = Math.max(0, player.food - FOOD_DRAIN * dt);
    if (player.food > 0) return;
    player.starve = (player.starve ?? 0) + STARVE_DPS * dt;
    // Obrażenia naliczamy całymi punktami, żeby pasek życia nie drgał ułamkami
    // dwadzieścia razy na sekundę.
    if (player.starve >= 1) {
      const ile = Math.floor(player.starve);
      player.starve -= ile;
      this.hurt(player, ile, 0, 0, now);
    }
  }

  /**
   * Przełożenie w plecaku na prośbę gracza.
   *
   * Klient przysyła **zamiar**, nie wynik: „przesuń przedmiot 3 na kratkę 2,4
   * obrócony". Sprawdzenie, czy taki przedmiot istnieje i czy tam wchodzi, jest
   * tutaj i tylko tutaj. Klient rysujący siatkę u siebie może twierdzić, co chce.
   */
  moveItem(player, id, x, y, rot) {
    const item = player.bag.items.find((it) => it.id === id);
    if (!item) return false;
    const r = rot ? 1 : 0;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (!fits(player.bag, item.kind, r, x, y, item.id)) return false;
    item.x = x;
    item.y = y;
    item.rot = r;
    player.bagSeq++;
    return true;
  }

  /**
   * Wyrzucenie z plecaka na ziemię.
   *
   * Druga połowa tej samej decyzji co pełny plecak: żeby coś weszło, coś musi
   * wyjść. Rzecz ląduje **pod nogami**, a nie znika — ma dać się podnieść z
   * powrotem i ma dać się zabrać komuś innemu.
   */
  dropItem(player, id, now) {
    const i = player.bag.items.findIndex((it) => it.id === id);
    if (i < 0) return false;
    const [item] = player.bag.items.splice(i, 1);
    player.bagSeq++;

    const dropId = this.nextDrop++;
    this.drops.set(dropId, {
      id: dropId,
      item: item.kind,
      x: Math.round(player.x + (Math.random() * 10 - 5)),
      y: Math.round(player.y + 4 + Math.random() * 4),
      // Dłuższa zwłoka niż przy łupie z drzewa: bez niej rzecz wyrzucona spod
      // nóg wskakuje z powrotem do plecaka, zanim gracz zdąży odejść.
      ready: now + 1200,
      until: now + 120_000,
    });
    return true;
  }

  /** Opis plecaka dla właściciela. Nikt inny go nie dostaje. */
  bagSnapshot(player) {
    return {
      w: player.bag.w,
      h: player.bag.h,
      s: player.bagSeq,
      it: player.bag.items.map((it) => ({ i: it.id, k: it.kind, x: it.x, y: it.y, r: it.rot })),
    };
  }

  /**
   * Czym gracz właśnie bije.
   *
   * Na razie **wprost z plecaka**: jest w nim dzida, to nią. Docelowo będzie
   * osobne pole na broń w ręce, ale dopóki jest jedna broń w grze, osobny slot
   * byłby interfejsem bez wyboru. Ważne jest to, co już działa: broń jest
   * przedmiotem, więc da się ją stracić — a to jest cała różnica względem
   * dzidy przyspawanej do postaci.
   */
  refreshWeapon(player) {
    const ma = player.bag.items.some((it) => it.kind === 'spear');
    player.weapon = ma ? 'spear' : null;
  }

  /**
   * Wyłącza zapory ściętych zasobów i włącza je z powrotem po odrośnięciu.
   *
   * Bez tego po rozbitym głazie zostaje **pusty prostokąt, w który się wchodzi** —
   * gracz obchodzi coś, czego nie widać. Zgłoszone z gry natychmiast.
   */
  syncNodeBodies() {
    if (!this.world.nodeBody) return;
    for (const [id, body] of this.world.nodeBody) {
      body.down = (this.hurtNodes.get(id)?.hp ?? 1) <= 0;
    }
  }

  /** Odrastanie i sprzątanie tego, czego nikt nie podniósł. */
  stepNodes(now) {
    for (const [id, state] of this.hurtNodes) {
      if (state.hp <= 0 && now >= state.downUntil) this.hurtNodes.delete(id);
    }
    for (const [id, drop] of this.drops) {
      if (now >= drop.until) this.drops.delete(id);
    }
  }

  /**
   * Czy cios gracza sięga danego celu — łukiem, nie prostokątem.
   *
   * Geometria siedzi w `movement.js`, żeby klient mógł jej użyć do rysowania
   * podpowiedzi zasięgu tym samym kodem, którym serwer liczy trafienia.
   */
  reaches(player, target, opcje = undefined) {
    // Liczone od tułowia do tułowia, a nie od stóp do stóp: przy stopach wszystko
    // jest na tej samej wysokości i cios sięgałby za daleko w pionie. Wysokość
    // tułowia jest cechą celu (`torso`), bo kukła i goblin są różnej wielkości.
    return inAttackArc(
      player,
      target.x - player.x,
      (target.y - (target.torso ?? 12)) - (player.y - 12),
      target.radius ?? 0,
      opcje,
    );
  }

  /** Ułatwienia przy celach, które nie uciekają i nie oddają. */
  reachesNode(player, node) {
    return this.reaches(player, node, { minArc: NODE_ARC, bonusRange: NODE_REACH_BONUS });
  }

  /**
   * Rozliczenie ciosów — po znaczniku cięcia, nie po sprawdzaniu fazy.
   *
   * Znacznik podnosi `advance()` dokładnie w kroku, w którym ostrze sięga. Poprzednia
   * wersja pytała raz na tik „czy jesteś w fazie cięcia" i gubiła uderzenia,
   * bo faza jest krótsza niż odstęp między tikami razy liczba nadrabianych kroków.
   */
  resolveHits(now) {
    for (const player of this.players.values()) {
      const strike = player.atkStrike ?? 0;
      if (strike === (player.atkResolved ?? 0)) continue;
      player.atkResolved = strike;

      // Który cios łańcucha trafił. Rąbnięcie z góry zabiera prawie trzy razy
      // tyle co lekkie cięcie i odrzuca dwa razy mocniej.
      const step = ATTACK_STEPS[player.atkStrikeStep ?? 0] ?? ATTACK_STEPS[0];
      // Broń mnoży obrażenia. Pięść zabiera niecałą połowę tego co włócznia —
      // ale prawdziwą różnicę robi zasięg, liczony w `inAttackArc()`.
      const dmg = step.damage * weaponOf(player.weapon).damage;

      // Martwy nie bije.
      if (player.hp <= 0) continue;

      for (const mob of this.mobs.values()) {
        if (mob.hp <= 0) continue;
        if (!this.reaches(player, mob)) continue;

        mob.hp = Math.max(0, mob.hp - dmg);
        if (!mob.anchored) {
          mob.vx += player.atkDx * step.knockback;
          mob.vy += player.atkDy * step.knockback;
        }
        mob.hitDx = player.atkDx;
        mob.hitDy = player.atkDy;
        mob.hitSeq++;
        // Zwierzę leży dłużej niż kukła: kukła jest przyrządem i ma wstawać od
        // razu, zwierzę jest zdobyczą i las ma się z niego wyczerpywać.
        if (mob.hp === 0) {
          mob.deadUntil = now + (mob.kind === 'boar' ? BOAR.respawnMs : RESPAWN_MS);
          // **Z dzika wypada mięso.** To jedyne źródło jedzenia w grze, więc to
          // ono zamyka głód w pętlę: żeby jeść, trzeba polować, a żeby polować,
          // trzeba wyjść ze strefy bezpiecznej.
          if (mob.kind === 'boar') this.dropAt(mob.x, mob.y, 'meat', 2 + Math.floor(Math.random() * 2), now);
        }
      }

      // Zasoby: drzewa i glazy sa celami jak kazdy inny.
      this.chopNodes(player, step, now);

      // Gracz na gracza.
      //
      // Strefę sprawdzamy po **obu stronach**: nie wolno bić stojąc w kuźni ani
      // bić kogoś, kto w niej stoi. Jeden warunek zamiast dwóch dawałby wygodne
      // nadużycie — wystarczyłoby stanąć w bramie i wyciągać ludzi ciosami.
      if (inSafeZone(player.x, player.y)) continue;

      for (const target of this.players.values()) {
        if (target === player || target.hp <= 0) continue;
        if (inSafeZone(target.x, target.y)) continue;
        if (!this.reaches(player, target)) continue;

        // Zabójstwo poznajemy po **wyniku `hurt()`**, a nie po życiu celu po
        // fakcie: odrodzenie jest natychmiastowe, więc zaraz po ciosie ofiara ma
        // już połowę życia i warunek `hp === 0` nigdy by nie zadziałał.
        if (this.hurt(target, dmg, player.atkDx, player.atkDy, now)) {
          player.kills++;
        }
      }
    }
  }

  /**
   * Jedno oberwanie: punkty, znacznik dla klienta i ewentualna śmierć.
   * Zwraca `true`, jeśli ten cios zabił.
   */
  hurt(target, damage, dx, dy, now) {
    target.hp = Math.max(0, target.hp - damage);
    target.hurtDx = dx;
    target.hurtDy = dy;
    target.hurtSeq++;
    target.lastHurtAt = now;

    if (target.hp > 0) return false;
    // **Wysypanie plecaka przed odrodzeniem**, bo `respawn()` przenosi gracza do
    // hali — po nim nie wiadomo już, gdzie zginął.
    this.spillBag(target, now);
    this.respawn(target);
    return true;
  }

  /**
   * Śmierć wyrzuca niesione rzeczy.
   *
   * Bez tego śmierć nic nie kosztuje, a plecak-siatka jest ozdobą: skoro nic nie
   * tracisz, to nie ma znaczenia, ile niesiesz. To jest ta jedna rzecz, która
   * zamienia wyjście za mury w decyzję — im dłużej zbierasz, tym więcej masz do
   * stracenia w drodze powrotnej.
   *
   * **Na razie rzeczy leżą osobno, nie w jednym worku.** Docelowo ma po trupie
   * zostać worek, który się otwiera i z którego przekłada się tyle, ile się
   * zmieści — czyli decyzja „co biorę", podejmowana stojąc nad ciałem w otwartym
   * świecie. Wymaga to interfejsu cudzego pojemnika, którego jeszcze nie ma;
   * rozsypane rzeczy dają dziś ten sam koszt śmierci, tylko brzydziej.
   */
  spillBag(player, now) {
    if (!player.bag.items.length) return;
    for (const item of player.bag.items) {
      this.dropAt(player.x, player.y, item.kind, 1, now);
    }
    player.bag.items.length = 0;
    player.bagSeq++;
  }

  /**
   * Odrodzenie: pełne przestawienie stanu walki i powrót do hali.
   *
   * Robione w tej samej chwili, w której padło zero życia — bez pauzy, bez trupa
   * i bez czekania na kolejny tik. Gracz ma zniknąć stamtąd, gdzie zginął,
   * i pojawić się w kuźni.
   */
  respawn(player) {
    player.deaths++;
    player.hp = Math.round(player.maxHp * RESPAWN_HP);
    // Rozrzut wokół punktu, żeby dwóch odrodzonych naraz nie wylądowało w sobie.
    player.x = SPAWN.x + (Math.random() * 20 - 10);
    player.y = SPAWN.y + (Math.random() * 12 - 6);
    player.vx = 0;
    player.vy = 0;
    // Cios i odskok gasną razem z życiem — inaczej odrodzony dokończyłby zamach
    // już przy nowym miejscu.
    player.atk = 0;
    player.atkWait = 0;
    player.dodge = 0;
    player.dodgeWait = 0;
    player.hurtSeq++;
  }

  /**
   * Siatka bezpieczeństwa na zero życia.
   *
   * Odrodzenie robi `hurt()` w chwili zabójstwa, więc normalnie nie ma tu nic do
   * roboty. To jest zabezpieczenie na wypadek, gdyby gracz stracił życie inną
   * drogą — utonięcie, głód, cokolwiek dojdzie później — bo wtedy trzeba go
   * podnieść, a nie zostawić na zawsze na zerze.
   */
  stepPlayers() {
    for (const player of this.players.values()) {
      if (player.hp <= 0) this.respawn(player);
    }
  }

  /**
   * Zachowanie zwierzęcia: włóczy się, zauważa, zapowiada, szarżuje, odpoczywa.
   *
   * Cztery stany i **każdy widać z zewnątrz** — to jest tu ważniejsze niż sam
   * układ. Gracz ma czytać zamiar, a nie zgadywać: `spot` to moment, w którym
   * zwierzę staje i patrzy, `charge` to prosta linia bez skrętu, `rest` to okno,
   * w którym można je bić bezkarnie.
   */
  stepBoar(mob, now, dt) {
    // Cel: najbliższy żywy gracz poza strefą bezpieczną.
    let target = null;
    let best = Infinity;
    for (const player of this.players.values()) {
      if (player.hp <= 0 || inSafeZone(player.x, player.y)) continue;
      const d = Math.hypot(player.x - mob.x, player.y - mob.y);
      if (d < best) { best = d; target = player; }
    }

    if (mob.state === 'charge' && now >= mob.until) {
      mob.state = 'rest';
      mob.until = now + BOAR.restMs;
    } else if (mob.state === 'spot' && now >= mob.until) {
      // Kierunek zamrażamy **w chwili ruszenia**, nie w każdej klatce. Szarża,
      // która skręca za graczem, jest nie do uniknięcia i przestaje być szarżą.
      const dx = (target?.x ?? mob.x) - mob.x;
      const dy = (target?.y ?? mob.y + 1) - mob.y;
      const len = Math.hypot(dx, dy) || 1;
      mob.runDx = dx / len;
      mob.runDy = dy / len;
      mob.state = 'charge';
      mob.until = now + BOAR.chargeMs;
    } else if (mob.state === 'rest' && now >= mob.until) {
      mob.state = 'wander';
    } else if ((mob.state === 'wander' || !mob.state)
      && target && best < BOAR.noticeRange) {
      mob.state = 'spot';
      mob.until = now + BOAR.windupMs;
      mob.seq = (mob.seq ?? 0) + 1;   // po tym klient pozna, że zwierzę stanęło
    }

    if (mob.state === 'charge') {
      mob.vx = mob.runDx * BOAR.charge;
      mob.vy = mob.runDy * BOAR.charge;
    } else if (mob.state === 'spot' || mob.state === 'rest') {
      // Stoi. To jest cała zapowiedź i całe okno na cios.
      mob.vx = 0;
      mob.vy = 0;
    } else {
      // Włóczęga: co kilka sekund nowy kierunek, wolno i bez celu.
      if (now >= (mob.turnAt ?? 0)) {
        mob.turnAt = now + 1600 + Math.random() * 2600;
        const a = Math.random() * Math.PI * 2;
        mob.wanderDx = Math.cos(a);
        mob.wanderDy = Math.sin(a);
        if (Math.random() < 0.35) { mob.wanderDx = 0; mob.wanderDy = 0; }
      }
      mob.vx = (mob.wanderDx ?? 0) * BOAR.walk;
      mob.vy = (mob.wanderDy ?? 0) * BOAR.walk;
    }

    // Ruch po świecie z kolizją — zwierzę nie przechodzi przez skały ani mury.
    const nx = mob.x + mob.vx * dt;
    const ny = mob.y + mob.vy * dt;
    if (isWalkable(this.world, nx - 6, ny - 6, nx + 6, ny - 0.5, true)) {
      mob.x = nx;
      mob.y = ny;
    } else if (mob.state === 'charge') {
      // Uderzyło w drzewo. Szarża kończy się od razu i **zwierzę zostaje ogłuszone** —
      // to jest nagroda za wciągnięcie go na przeszkodę.
      mob.state = 'rest';
      mob.until = now + BOAR.restMs * 1.4;
    } else {
      mob.turnAt = 0;
    }

    // Uderzenie ciałem — tylko w szarży i nie częściej niż raz na sekundę.
    if (mob.state === 'charge' && target && now - (mob.lastHit ?? 0) > BOAR.hitCooldownMs) {
      const d = Math.hypot(target.x - mob.x, target.y - mob.y);
      if (d < BOAR.radius + 8) {
        mob.lastHit = now;
        this.hurt(target, BOAR.damage, mob.runDx, mob.runDy, now);
        mob.state = 'rest';
        mob.until = now + BOAR.restMs;
      }
    }

    // Kierunek patrzenia — do rysunku. Z prędkości, bo zwierzę patrzy tam,
    // gdzie idzie.
    if (Math.abs(mob.vx) > Math.abs(mob.vy)) {
      mob.facing = 'side';
      // **Sprite dzika jest narysowany łbem w lewo**, więc odbijamy go dopiero
      // przy ruchu w prawo. Odwrotny warunek dawał zwierzę szarżujące tyłem —
      // biegło we właściwą stronę, ale ryjem do tyłu.
      mob.flip = mob.vx > 0;
    } else if (Math.abs(mob.vy) > 1) {
      mob.facing = mob.vy < 0 ? 'up' : 'down';
    }
    mob.moving = Math.hypot(mob.vx, mob.vy) > 4;
  }

  /** Odrzut wygasa, a kukła wraca na swój słupek. */
  stepMobs(now, dt) {
    for (const mob of this.mobs.values()) {
      if (mob.hp <= 0) {
        // **Martwy leży, dopóki nie minie czas odrodzenia.**
        //
        // Poprzednia wersja miała warunek `hp <= 0 && now >= deadUntil`, a zwierzę
        // rodziło się z `deadUntil: 0` — więc w tym samym tiku, w którym padło,
        // warunek był spełniony i wstawało z pełnym życiem. Objawiało się to
        // dokładnie tak, jak zgłosił użytkownik: „nie chce umrzeć".
        if (now < mob.deadUntil) continue;
        mob.hp = mob.maxHp;
        mob.x = mob.homeX;
        mob.y = mob.homeY;
        mob.vx = 0;
        mob.vy = 0;
        mob.state = 'wander';
        mob.hitSeq++;   // klient po tym pozna, że cel wstał
      }

      // Zwierzęta mają własne zachowanie — chodzą, zauważają i szarżują.
      // Ta linia była w poprzedniej wersji **zgubiona**: podmiana tekstu nie
      // trafiła w komentarz z myślnikiem, więc `stepBoar` istniało i nigdy nie
      // było wołane. Dzik stał w miejscu i nic nie robił.
      if (mob.kind === 'boar') {
        this.stepBoar(mob, now, dt);
        continue;
      }

      // Przywiązany cel nie rusza się w ogóle — jego reakcję rysuje klient.
      if (mob.anchored) continue;

      // Sprężyna do miejsca spoczynku plus tłumienie: cel szarpie się po ciosie
      // i wraca, zamiast odjechać w pole. Mob, który chodzi, dostanie tu zamiast
      // tego swoje sterowanie.
      mob.vx += (mob.homeX - mob.x) * HOME_PULL * dt;
      mob.vy += (mob.homeY - mob.y) * HOME_PULL * dt;
      const damping = Math.max(0, 1 - KNOCKBACK_DAMPING * dt);
      mob.vx *= damping;
      mob.vy *= damping;
      mob.x += mob.vx * dt;
      mob.y += mob.vy * dt;

      // Dociągnięcie do zera. Sprężyna z tłumieniem dochodzi do słupka
      // asymptotycznie i nigdy go nie osiąga — kukła zostawała półtora piksela
      // obok swojego miejsca, a serwer bez końca rozsyłał mikroskopijne zmiany
      // pozycji. Przy dostatecznie małym odchyleniu po prostu ją stawiamy.
      if (Math.abs(mob.homeX - mob.x) < 0.5 && Math.abs(mob.homeY - mob.y) < 0.5
        && Math.hypot(mob.vx, mob.vy) < 4) {
        mob.x = mob.homeX;
        mob.y = mob.homeY;
        mob.vx = 0;
        mob.vy = 0;
      }
    }
  }

  describeMob(mob) {
    return {
      id: mob.id,
      k: mob.kind,
      x: Math.round(mob.x * 2) / 2,
      y: Math.round(mob.y * 2) / 2,
      h: mob.hp,
      m: mob.maxHp,
      s: mob.hitSeq,
      r: mob.radius ?? 0,
      f: mob.facing ?? 'down',
      l: mob.flip ? 1 : 0,
      w: mob.moving ? 1 : 0,
      st: mob.state ?? '',
      // Kierunek ostatniego ciosu — po nim klient wie, w którą stronę bryzga krew.
      dx: Math.round(mob.hitDx * 100) / 100,
      dy: Math.round(mob.hitDy * 100) / 100,
    };
  }

  mobSnapshot() {
    const list = [];
    for (const mob of this.mobs.values()) list.push(this.describeMob(mob));
    return list;
  }

  get full() {
    return this.players.size >= MAX_PLAYERS;
  }

  add(id, { name, variant, admin = false }) {
    const player = {
      id,
      name,
      variant,
      admin,
      // Lekkie rozrzucenie wokół punktu startowego, żeby wchodzący nie lądowali
      // dokładnie jeden w drugim.
      x: SPAWN.x + (Math.random() * 24 - 12),
      y: SPAWN.y + (Math.random() * 16 - 8),
      vx: 0,
      vy: 0,
      queue: [],
      seq: 0,          // ostatnia rozliczona komenda — wraca do gracza jako "ack"
      budget: 0,
      facing: 'down',
      moving: false,
      flip: false,
      hp: PLAYER_HP,
      maxHp: PLAYER_HP,
      // Cel wielkości goblina: sylwetka ma jakieś 12 px szerokości, więc połowa
      // z zapasem. Bez promienia cios trzeba by wyprowadzić dokładnie w oś
      // przeciwnika, a gracz celuje w to, co widzi.
      radius: 6,
      torso: 12,
      // Znacznik oberwania — rośnie z każdym trafieniem. Klient po nim poznaje,
      // że padł **nowy** cios, tak samo jak przy celach do bicia. Sam spadek
      // punktów by nie wystarczył: dwa trafienia mogą wypaść między migawkami.
      hurtSeq: 0,
      hurtDx: 0,
      hurtDy: 0,
      lastHurtAt: 0,
      // Plecak-siatka. **Właścicielem zawartości jest serwer** — klient rysuje
      // kratki i prosi o przełożenie, a o tym, czy przedmiot się zmieścił i czy
      // w ogóle był, rozstrzyga ta struktura. Przy grze, w której łupi się innych
      // graczy, nie ma innej możliwości.
      bag: makeBag(),
      // Głód. Pełny na start, bo pierwsze minuty mają iść na rozejrzenie się,
      // a nie na natychmiastowe szukanie żarcia.
      food: FOOD_MAX,
      maxFood: FOOD_MAX,
      starve: 0,
      // Broń. `null` znaczy pięści — **stan startowy jest stanem najgorszym**,
      // więc brak informacji ma znaczyć „gołe ręce", nie „włócznia".
      weapon: null,
      // Znacznik zmiany zawartości: klient odświeża siatkę tylko wtedy, gdy coś
      // się naprawdę zmieniło, a nie dwadzieścia razy na sekundę.
      bagSeq: 0,
      // Znacznik podniesienia, tak samo jak `hurtSeq`: klient po nim poznaje,
      // że coś doszło, nawet gdy dwa podniesienia wypadną między migawkami.
      pickSeq: 0,
      kills: 0,
      deaths: 0,
    };
    this.players.set(id, player);
    return player;
  }

  remove(id) {
    this.players.delete(id);
  }

  /**
   * Dokłada komendy wejścia do kolejki gracza. Każda to `[seq, klawisze, ms]`.
   * Wszystko jest sprawdzane co do typu i zakresu — to jedyne miejsce, w którym
   * dane z sieci wpływają na symulację.
   */
  pushCommands(id, commands) {
    const player = this.players.get(id);
    if (!player || !Array.isArray(commands)) return;

    for (const command of commands.slice(0, MAX_PER_TICK * 2)) {
      if (!Array.isArray(command) || command.length < 3) continue;
      const [seq, keys, ms, turn] = command;
      if (!Number.isInteger(seq) || !Number.isInteger(keys) || !Number.isFinite(ms)) continue;
      if (seq <= player.seq) continue;                 // powtórka albo spóźnialska
      if (player.queue.length && seq <= player.queue[player.queue.length - 1][0]) continue;

      // Maska bierze się z `movement.js`, a nie jest tu wpisana liczbą. Wpisana na
      // sztywno (było `31`) cicho ucinała każdy nowo dodany klawisz: serwer go nie
      // widział, klient tak, i obie strony rozjeżdżały się bez śladu w logu.
      // Kąt celowania obcinany do bajtu. Brak pola (stary klient) daje `0`, czyli
      // patrzenie w prawo — nie wywala symulacji, tylko wygląda dziwnie, a wersja
      // klienta i tak siedzi w logu.
      player.queue.push([
        seq,
        keys & KEY_MASK,
        Math.max(0, Math.min(MAX_COMMAND_DT * 1000, ms)),
        Number.isFinite(turn) ? Math.round(turn) & 255 : 0,
      ]);
    }

    // Gdy kolejka się przepełnia (bardzo słabe łącze), odrzucamy najstarsze —
    // lepiej zgubić ruch sprzed sekundy niż rozjechać się z graczem na zawsze.
    if (player.queue.length > MAX_QUEUED) {
      player.queue.splice(0, player.queue.length - MAX_QUEUED);
    }
  }

  /** Jeden krok symulacji — świat rusza się wyłącznie tutaj. */
  tick() {
    this.tickNumber++;
    for (const player of this.players.values()) {
      player.budget = Math.min(BUDGET_CAP, player.budget + (TICK_MS / 1000) * BUDGET_RATE);

      let handled = 0;
      while (player.queue.length && handled < MAX_PER_TICK) {
        const [seq, keys, ms, turn] = player.queue.shift();
        // Kąt celowania z klienta. Zakres jest zamknięty (0–255 ósemek stopnia),
        // więc podrobiona wartość nie może dać niczego poza normalnym kierunkiem —
        // a kierunek i tak wybiera gracz.
        const aim = Number.isFinite(turn) ? ((turn & 255) / 256) * Math.PI * 2 : null;
        let dt = Math.min(ms / 1000, MAX_COMMAND_DT);
        // Licznik diagnostyczny: ile razy limit czasu obciął ruch. Przy uczciwym
        // kliencie powinno to być zero — jeśli rośnie, to zabezpieczenie dusi
        // normalną grę i postać zwalnia bez powodu.
        if (dt > player.budget) {
          dt = player.budget;
          player.clamped = (player.clamped ?? 0) + 1;
        }
        player.budget -= dt;
        player.seq = seq;
        handled++;
        // Komendy trupa **odliczamy, ale nie wykonujemy**: numer musi rosnąć,
        // żeby klient dostał potwierdzenie i nie odtwarzał ich w nieskończoność,
        // a leżący ma leżeć.
        if (dt > 0 && player.hp > 0) advance(this.world, player, keys, dt, aim);
      }
      // Ile komend czeka w kolejce — jeśli stale rośnie, serwer nie nadąża.
      player.backlog = player.queue.length;

      const pose = poseOf(player, player.facing);
      player.facing = pose.facing;
      player.aimName = pose.aim;
      player.moving = pose.moving;
      player.flip = pose.flip;

      // Pas bezpieczeństwa: gdyby jakikolwiek błąd wypchnął gracza poza mapę,
      // wracamy go na planszę zamiast pozwolić mu odlecieć w nieskończoność.
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
        player.x = SPAWN.x;
        player.y = SPAWN.y;
        player.vx = 0;
        player.vy = 0;
      }
      player.x = Math.max(0, Math.min(WORLD_W, player.x));
      player.y = Math.max(0, Math.min(WORLD_H, player.y));
    }

    // Trafienia dopiero po ruchu wszystkich graczy: cios ma sięgać z pozycji,
    // na której postać naprawdę stoi po wypadzie, a nie sprzed niego.
    const now = Date.now();
    // Broń **przed** rozliczeniem ciosów: to, co gracz trzyma, decyduje o zasięgu
    // i obrażeniach tego uderzenia, a nie następnego.
    for (const player of this.players.values()) this.refreshWeapon(player);
    this.resolveHits(now);
    this.stepMobs(now, TICK_MS / 1000);
    this.stepPlayers();
    for (const player of this.players.values()) this.stepHunger(player, TICK_MS / 1000, now);
    this.stepNodes(now);
    this.syncNodeBodies();
  }

  /** Opis gracza dla innych — bez prędkości, bo jej nie potrzebują do rysowania. */
  describe(player) {
    return {
      id: player.id,
      n: player.name,
      v: player.variant,
      x: Math.round(player.x * 2) / 2,
      y: Math.round(player.y * 2) / 2,
      f: player.facing,
      // Kierunek ciosu osobno od sylwetki: ukos używa tego samego boku, więc
      // z samego `f` nie dałoby się poznać, że ktoś dźga na ukos.
      k: player.aimName ?? player.facing,
      // Broń widoczna dla wszystkich: po sylwetce ma być widać, czy ktoś idzie
      // z dzidą, czy z gołymi rękami. To jest informacja, po której podejmuje
      // się decyzję, czy zaczepiać.
      w: player.weapon ?? '',
      m: player.moving ? 1 : 0,
      l: player.flip ? 1 : 0,
      // Znacznik ciosu. Odbiorca porównuje go z poprzednim i po zmianie odpala
      // animację — dzięki temu nowe uderzenie jest rozpoznawalne nawet wtedy, gdy
      // padło zaraz po poprzednim i migawki nie złapały przerwy między nimi.
      s: player.atkSeq ?? 0,
      // Życie jest jawne dla wszystkich: pasek nad głową rannego przeciwnika to
      // informacja, na której stoi decyzja „gonić czy odpuścić".
      h: Math.round(player.hp),
      mh: player.maxHp,
      // Znacznik oberwania — po nim klient odpala błysk i krew, tak samo jak
      // przy celach do bicia.
      hs: player.hurtSeq ?? 0,
      hx: Math.round((player.hurtDx ?? 0) * 100) / 100,
      hy: Math.round((player.hurtDy ?? 0) * 100) / 100,
      // Odznaka administratora — jawna dla wszystkich, żeby nie dało się
      // podszyć pod obsługę.
      a: player.admin ? 1 : 0,
    };
  }

  snapshot() {
    const list = [];
    for (const player of this.players.values()) list.push(this.describe(player));
    return list;
  }
}


