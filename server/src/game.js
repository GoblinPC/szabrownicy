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
} from '../../client/src/world/forge.js';
import {
  advance, poseOf, KEY_MASK, inAttackArc, ATTACK_STEPS,
} from '../../client/src/world/movement.js';
import { buildNodes, NODE_KINDS } from '../../client/src/world/nodes.js';

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

export class Game {
  constructor() {
    this.world = buildWorld();
    this.players = new Map();
    this.mobs = new Map();
    this.tickNumber = 0;

    const dummy = makeDummy(1);
    this.mobs.set(dummy.id, dummy);

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
      if (!this.reaches(player, node)) continue;

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
        // Rzeczy na ziemi znikają po chwili, żeby las nie zarósł drewnem
        // po godzinie rąbania.
        until: now + 120_000,
      });
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
  reaches(player, target) {
    // Liczone od tułowia do tułowia, a nie od stóp do stóp: przy stopach wszystko
    // jest na tej samej wysokości i cios sięgałby za daleko w pionie. Wysokość
    // tułowia jest cechą celu (`torso`), bo kukła i goblin są różnej wielkości.
    return inAttackArc(
      player,
      target.x - player.x,
      (target.y - (target.torso ?? 12)) - (player.y - 12),
      target.radius ?? 0,
    );
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

      // Martwy nie bije.
      if (player.hp <= 0) continue;

      for (const mob of this.mobs.values()) {
        if (mob.hp <= 0) continue;
        if (!this.reaches(player, mob)) continue;

        mob.hp = Math.max(0, mob.hp - step.damage);
        if (!mob.anchored) {
          mob.vx += player.atkDx * step.knockback;
          mob.vy += player.atkDy * step.knockback;
        }
        mob.hitDx = player.atkDx;
        mob.hitDy = player.atkDy;
        mob.hitSeq++;
        if (mob.hp === 0) mob.deadUntil = now + RESPAWN_MS;
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
        if (this.hurt(target, step.damage, player.atkDx, player.atkDy, now)) {
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
    this.respawn(target);
    return true;
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

  /** Odrzut wygasa, a kukła wraca na swój słupek. */
  stepMobs(now, dt) {
    for (const mob of this.mobs.values()) {
      if (mob.hp <= 0 && now >= mob.deadUntil) {
        mob.hp = mob.maxHp;
        mob.x = mob.homeX;
        mob.y = mob.homeY;
        mob.vx = 0;
        mob.vy = 0;
        mob.hitSeq++;   // klient po tym pozna, że kukła wstała
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
    this.resolveHits(now);
    this.stepMobs(now, TICK_MS / 1000);
    this.stepPlayers();
    this.stepNodes(now);
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

