// Kuźnia — jedyna na razie strefa świata.

import { buildWorld, surfaceAt, TILE, WORLD_W, WORLD_H, SPAWN, INTERIOR_PX } from '../world/forge.js';
import { poseOf, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_RUN } from '../world/movement.js';
import { Lighting } from '../render/lighting.js';
import { ShadowCaster } from '../render/shadows.js';
import { audio } from '../audio/audio.js';
import { Net } from '../net.js';

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

    this.lighting = new Lighting(this, this.world, INTERIOR_PX);

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

      if (prop.portal) {
        this.add.bitmapText(prop.x, prop.y - sprite.height - 8, 'goblin', prop.portal, 11)
          .setOrigin(0.5, 1)
          .setTint(0x4fc3f7)
          .setDepth(prop.y);
        this.add.bitmapText(prop.x, prop.y - sprite.height + 3, 'goblin', 'wkrótce', 11)
          .setOrigin(0.5, 1)
          .setTint(0x6b5d54)
          .setDepth(prop.y);
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

    this.others = new Map();
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
    });
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  // --- Pętla ------------------------------------------------------------------

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.movePlayer(delta);
    this.animatePlayer(time);
    this.updateOthers();
    this.lighting.update(time);
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

    const blend = Math.min(1, dt * 2.5);
    this.fireLevel = (this.fireLevel ?? 0) + (fire - (this.fireLevel ?? 0)) * blend;
    this.windLevel = (this.windLevel ?? 0) + (wind - (this.windLevel ?? 0)) * blend;

    audio.setFire(this.fireLevel);
    audio.setWind(this.windLevel);
    audio.setZone(inside ? 'forge' : 'yard');
  }

  isInside() {
    return this.py < INTERIOR_PX.y + INTERIOR_PX.h + 8;
  }

  /**
   * Klawisze idą do warstwy sieciowej jako maska bitowa. Fizyka liczy się
   * w `world/movement.js` — tym samym kodem, którego używa serwer.
   */
  movePlayer(delta) {
    let keys = 0;
    if (this.keys.left.isDown || this.cursors.left.isDown) keys |= KEY_LEFT;
    if (this.keys.right.isDown || this.cursors.right.isDown) keys |= KEY_RIGHT;
    if (this.keys.up.isDown || this.cursors.up.isDown) keys |= KEY_UP;
    if (this.keys.down.isDown || this.cursors.down.isDown) keys |= KEY_DOWN;
    if (this.keys.shift.isDown) keys |= KEY_RUN;

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

  animatePlayer(time) {
    const pose = poseOf({ vx: this.vx, vy: this.vy }, this.facing);
    const moving = pose.moving;
    this.facing = pose.facing;

    const key = `g${this.variant}_${this.facing}_${moving ? 'run' : 'idle'}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key);
    if (this.facing === 'side') this.player.setFlipX(pose.flip);

    const drawX = this.drawX ?? this.px;
    const drawY = this.drawY ?? this.py;
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
  updateOthers() {
    const samples = this.net.sampleRemotes();
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

      const key = `g${sample.variant}_${sample.f}_${sample.m ? 'run' : 'idle'}`;
      if (other.sprite.anims.currentAnim?.key !== key) other.sprite.play(key);
      if (sample.f === 'side') other.sprite.setFlipX(Boolean(sample.l));

      other.sprite.setPosition(Math.round(sample.x), Math.round(sample.y));
      other.sprite.setDepth(sample.y);
      this.shadows.setFrame(other.shadow, other.sprite.frame.name, other.sprite.flipX);
      this.shadows.refresh(other.shadow, sample.x, sample.y);
    }

    for (const [id, other] of this.others) {
      if (seen.has(id)) continue;
      other.sprite.destroy();
      this.shadows.remove(other.shadow);
      this.others.delete(id);
    }

    this.scene.get('Hud')?.setDiagnostics(this.net.stats());

    // Plakietki rysuje HUD, bo jego kamera nie jest powiększana — dzięki temu
    // nick zostaje mały i ostry niezależnie od zoomu świata.
    const camera = this.cameras.main;
    this.scene.get('Hud')?.setNameplates(samples.map((sample) => ({
      id: sample.id,
      name: sample.name,
      x: (sample.x - camera.scrollX) * camera.zoom,
      // 31 pikseli nad stopami to czubek grzebienia hełmu z zapasem — liczone
      // w świecie i dopiero potem przeliczane, więc trzyma się przy każdym zoomie.
      y: (sample.y - 31 - camera.scrollY) * camera.zoom,
    })));
  }

  reportZone() {
    const label = this.isInside() ? 'Kuźnia' : 'Plac przed kuźnią';
    if (label !== this.lastZone) {
      this.lastZone = label;
      this.scene.get('Hud')?.setZone(label);
    }
  }
}
