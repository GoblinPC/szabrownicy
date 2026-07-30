// Kuźnia — jedyna na razie strefa świata.

import { buildWorld, surfaceAt, TILE, WORLD_W, WORLD_H, SPAWN, INTERIOR_PX, ROOF_PX, BUILDING_PX } from '../world/forge.js';
import {
  poseOf, inAttackArc, attackStep, strikeFrom, ATTACK_STEPS, dodgeFuel,
  KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_RUN, KEY_ATTACK, KEY_DODGE,
} from '../world/movement.js';
import { Lighting } from '../render/lighting.js';
import { ShadowCaster } from '../render/shadows.js';
import { audio } from '../audio/audio.js';
import { Net } from '../net.js';
import { showLogin } from '../ui/login.js';
import { createTestPanel } from '../ui/testpanel.js';
import { Critters } from '../render/critters.js';
import { Rain } from '../render/rain.js';
import { Grass } from '../render/grass.js';
import { darkness } from '../world/daylight.js';

// Jak długo trzymamy wciśnięcie ciosu w buforze po puszczeniu klawisza.
const ATTACK_BUFFER_MS = 140;

export class ForgeScene extends Phaser.Scene {
  constructor() {
    super('Forge');
  }

  create() {
    this.world = buildWorld();
    this.tileIndex = this.cache.json.get('tileIndex').index;
    this.variants = this.cache.json.get('variants');

    this.drawGround();
    this.shadows = new ShadowCaster(this, this.world.lights);
    this.spawnProps();
    this.spawnFlames();
    this.spawnPlayer();
    this.spawnParticles();
    // Po cząstkach, bo emitery krwi i siana korzystają z tekstury `dot`, którą
    // tworzy `spawnParticles`.
    this.spawnMobs();
    this.drawRoof();

    this.lighting = new Lighting(this, this.world, INTERIOR_PX, BUILDING_PX);
    this.critters = new Critters(this, this.world, TILE, BUILDING_PX);
    this.rain = new Rain(this);
    this.grass = new Grass(this, this.world.tufts, this.tileIndex);

    this.setupCamera();
    this.setupInput();

    // Interfejs jako osobna scena — jego kamera nie jest powiększana, więc font
    // rysuje się piksel w piksel niezależnie od zoomu świata.
    this.scene.launch('Hud');
  }

  // --- Budowa świata ----------------------------------------------------------

  /**
   * Podłoże i dekale trafiają raz na jedną teksturę wielkości mapy. Zamiast
   * tysiąca siedmiuset osobnych obrazków silnik rysuje potem jeden.
   */
  drawGround() {
    const ground = this.add.renderTexture(0, 0, WORLD_W, WORLD_H)
      .setOrigin(0, 0)
      .setDepth(-100);

    ground.beginDraw();
    for (let y = 0; y < this.world.tiles.length; y++) {
      const row = this.world.tiles[y];
      for (let x = 0; x < row.length; x++) {
        ground.batchDrawFrame('tiles', this.tileIndex[row[x]], x * TILE, y * TILE);
      }
    }
    for (const decal of this.world.decals) {
      ground.batchDrawFrame('tiles', this.tileIndex[decal.key], decal.x, decal.y);
    }
    ground.endDraw();
  }

  /**
   * Dach hali — jedna tekstura rysowana nad postaciami. Z zewnątrz zasłania
   * wnętrze, po wejściu pod spód zanika, ale nie do zera: zostaje ślad, żeby
   * dalej było widać, że stoi się pod dachem, a nie na podwórku.
   *
   * Głębokość musi być poniżej warstwy świetlnej (9000), inaczej dach nie
   * dostawałby oświetlenia i świeciłby jak wycinanka.
   */
  drawRoof() {
    const roof = this.add.renderTexture(ROOF_PX.x, ROOF_PX.y, ROOF_PX.w, ROOF_PX.h)
      .setOrigin(0, 0)
      .setDepth(8600);

    roof.beginDraw();
    for (const tile of this.world.roof) {
      roof.batchDrawFrame('tiles', this.tileIndex[tile.key], tile.x - ROOF_PX.x, tile.y - ROOF_PX.y);
    }
    roof.endDraw();

    this.roof = roof;
    this.roofAlpha = 1;
  }

  /**
   * Czy stopy gracza są wewnątrz budynku. Liczone po obrysie MURÓW, nie po
   * rysunku dachu — próg jest przy bramie, a dach kończy się dwa kafle wyżej,
   * żeby nie wystawał nad mur.
   */
  isInsideBuilding(x, y) {
    return x >= BUILDING_PX.x && x <= BUILDING_PX.x + BUILDING_PX.w
      && y >= BUILDING_PX.y && y <= BUILDING_PX.y + BUILDING_PX.h;
  }

  updateRoof(dt) {
    const target = this.isInsideBuilding(this.px, this.py) ? 0.12 : 1;
    // Przejście płynne, bo skok przezroczystości przy przekraczaniu bramy
    // czyta się jak błąd wyświetlania.
    this.roofAlpha += (target - this.roofAlpha) * Math.min(1, dt * 6);
    this.roof.setAlpha(this.roofAlpha);
  }

  spawnProps() {
    for (const prop of this.world.props) {
      const sprite = this.add.image(prop.x, prop.y, 'props', prop.key)
        .setOrigin(0.5, 1)
        .setDepth(prop.y);

      // Płaskie drobiazgi nie rzucają cienia — tylko to, co faktycznie stoi.
      if (sprite.height >= 12 && !prop.noShadow) {
        this.shadows.add(prop.x, prop.y, 'props', prop.key, {
          squash: 0.42,
          width: Math.min(34, sprite.width + 4),
        });
      }

    }
  }

  spawnFlames() {
    for (const flame of this.world.flames) {
      this.add.sprite(flame.x, flame.y, 'props')
        .setOrigin(0.5, 1)
        .setDepth(flame.depth)
        .play(flame.anim);
    }
  }

  spawnPlayer() {
    this.variant = Number(localStorage.getItem('szab_variant') ?? 0) % this.variants.length;
    this.px = SPAWN.x;
    this.py = SPAWN.y;
    this.facing = 'down';

    this.playerShadow = this.shadows.add(this.px, this.py, 'goblins', `g${this.variant}_down_idle0`, {
      squash: 0.45,
      width: 18,
    });
    this.player = this.add.sprite(this.px, this.py, 'goblins')
      .setOrigin(0.5, 1)
      .setDepth(this.py);
    this.player.play(`g${this.variant}_down_idle`);

    // Pozycję własnej postaci prowadzi teraz warstwa sieciowa: przewiduje ruch
    // natychmiast, a co migawkę zestawia go z prawdą z serwera.
    this.net = new Net(this.world);
    this.net.onStatus((status) => this.scene.get('Hud')?.setNet(status));
    this.net.connect(SPAWN, this.variant);

    // Świat jest już widoczny, ale postać stoi bezwładnie, dopóki gracz nie
    // poda nicku i hasła. Formularz leży nad kanwą i sam obsługuje ponawianie.
    // Czat i tabela graczy budzą się dopiero po wejściu do gry — przed nim nie ma
    // ani do kogo pisać, ani kogo wypisywać.
    this.net.onChat((entry) => this.scene.get('Hud')?.addMessage(entry));

    // Własne oberwanie. Czerwony błysk na całym kadrze, bo gracz patrzy na
    // przeciwnika, a nie na swój pasek — informacja musi trafić tam, gdzie
    // akurat są oczy.
    this.net.onHurtSelf = () => {
      this.cameras.main.flash(140, 120, 18, 10, true);
      this.kickX = (this.kickX ?? 0) + (Math.random() - 0.5) * 3;
      this.kickY = (this.kickY ?? 0) + 2;
      audio.hit(1.1);
    };

    // O tym, czy pokazać formularz, decyduje serwer, nie klient — dzięki temu
    // wyłączenie logowania na czas testów nie da się włączyć podmianą pliku
    // w przeglądarce.
    this.net.onGate((gate) => {
      const entered = gate.guests
        ? this.net.joinAsGuest()
        : showLogin((name, pass) => this.net.authenticate(name, pass));

      entered.then((result) => {
        const hud = this.scene.get('Hud');
        hud?.setHello(result.name, result.fresh);
        hud?.setPlayerName(result.name);
        hud?.enableChat((text) => this.net.sendChat(text));
        hud?.setRosterSource(() => this.buildRoster());
      });
    });

    // Suwaki pory dnia i pogody. Chodzą razem z panelem diagnostycznym pod F1,
    // bo to ten sam rodzaj rzeczy — przyrząd, nie interfejs gracza.
    this.testPanel = createTestPanel(
      (phase) => this.net.setDayOverride(phase),
      (rain) => this.net.setRainOverride(rain)
    );

    this.others = new Map();
  }

  /**
   * Wszystko, co chodzi po świecie i może rozgarnąć trawę: własna postać, inni
   * gracze i moby. Lista budowana co klatkę, bo jest krótka, a trzymanie jej
   * w polu wymagałoby sprzątania przy każdym wyjściu gracza.
   */
  walkers() {
    const list = [{ x: this.px, y: this.py, vx: this.net.body?.vx ?? 0 }];
    for (const other of this.others.values()) {
      list.push({ x: other.sprite.x, y: other.sprite.y, vx: 0 });
    }
    for (const mob of this.mobs.values()) {
      list.push({ x: mob.sprite.x, y: mob.sprite.y, vx: 0 });
    }
    return list;
  }

  /** Wywoływane przez HUD, gdy gracz przełączy F1. */
  setDiagVisible(on) {
    this.testPanel?.setVisible(on);
  }

  /**
   * Cele do bicia. Kukła treningowa jest tu wzorcem dla przyszłych mobów: całą
   * prawdę o niej — pozycję, punkty życia, trafienia — prowadzi serwer, a klient
   * dokłada wyłącznie to, co widać i słychać.
   */
  spawnMobs() {
    this.mobs = new Map();

    // Krew i siano: dwa emitery, bo różnią się kolorem, wagą i czasem życia.
    // Krew leci nisko i szybko gaśnie, siano fruwa dłużej i lekko opada.
    this.bloodBurst = this.add.particles(0, 0, 'dot', {
      speed: { min: 20, max: 90 },
      lifespan: { min: 220, max: 520 },
      alpha: { start: 1, end: 0 },
      scale: { min: 1, max: 2 },
      gravityY: 120,
      tint: [0x8e2233, 0x5c1622, 0xc43a0d],
      emitting: false,
    }).setDepth(8000);

    this.strawBurst = this.add.particles(0, 0, 'dot', {
      speed: { min: 14, max: 60 },
      lifespan: { min: 400, max: 900 },
      alpha: { start: 1, end: 0 },
      scale: { min: 1, max: 2 },
      gravityY: 40,
      tint: [0x9c7047, 0x7a5738, 0xbda997],
      emitting: false,
    }).setDepth(8000);

    // Iskry w punkcie zetknięcia ostrza z celem — jasne i bardzo krótkie.
    // W trybie dodawania, więc rozbłyskują zamiast leżeć na obrazie plamą.
    this.sparkBurst = this.add.particles(0, 0, 'dot', {
      speed: { min: 40, max: 150 },
      lifespan: { min: 90, max: 220 },
      alpha: { start: 1, end: 0 },
      scale: { min: 1, max: 2 },
      tint: [0xffe08a, 0xffa524, 0xfffaf0],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(8600);

    // Paski życia rysujemy jednym obiektem dla wszystkich celów — jeden rysunek
    // na klatkę zamiast obiektu na każdego moba.
    this.mobBars = this.add.graphics().setDepth(8500);
  }

  /**
   * Reakcja na trafienie — wszystko, co składa się na „soczystość".
   *
   * Najmocniej działa **hitstop**: zatrzymanie animacji na 70 ms w chwili
   * zetknięcia ostrza z celem. To ono daje wrażenie, że cios w coś uderzył,
   * a nie przez coś przeleciał.
   */
  /**
   * Odskok — strona widoczna. Fizyka siedzi w `world/movement.js`.
   *
   * Nie ma osobnych klatek postaci i to jest świadome: odskok trwa 200 ms, więc
   * narysowana animacja i tak przemknęłaby niezauważona. Cały ruch niosą
   * **powidoki** — kilka bladych kopii sylwetki zostawionych na trasie. Czyta się
   * to jako szarpnięcie w bok i kosztuje trzy sprite'y zamiast dwunastu rysunków.
   */
  updateDodge(time) {
    const body = this.net.body;
    if (!body) return;

    const seq = body.dodgeSeq ?? 0;
    if (seq < (this.shownDodgeSeq ?? 0)) this.shownDodgeSeq = seq;
    if (seq > (this.shownDodgeSeq ?? 0)) {
      this.shownDodgeSeq = seq;
      audio.swing(0.55);
      // Kurz spod nóg w chwili wybicia — pokazuje, że postać się odepchnęła,
      // a nie odjechała.
      this.stepDust.emitParticleAt(this.px, this.py, 8);
    }

    if (!(body.dodge > 0)) return;

    // Powidok zostawiany co kilkadziesiąt milisekund, nie co klatkę — przy każdej
    // klatce zlewają się w jednolitą smugę i przestaje być widać ruch.
    if (time - (this.lastGhostAt ?? 0) < 34) return;
    this.lastGhostAt = time;
    this.spawnGhost();
  }

  /** Blada kopia sylwetki, zostawiana na trasie odskoku. */
  spawnGhost() {
    if (!this.ghosts) this.ghosts = [];

    const ghost = this.add.image(this.player.x, this.player.y, 'goblins', this.player.frame.name)
      .setOrigin(0.5, 1)
      .setFlipX(this.player.flipX)
      .setDepth(this.player.depth - 1)
      .setAlpha(0.45)
      .setTint(0x8ab355);

    this.ghosts.push({ image: ghost, life: 0 });
  }

  updateGhosts(delta) {
    if (!this.ghosts?.length) return;
    const life = 220;

    this.ghosts = this.ghosts.filter((entry) => {
      entry.life += delta;
      if (entry.life >= life) {
        entry.image.destroy();
        return false;
      }
      entry.image.setAlpha(0.45 * (1 - entry.life / life));
      return true;
    });
  }

  /**
   * Przewidywanie trafienia u klienta.
   *
   * Punkty życia należą do serwera, ale jego potwierdzenie wraca dopiero po
   * drodze tam i z powrotem plus tik świata — ponad sto milisekund po tym, jak
   * gracz zobaczył własne cięcie. Kukła reagowała przez to zauważalnie później,
   * niż padał cios.
   *
   * Reakcję odpalamy więc natychmiast, **tym samym testem łuku**, którego używa
   * serwer (`inAttackArc`). Potwierdzenie z serwera już jej nie powtarza. Gdyby
   * przewidywanie się pomyliło, najgorsze co się stanie, to błysk i trochę krwi
   * bez ubytku życia — a życie i tak pokazuje pasek, który idzie z serwera.
   */
  predictHits(time) {
    const body = this.net.body;
    if (!body) return;

    // Licznik uderzeń bierzemy rosnąco. Po korekcie z serwera potrafi na moment
    // cofnąć się do wartości sprzed niepotwierdzonych komend, a zaraz potem
    // wrócić — porównanie „różne niż poprzednio" odpaliłoby wtedy reakcję dwa razy.
    const strike = body.atkStrike ?? 0;
    // Po ponownym połączeniu serwer daje nową postać i licznik startuje od zera.
    // Bez tego przewidywanie zamilkłoby na zawsze, bo nigdy nie przebiłoby
    // wartości sprzed rozłączenia.
    if (strike < (this.shownStrike ?? 0)) this.shownStrike = strike;
    if (strike <= (this.shownStrike ?? 0)) return;
    this.shownStrike = strike;

    // Który cios łańcucha właśnie sięgnął. Zaznacza to fizyka, więc klient
    // i serwer patrzą na to samo ogniwo.
    const struck = ATTACK_STEPS[body.atkStrikeStep ?? 0] ?? ATTACK_STEPS[0];

    let landed = 0;
    for (const mob of this.mobs.values()) {
      const state = mob.state;
      if (!state || state.h <= 0) continue;
      const reaches = inAttackArc(
        body,
        state.x - body.x,
        (state.y - 16) - (body.y - 12),
        state.r ?? 0,
      );
      if (!reaches) continue;
      landed++;
      // Przewidujemy też liczbę obrażeń — z tego samego opisu ciosu, którego
      // użyje serwer, i dla tego samego ogniwa łańcucha.
      this.reactToHit(mob, { ...state, dx: body.atkDx, dy: body.atkDy }, time, {
        lost: struck.damage,
        killing: state.h - struck.damage <= 0,
        step: struck,
      });
    }

    // Świst leci przy każdym cięciu — także wtedy, gdy poszło w powietrze. Bez
    // odpowiedzi na pusty zamach całość czuć jak klikanie w nic.
    audio.swing(landed > 0 ? 1 : 0.85);
  }

  /**
   * Odjęte punkty życia, wypływające nad celem.
   *
   * Liczba jest jedyną rzeczą, która mówi wprost „to zadziałało i o tyle" —
   * błysk i krew pokazują, że trafiłeś, ale nie ile to dało.
   */
  spawnDamageNumber(x, y, amount, killing) {
    if (!this.damageNumbers) this.damageNumbers = [];

    const label = this.add.bitmapText(Math.round(x), Math.round(y), 'goblin', `-${amount}`, 11)
      .setOrigin(0.5, 1)
      .setDepth(9100)   // nad warstwą świetlną: liczba ma być czytelna także w mroku
      .setTint(killing ? 0xffe08a : 0xf2700f);

    this.damageNumbers.push({
      label,
      life: 0,
      // Lekki rozrzut w bok, żeby kolejne liczby nie nakładały się na siebie
      // w jeden nieczytelny słupek.
      driftX: (Math.random() * 2 - 1) * 12,
    });
  }

  updateDamageNumbers(delta) {
    if (!this.damageNumbers?.length) return;
    const life = 700;

    this.damageNumbers = this.damageNumbers.filter((entry) => {
      entry.life += delta;
      const k = entry.life / life;
      if (k >= 1) {
        entry.label.destroy();
        return false;
      }
      // Wypływa szybko i zwalnia, zamiast sunąć równo — równy ruch wygląda
      // jak przewijany napis, nie jak odbita liczba.
      const rise = 1 - (1 - k) * (1 - k);
      entry.label.y = entry.startY ?? (entry.startY = entry.label.y);
      entry.label.setPosition(
        Math.round((entry.startX ?? (entry.startX = entry.label.x)) + entry.driftX * k),
        Math.round(entry.startY - rise * 22),
      );
      entry.label.setAlpha(k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
      return true;
    });
  }

  /**
   * Reakcja na oberwanie **gracza** — lżejsza niż przy celach do bicia.
   *
   * Świadomie bez hitstopu i bez wstrząsu kamery: te dwa należą do ciosu, który
   * sam wyprowadzasz. Zatrzymywanie obrazu za każdym razem, gdy dwóch obcych
   * graczy okłada się na drugim końcu placu, zamieniłoby grę w pokaz slajdów.
   */
  reactToPlayerHit(other, sample, lost) {
    const x = sample.x;
    const y = sample.y - 12;

    this.spawnDamageNumber(x, y - 8, lost, sample.h <= 0);

    const angle = Math.atan2(sample.hy ?? 0, sample.hx ?? 1) * (180 / Math.PI);
    this.bloodBurst.setConfig({ angle: { min: angle - 42, max: angle + 42 } });
    this.bloodBurst.emitParticleAt(x, y, 12);

    other.sprite.setTintFill(0xfffaf0);
    this.time.delayedCall(70, () => other.sprite.clearTint());
  }

  reactToHit(mob, state, time, { lost, killing, step = ATTACK_STEPS[0] }) {
    mob.reactedAt = time;
    const x = state.x;
    const y = state.y - 16;

    // Rąbnięcie z góry brzmi ciężej niż lekkie cięcie, a zabicie jeszcze ciężej.
    // Siła dźwięku idzie za siłą ciosu — inaczej wszystkie trzy brzmią tak samo
    // i łańcuch traci połowę różnicy.
    const weight = step.damage / ATTACK_STEPS[0].damage;
    audio.hit(killing ? weight * 1.25 : weight);
    this.spawnDamageNumber(x, y - 8, lost, killing);

    // Krew bryzga w kierunku ciosu, siano rozlatuje się na wszystkie strony.
    const angle = Math.atan2(state.dy ?? 0, state.dx ?? 1) * (180 / Math.PI);
    this.bloodBurst.setConfig({ angle: { min: angle - 42, max: angle + 42 } });
    this.bloodBurst.emitParticleAt(x, y, 14);
    this.strawBurst.emitParticleAt(x, y, 10);

    // Błysk: cel na moment robi się biały. Najstarsza i najskuteczniejsza sztuczka
    // na pokazanie trafienia.
    mob.sprite.setTintFill(0xfffaf0);
    this.time.delayedCall(70, () => mob.sprite.clearTint());

    // Ściśnięcie: cel na moment robi się szerszy i niższy. Kosztuje jedną linię,
    // a dokłada do trafienia więcej niż odrzut — bo widać je natychmiast, w tej
    // samej klatce, w której pada cios.
    mob.squashX = 1.2;
    mob.squashY = 0.8;

    // Szarpnięcie rysowane **u klienta**, nie brane z serwera.
    //
    // Pozycja celu przychodzi z serwera dwadzieścia razy na sekundę, więc odrzut
    // liczony tam miał trzy klatki na całe szarpnięcie i wyglądał jak spowolnione
    // odjeżdżanie. Tutaj wygasa gładko, w każdej klatce obrazu, i widać go w tej
    // samej chwili, w której pada cios — bez czekania na migawkę.
    mob.kickX = (state.dx ?? 0) * 7;
    mob.kickY = (state.dy ?? 0) * 7;

    // Hitstop na całej scenie — łącznie z postacią, która uderza. Zatrzymanie
    // tylko celu nie działa: to ręka ma poczuć opór.
    //
    // Długość idzie **za siłą ciosu**: lekkie cięcie ledwie zahacza, rąbnięcie
    // z góry zatrzymuje obraz na dwa razy dłużej. Stały hitstop sprawia, że
    // wszystkie ciosy ważą tyle samo, choćby zadawały różne obrażenia.
    this.anims.pauseAll();
    this.time.delayedCall(killing ? step.hitstop * 1.4 : step.hitstop,
      () => this.anims.resumeAll());

    // Kierunkowe szarpnięcie kamerą, nie losowe trzęsienie.
    //
    // `camera.shake()` losuje przesunięcie na obu osiach i przy jakiejkolwiek
    // sensownej sile czyta się jako trzęsienie ziemi, nie jako cios — pierwsza
    // wersja została opisana jako „całym ekranem trzęsie jakbym był w kosmosie".
    // Krótkie szarpnięcie w stronę ciosu daje impakt i nie odrywa wzroku od postaci.
    const kick = killing ? step.kick * 1.8 : step.kick;
    this.kickX = -(state.dx ?? 0) * kick;
    this.kickY = -(state.dy ?? 0) * kick;

    // Odrzut atakującego: postać odbija się od tego, w co uderzyła. Kosztuje
    // dwie linie, a jest tym, po czym **ręka czuje opór** — bez niego cios
    // przelatuje przez cel, zamiast w niego wejść.
    this.recoilX = -(state.dx ?? 0) * step.kick * 0.9;
    this.recoilY = -(state.dy ?? 0) * step.kick * 0.9;

    // Iskry w punkcie zetknięcia — jasne, krótkie, w kolorach żaru.
    this.sparkBurst.emitParticleAt(x, y, killing ? 16 : 9);
  }

  /**
   * Wygaszanie szarpnięcia kamery. Liczone własnym tłumieniem, nie tweenem —
   * przy szybkim biciu tweeny nachodziłyby na siebie i trzeba by je ubijać.
   */
  updateCameraKick(dt) {
    const decay = Math.min(1, dt * 13);
    this.kickX = (this.kickX ?? 0) * (1 - decay);
    this.kickY = (this.kickY ?? 0) * (1 - decay);
    if (Math.abs(this.kickX) < 0.05) this.kickX = 0;
    if (Math.abs(this.kickY) < 0.05) this.kickY = 0;
    this.cameras.main.setFollowOffset(this.kickX, this.kickY);
  }

  updateMobs(time) {
    const states = this.net.mobs ?? [];
    const seen = new Set();

    for (const state of states) {
      seen.add(state.id);
      let mob = this.mobs.get(state.id);

      if (!mob) {
        mob = {
          sprite: this.add.sprite(state.x, state.y, 'props', 'dummy0').setOrigin(0.5, 1),
          shadow: this.shadows.add(state.x, state.y, 'props', 'dummy0', {
            squash: 0.4,
            width: 20,
          }),
          hitSeq: state.s,
        };
        this.mobs.set(state.id, mob);
      }

      // Klatka zależy od tego, ile życia zostało: cała, obita, mocno obita,
      // zwalona. Ten sam podział obsłuży potem moby z kilkoma stanami rannymi.
      const ratio = state.m > 0 ? state.h / state.m : 0;
      const frame = state.h <= 0 ? 'dummy3'
        : ratio > 0.66 ? 'dummy0'
        : ratio > 0.33 ? 'dummy1'
        : 'dummy2';
      if (mob.sprite.frame.name !== frame) {
        mob.sprite.setFrame(frame);
        this.shadows.setFrame(mob.shadow, frame, false);
      }

      if (state.s !== mob.hitSeq) {
        const wasHit = state.h < (mob.lastHp ?? state.m);
        mob.hitSeq = state.s;

        // Reakcję gra tylko wtedy, gdy nie przewidzieliśmy jej już u siebie.
        // Trafienia cudze — zadane przez innych graczy — przewidywania nie mają
        // i lecą tą drogą. Wstanie po respawnie podnosi ten sam znacznik, ale
        // wtedy życie rośnie i nie ma czego rozbryzgiwać.
        if (wasHit && time - (mob.reactedAt ?? -Infinity) > 250) {
          this.reactToHit(mob, state, time, {
            lost: Math.max(1, (mob.lastHp ?? state.m) - state.h),
            killing: state.h <= 0,
          });
        }
      }
      mob.lastHp = state.h;

      // Szarpnięcie i ściśnięcie wygasają co klatkę obrazu, nie co migawkę —
      // dzięki temu reakcja jest gładka, mimo że stan celu przychodzi 20 razy
      // na sekundę.
      mob.kickX = (mob.kickX ?? 0) * 0.82;
      mob.kickY = (mob.kickY ?? 0) * 0.82;
      if (Math.abs(mob.kickX) < 0.1) mob.kickX = 0;
      if (Math.abs(mob.kickY) < 0.1) mob.kickY = 0;

      // Powrót ze ściśnięcia — szybki, bo to ma być drgnięcie, nie oddech.
      // Zaczepienie sprite'a jest u stóp, więc ściśnięcie w pionie wygląda jak
      // wciśnięcie w ziemię, a nie jak zjechanie w powietrzu.
      mob.squashX = (mob.squashX ?? 1) + (1 - (mob.squashX ?? 1)) * 0.28;
      mob.squashY = (mob.squashY ?? 1) + (1 - (mob.squashY ?? 1)) * 0.28;
      mob.sprite.setScale(mob.squashX, mob.squashY);

      const drawX = state.x + mob.kickX;
      const drawY = state.y + mob.kickY;
      mob.sprite.setPosition(Math.round(drawX), Math.round(drawY));
      mob.sprite.setDepth(drawY);

      // Cień zostaje na ziemi, w miejscu spoczynku — kukła się chwieje, ale stoi
      // w tym samym punkcie i jej cień nie ma powodu skakać razem z nią.
      this.shadows.refresh(mob.shadow, state.x, state.y);
      mob.state = state;
    }

    for (const [id, mob] of this.mobs) {
      if (seen.has(id)) continue;
      mob.sprite.destroy();
      this.shadows.remove(mob.shadow);
      this.mobs.delete(id);
    }

    this.drawMobBars();
  }

  /** Pasek życia nad celem — tylko gdy jest już nadgryziony. */
  drawMobBars() {
    this.mobBars.clear();

    for (const mob of this.mobs.values()) {
      const state = mob.state;
      if (!state || state.h >= state.m || state.h <= 0) continue;

      const width = 22;
      const x = Math.round(state.x - width / 2);
      const y = Math.round(state.y - mob.sprite.height - 6);
      const fill = Math.round((width - 2) * (state.h / state.m));

      this.mobBars.fillStyle(0x14100f, 0.85);
      this.mobBars.fillRect(x, y, width, 4);
      this.mobBars.fillStyle(state.h / state.m > 0.35 ? 0x66913f : 0xc43a0d, 1);
      this.mobBars.fillRect(x + 1, y + 1, fill, 2);
    }
  }

  spawnParticles() {
    // Jedna biała kropka wystarczy — kolor nadajemy zabarwieniem cząstek.
    const dot = this.make.graphics({ add: false });
    dot.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
    dot.generateTexture('dot', 1, 1);
    dot.destroy();

    const sparks = (x, y, quantity) => this.add.particles(x, y, 'dot', {
      speed: { min: 4, max: 20 },
      angle: { min: 250, max: 290 },
      lifespan: { min: 500, max: 1500 },
      alpha: { start: 1, end: 0 },
      scale: { min: 1, max: 2 },
      gravityY: -16,
      frequency: quantity,
      tint: [0xffe08a, 0xffa524, 0xf2700f],
      blendMode: 'ADD',
    }).setDepth(8000);

    sparks(176, 128, 70);   // palenisko
    sparks(384, 424, 110);  // ognisko na placu

    // Drobinki kurzu wiszące w powietrzu hali — widać je dopiero w smudze światła.
    this.add.particles(0, 0, 'dot', {
      x: { min: INTERIOR_PX.x, max: INTERIOR_PX.x + INTERIOR_PX.w },
      y: { min: INTERIOR_PX.y, max: INTERIOR_PX.y + INTERIOR_PX.h },
      speedX: { min: -5, max: 5 },
      speedY: { min: -8, max: -2 },
      lifespan: 4200,
      alpha: { start: 0.35, end: 0 },
      scale: 1,
      frequency: 160,
      tint: 0xffd9a0,
      blendMode: 'ADD',
    }).setDepth(8000);

    this.stepDust = this.add.particles(0, 0, 'dot', {
      speed: { min: 5, max: 16 },
      angle: { min: 200, max: 340 },
      lifespan: 420,
      alpha: { start: 0.5, end: 0 },
      scale: { min: 1, max: 2 },
      tint: [0x6f5c47, 0x5b4a38],
      emitting: false,
    }).setDepth(-58);
  }

  setupCamera() {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_W, WORLD_H);
    camera.startFollow(this.player, true, 0.09, 0.09);
    camera.setDeadzone(28, 20);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
  }

  /** Powiększenie trzymamy na całkowitych krotnościach, żeby piksele zostały ostre. */
  applyZoom() {
    const zoom = Math.max(2, Math.min(4, Math.floor(Math.min(this.scale.width / 300, this.scale.height / 210))));
    this.cameras.main.setZoom(zoom);
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      aup: Phaser.Input.Keyboard.KeyCodes.UP,
      adown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      aleft: Phaser.Input.Keyboard.KeyCodes.LEFT,
      aright: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      // Spacja to unik, nie cios. Cios przeszedł pod lewy przycisk myszy razem
      // z celowaniem — spacja jest najwygodniejszym klawiszem, jaki został,
      // a przy okazji znika problem `Ctrl+W`, którego strona nie może zablokować.
      dodge: Phaser.Input.Keyboard.KeyCodes.SPACE,
      // Drugi argument to przechwytywanie klawiszy. MUSI być `false`.
      //
      // Przy domyślnym `true` Phaser wywołuje `preventDefault()` na każdym
      // zarejestrowanym klawiszu — a wtedy litera nigdy nie dochodzi do pola
      // tekstowego pod spodem. Objawiało się to tak, że przy logowaniu nie dało
      // się wpisać `S` (bo `S` to „w dół"), ani `W`, `A`, `D`. To samo zabiłoby
      // czat. Kadr jest nieprzewijalny (`overflow: hidden`), więc strzałki nie
      // mają czego przewinąć i nie ma po co ich przechwytywać.
    }, false);

    // Kursor. Trzymamy **wskazanie w świecie**, a nie na ekranie, bo kamera się
    // porusza: gdy postać biegnie, a mysz stoi, cel pod kursorem zostaje ten sam
    // tylko wtedy, gdy przeliczymy go co klatkę.
    this.pointer = this.input.activePointer;
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer) => {
      if (this.isTyping()) return;
      if (pointer.leftButtonDown()) this.attackUntil = this.time.now + ATTACK_BUFFER_MS;
    });
  }

  /**
   * Kąt od postaci do kursora, w radianach.
   *
   * Liczony od **tułowia**, nie od stóp: kursor prowadzi się na wysokości ciała
   * przeciwnika, a przy zaczepieniu sprite'a u dołu różnica dwunastu pikseli
   * przekłada się przy bliskim celu na kilkanaście stopni.
   */
  aimAngle() {
    const point = this.cameras.main.getWorldPoint(this.pointer.x, this.pointer.y);
    return Math.atan2(point.y - (this.py - 12), point.x - this.px);
  }

  /**
   * Czy gracz właśnie coś pisze. Gdy kursor stoi w polu tekstowym — logowanie
   * teraz, czat wkrótce — klawisze nie mogą ruszać postacią.
   */
  isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  }

  // --- Pętla ------------------------------------------------------------------

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.movePlayer(time, delta);
    this.animatePlayer(time);
    // Kolejność: najpierw stan celów z serwera, potem przewidywanie własnego
    // trafienia — przewidywanie potrzebuje aktualnych pozycji celów.
    this.updateMobs(time);
    this.predictHits(time);
    this.updateDodge(time);
    this.updateGhosts(delta);
    this.updateDamageNumbers(delta);
    this.updateCameraKick(dt);
    this.updateOthers();
    this.updateRoof(dt);
    const inside = this.isInsideBuilding(this.px, this.py);
    const phase = this.net.phaseNow();
    const rain = this.net.rainNow();
    this.lighting.update(time, inside, { x: this.px, y: this.py }, phase, rain);
    // Po świetle, nie przed: świetliki i ćmy sterują się tą samą porą dnia,
    // a rozjazd o jedną klatkę widać przy zapalaniu się świetlików o zmierzchu.
    this.critters.update(dt, time, darkness(phase), inside);
    this.rain.update(dt, rain, inside);
    // Trawa reaguje na wszystko, co chodzi po świecie, nie tylko na własną postać —
    // widok kępek prostujących się za obcym graczem jest połową tego efektu.
    this.grass.update(dt, time, this.walkers(), 1 + rain * 1.6);
    this.testPanel.follow(this.net.serverPhase(), this.net.rain ?? 0);
    this.updateAmbience(dt);
    this.reportZone();
  }

  /**
   * Głośność ognia bierze się z odległości do najbliższego paleniska, wiatru —
   * z tego, czy stoimy pod dachem. Obie wartości wygładzamy, bo skokowa zmiana
   * przy przekroczeniu progu słychać jako kliknięcie.
   */
  updateAmbience(dt) {
    let fire = 0;
    for (const source of this.world.soundSources) {
      const distance = Math.hypot(this.px - source.x, this.py - source.y);
      if (distance >= source.radius) continue;
      fire = Math.max(fire, source.strength * (1 - distance / source.radius) ** 1.4);
    }

    const inside = this.isInside();
    const wind = inside ? 0.18 : 1;
    // Deszcz w hali słychać, ale przez dach — ciszej niż wiatr, bo krople bębnią
    // po goncie tuż nad głową, a nie wieją przez bramę.
    const rain = this.net.rainNow() * (inside ? 0.4 : 1);

    const blend = Math.min(1, dt * 2.5);
    this.fireLevel = (this.fireLevel ?? 0) + (fire - (this.fireLevel ?? 0)) * blend;
    this.windLevel = (this.windLevel ?? 0) + (wind - (this.windLevel ?? 0)) * blend;
    this.rainLevel = (this.rainLevel ?? 0) + (rain - (this.rainLevel ?? 0)) * blend;

    audio.setFire(this.fireLevel);
    audio.setWind(this.windLevel);
    audio.setRain(this.rainLevel);
    audio.setZone(inside ? 'forge' : 'yard');
  }

  isInside() {
    return this.isInsideBuilding(this.px, this.py);
  }

  /**
   * Klawisze idą do warstwy sieciowej jako maska bitowa. Fizyka liczy się
   * w `world/movement.js` — tym samym kodem, którego używa serwer.
   */
  movePlayer(time, delta) {
    let keys = 0;

    // Klawisz trzymany w chwili otwarcia czatu nigdy nie dostaje swojego
    // „puszczenia": pole tekstowe zatrzymuje zdarzenia, żeby litery nie sterowały
    // postacią, więc `keyup` nie dochodzi do Phasera i klawisz zostaje wciśnięty
    // na zawsze. Bez tego wyczyszczenia postać po zamknięciu czatu sama rusza
    // w stronę, w którą szła przed pisaniem.
    const typingNow = this.isTyping();
    if (this.wasTyping && !typingNow) this.input.keyboard.resetKeys();
    this.wasTyping = typingNow;

    // Podczas pisania postać stoi — inaczej wpisanie nicku wysyłałoby ją w podróż.
    if (!typingNow) {
      if (this.keys.left.isDown || this.keys.aleft.isDown) keys |= KEY_LEFT;
      if (this.keys.right.isDown || this.keys.aright.isDown) keys |= KEY_RIGHT;
      if (this.keys.up.isDown || this.keys.aup.isDown) keys |= KEY_UP;
      if (this.keys.down.isDown || this.keys.adown.isDown) keys |= KEY_DOWN;
      if (this.keys.shift.isDown) keys |= KEY_RUN;

      // Bufor wciśnięcia. Klawisz zostaje „wciśnięty" jeszcze chwilę po puszczeniu,
      // więc uderzenie wstukane w trakcie poprzedniego ciosu nie przepada — odpala
      // się w chwili, w której poprzedni się kończy. Bez tego szybkie młócenie gubi
      // co drugie uderzenie i sterowanie czuć jak zacinające się.
      // Trzymany lewy przycisk bije dalej — pojedyncze kliknięcia dokłada
      // `pointerdown`, żeby najkrótsze tapnięcie też się liczyło.
      if (this.pointer.leftButtonDown()) this.attackUntil = time + ATTACK_BUFFER_MS;
      // Odskok też buforowany: wciśnięty w trakcie ciosu odpala się, gdy tylko
      // wolno — czyli w ostatniej fazie zamachu, przerywając ją.
      if (this.keys.dodge.isDown) this.dodgeUntil = time + ATTACK_BUFFER_MS;

      // Kąt celowania przekazujemy warstwie sieciowej, a ona dokłada go do każdej
      // komendy. Poza pisaniem zostaje ostatni — postać nie ma się obracać za
      // kursorem, gdy gracz sięga myszą do suwaka głośności.
      this.net.aim = this.aimAngle();
    }
    if (this.attackUntil > time) keys |= KEY_ATTACK;
    if (this.dodgeUntil > time) keys |= KEY_DODGE;

    const body = this.net.update(keys, delta);
    if (!body) return;
    this.vx = body.vx;
    this.vy = body.vy;

    // Do rysowania bierzemy punkt pośredni między krokami symulacji, żeby ruch
    // był równy mimo kroku 16 ms i klatki 16,67 ms. Logika gry (strefa, dźwięk,
    // kroki) korzysta z pozycji symulacji — tam gładkość nie ma znaczenia.
    this.px = body.x;
    this.py = body.y;
    const drawn = this.net.renderPosition();
    this.drawX = drawn.x;
    this.drawY = drawn.y;
  }

  /**
   * Ślad cięcia jako osobny sprite, w trybie dodawania.
   *
   * Startuje z opóźnieniem zamachu, bo ślad należy do uderzenia, nie do zamachu.
   * Przy ciosie do góry ląduje pod postacią — z tyłu ostrze jest po drugiej
   * stronie ciała niż kamera, więc i ono, i jego ślad mają być zasłonięte.
   */
  spawnSlash(owner, facing, flip, step = 0) {
    if (!owner.slash) {
      // Zaczepienie w środku, nie u stóp: smuga jest łukiem **wokół tułowia**
      // i to jego środek jest punktem, od którego liczy się zasięg ciosu.
      owner.slash = this.add.sprite(0, 0, 'goblins')
        .setOrigin(0.5, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
    }

    // Odbijamy ślad także na ukosach — one też mają lewą i prawą stronę.
    owner.slash.setFlipX(facing === 'up' || facing === 'down' ? false : flip);
    owner.slash.setFlipY(false);

    // Ślad rozciągamy dokładnie tak, jak sięga dany cios. Rysunek ma 46 px
    // zasięgu, więc mocne pchnięcie (56 px) trzeba wydłużyć — inaczej gracz
    // widziałby krótszy ślad, niż faktycznie trafia.
    const reach = ATTACK_STEPS[step].range ?? 40;
    owner.slash.setScale(reach / 46, 1);

    owner.slashFacing = facing;
    this.time.delayedCall(strikeFrom(step), () => {
      if (!owner.slash || owner.slashFacing !== facing) return;
      owner.slash.setVisible(true);
      owner.slash.play(`slash_${facing}`);
    });
  }

  /**
   * Ustawia ślad cięcia nad (albo pod) postacią, która go wyprowadza.
   *
   * Środek smugi siada na tułowiu — 12 px nad stopami. To ten sam punkt, od
   * którego serwer liczy zasięg ciosu (`player.y - 12` w `game.js`), więc to,
   * co gracz widzi, pokrywa się z tym, co faktycznie trafia.
   */
  placeSlash(owner, x, y) {
    if (!owner.slash?.visible) return;
    owner.slash.setPosition(Math.round(x), Math.round(y - 12));
    owner.slash.setDepth(y + (owner.slashFacing === 'up' ? -1 : 1));
  }

  animatePlayer(time) {
    // Poza bierze się teraz z przewidywanego ciała, a nie z samej prędkości —
    // razem ze stanem ciosu, który jest częścią fizyki wspólnej z serwerem.
    const body = this.net.body ?? { vx: this.vx, vy: this.vy };
    const pose = poseOf(body, this.facing);
    const moving = pose.moving;
    this.facing = pose.facing;

    // Cios sięga po **kierunek celowania** (pięć nazw, w tym dwa ukosy), a chód
    // i spoczynek po sylwetkę ciała (trzy). Ukos nie ma własnej postawy — i mieć
    // nie musi, bo to ten sam bok, tylko z drzewcem pod innym kątem.
    const key = pose.attacking
      ? `g${this.variant}_${pose.aim}_atk`
      : `g${this.variant}_${this.facing}_` + (moving ? 'run' : 'idle');

    // Animację ciosu odpalamy od nowa przy każdym **nowym znaczniku**, także gdy
    // drugie uderzenie idzie w tę samą stronę. Porównywanie samej nazwy animacji
    // by tu nie wystarczyło: drugi cios miałby ten sam klucz i nie zagrałby.
    // Rosnąco, z tego samego powodu co przy przewidywaniu trafień: po korekcie
    // z serwera licznik potrafi na moment cofnąć się i wrócić.
    const seq = body.atkSeq ?? 0;
    if (seq < (this.shownAtkSeq ?? 0)) this.shownAtkSeq = seq;
    if (pose.attacking && seq > (this.shownAtkSeq ?? 0)) {
      this.shownAtkSeq = seq;
      const step = attackStep(body);
      this.player.play(`${key}${step}`);
      this.spawnSlash(this, pose.aim, pose.flip, step);
    } else if (!pose.attacking && this.player.anims.currentAnim?.key !== key) {
      this.player.play(key);
    }
    if (this.facing === 'side') this.player.setFlipX(pose.flip);

    // Wypad jest prawdziwym ruchem, liczonym w `world/movement.js` po obu
    // stronach. Odbicie od trafionego celu jest **wyłącznie przy rysowaniu** —
    // pozycję prowadzi serwer i doginanie jej u klienta rozjechałoby przewidywanie.
    this.recoilX = (this.recoilX ?? 0) * 0.78;
    this.recoilY = (this.recoilY ?? 0) * 0.78;
    if (Math.abs(this.recoilX) < 0.1) this.recoilX = 0;
    if (Math.abs(this.recoilY) < 0.1) this.recoilY = 0;

    const drawX = (this.drawX ?? this.px) + this.recoilX;
    const drawY = (this.drawY ?? this.py) + this.recoilY;

    this.placeSlash(this, drawX, drawY);
    this.player.setPosition(Math.round(drawX), Math.round(drawY));
    this.player.setDepth(drawY);

    this.shadows.setFrame(this.playerShadow, this.player.frame.name, this.player.flipX);
    this.shadows.refresh(this.playerShadow, drawX, drawY);

    // Obłoczek kurzu przy zetknięciu stopy z ziemią.
    if (moving && this.player.anims.currentFrame) {
      const index = this.player.anims.currentFrame.index;
      if ((index === 1 || index === 4) && index !== this.lastStepFrame) {
        this.stepDust.emitParticleAt(this.px, this.py, 3);
        audio.step(surfaceAt(this.world, this.px, this.py));
      }
      this.lastStepFrame = index;
    }
  }

  /**
   * Inni gracze. Pozycje bierzemy sprzed 100 ms i interpolowane, więc ruch jest
   * gładki mimo dwudziestu migawek na sekundę.
   */
  /**
   * Lista graczy do tabeli pod TAB-em. Kto jest online, wie warstwa sieciowa;
   * w której strefie stoi — tylko ta scena, bo tylko ona zna obrys budynku.
   *
   * Gracz, który właśnie wszedł, nie ma jeszcze ani jednej migawki pozycji, więc
   * na liście jest, a strefy przy nim nie ma. To trwa jeden tik serwera.
   */
  buildRoster() {
    const positions = new Map((this.lastSamples ?? []).map((sample) => [sample.id, sample]));
    return this.net.roster().map((entry) => {
      const at = entry.you ? { x: this.px, y: this.py } : positions.get(entry.id);
      return {
        ...entry,
        zone: at ? (this.isInsideBuilding(at.x, at.y) ? 'Kuźnia' : 'Plac') : '—',
      };
    });
  }

  updateOthers() {
    const samples = this.net.sampleRemotes();
    this.lastSamples = samples;
    const seen = new Set();

    for (const sample of samples) {
      seen.add(sample.id);
      let other = this.others.get(sample.id);

      if (!other) {
        const sprite = this.add.sprite(sample.x, sample.y, 'goblins')
          .setOrigin(0.5, 1)
          .setDepth(sample.y);
        other = {
          sprite,
          shadow: this.shadows.add(sample.x, sample.y, 'goblins', `g${sample.variant}_down_idle0`, {
            squash: 0.45,
            width: 18,
          }),
          variant: sample.variant,
        };
        this.others.set(sample.id, other);
      }

      // Cios innego gracza poznajemy po zmianie znacznika w migawce. Trwa tyle,
      // ile animacja, więc nie trzeba przesyłać, kiedy się skończy.
      const seq = sample.s ?? 0;
      const struck = seq !== (other.atkSeq ?? 0);
      if (struck) other.atkSeq = seq;

      // Oberwanie poznajemy po własnym znaczniku, tak samo jak cios. Pierwsza
      // migawka po wejściu gracza go tylko zapamiętuje — inaczej każdy wchodzący
      // bryzgałby krwią na dzień dobry.
      const hurt = sample.hs ?? 0;
      if (other.hurtSeq === undefined) other.hurtSeq = hurt;
      else if (hurt !== other.hurtSeq) {
        const lost = Math.max(0, (other.shownHp ?? sample.h) - sample.h);
        other.hurtSeq = hurt;
        if (lost > 0) this.reactToPlayerHit(other, sample, lost);
      }
      other.shownHp = sample.h;

      // Cios po kierunku celowania, chód i spoczynek po sylwetce — tak samo jak
      // u własnej postaci.
      const aim = sample.k ?? sample.f;
      const key = struck
        ? `g${sample.variant}_${aim}_atk`
        : `g${sample.variant}_${sample.f}_` + (sample.m ? 'run' : 'idle');

      if (struck) {
        other.sprite.play(key);
        this.spawnSlash(other, aim, Boolean(sample.l));
      } else if (!other.sprite.anims.isPlaying
        || !other.sprite.anims.currentAnim?.key.endsWith('_atk')) {
        // Animacji ciosu nie przerywamy w połowie — dopiero gdy dobiegnie końca,
        // wracamy do biegu albo spoczynku.
        if (other.sprite.anims.currentAnim?.key !== key) other.sprite.play(key);
      }
      if (sample.f === 'side') other.sprite.setFlipX(Boolean(sample.l));

      // Trupów nie rysujemy, bo ich nie ma: zabity znika i pojawia się w kuźni
      // w tej samej chwili. Wersja z leżącym, przygaszonym ciałem czytała się jak
      // zawieszenie gry — postać stała bezwładnie i nie dało się nic zrobić.
      // Leżące ciało wróci wtedy, gdy będzie po co przy nim stać, czyli gdy
      // zaczną z niego wypadać rzeczy.

      other.sprite.setPosition(Math.round(sample.x), Math.round(sample.y));
      other.sprite.setDepth(sample.y);
      this.placeSlash(other, sample.x, sample.y);
      this.shadows.setFrame(other.shadow, other.sprite.frame.name, other.sprite.flipX);
      this.shadows.refresh(other.shadow, sample.x, sample.y);
    }

    for (const [id, other] of this.others) {
      if (seen.has(id)) continue;
      other.sprite.destroy();
      this.shadows.remove(other.shadow);
      this.others.delete(id);
    }

    const hud = this.scene.get('Hud');
    hud?.setDiagnostics(this.net.stats());
    hud?.setHealth(this.net.hp ?? 0, this.net.maxHp ?? 100, this.net.safe);
    hud?.setDodge(dodgeFuel(this.net.body ?? {}));

    // Plakietki rysuje HUD, bo jego kamera nie jest powiększana — dzięki temu
    // nick zostaje mały i ostry niezależnie od zoomu świata.
    const camera = this.cameras.main;
    // Własny nick też. Wcześniej plakietki dostawali wyłącznie inni gracze, więc
    // wchodząc na pusty serwer nie widziało się żadnej — a to jest pierwsza rzecz,
    // po której gracz poznaje, że logowanie zadziałało.
    //
    // Identyfikator musi być ten prawdziwy, z serwera. Przy zastępniku (było tu
    // zero) własna wiadomość na czacie wracała z numerem, którego nie ma na liście
    // plakietek, i dymek nie miał się gdzie zaczepić — widzieli go wszyscy poza
    // autorem.
    const plates = this.net.name
      ? [...samples, {
          id: this.net.id,
          name: this.net.name,
          admin: this.net.admin,
          x: this.drawX ?? this.px,
          y: this.drawY ?? this.py,
          h: this.net.hp,
          mh: this.net.maxHp,
        }]
      : samples;

    this.scene.get('Hud')?.setNameplates(plates.map((sample) => ({
      id: sample.id,
      name: sample.name,
      admin: sample.admin,
      // Życie leci razem z plakietką, bo pasek ma wisieć dokładnie pod nickiem
      // i przeliczenie świata na ekran zna tylko ta scena.
      hp: sample.h,
      maxHp: sample.mh,
      // Przeliczenie świata na ekran musi iść przez `worldView`, a NIE przez
      // `scrollX`/`scrollY`. Przy powiększeniu kamery te dwie wartości to nie to
      // samo: `worldView` uwzględnia zoom, `scroll` nie. Z `scroll` plakietki
      // lądowały daleko poza kadrem i test widoczności je ukrywał — dlatego nie
      // było widać żadnego nicku, także cudzego.
      x: (sample.x - camera.worldView.x) * camera.zoom,
      // 31 pikseli nad stopami to czubek grzebienia hełmu z zapasem — liczone
      // w świecie i dopiero potem przeliczane, więc trzyma się przy każdym zoomie.
      y: (sample.y - 31 - camera.worldView.y) * camera.zoom,
    })));
  }

  reportZone() {
    const label = this.isInside() ? 'Kuźnia' : 'Plac przed kuźnią';
    const safe = this.net.safe !== false;
    if (label === this.lastZone && safe === this.lastSafe) return;

    const hud = this.scene.get('Hud');
    hud?.setZone(label, safe);

    // Zmiana zasad świata dostaje komunikat **na środku ekranu**. To jedyny
    // przypadek, w którym cokolwiek wchodzi na środek, i właśnie dlatego zadziała:
    // gracz nie może dowiedzieć się o przekroczeniu granicy PvP dopiero od
    // pierwszego ciosu w plecy.
    if (this.lastSafe !== undefined && safe !== this.lastSafe) {
      hud?.announce(
        safe ? 'STREFA BEZPIECZNA' : 'DZICZ - TU MOŻNA CIĘ ZABIĆ',
        safe
      );
    }

    this.lastZone = label;
    this.lastSafe = safe;
  }
}

