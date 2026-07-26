const RESOURCE_LABELS = { wood: "Drewno", gold: "Złoto", meat: "Mięso", rare: "Rzadkie" };

function getToken() {
  let token = localStorage.getItem("szabrownicy_token");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("szabrownicy_token", token);
  }
  return token;
}

function getName() {
  return localStorage.getItem("szabrownicy_name") || `Goblin${Math.floor(Math.random() * 9000 + 1000)}`;
}

const token = getToken();
const nameInput = document.getElementById("name-input");
nameInput.value = getName();
nameInput.addEventListener("change", () => {
  localStorage.setItem("szabrownicy_name", nameInput.value || getName());
});

const homeEl = document.getElementById("home");
const raidContainerEl = document.getElementById("raid-container");
const toastEl = document.getElementById("toast");
const goBtn = document.getElementById("go-btn");
const leaderboardEl = document.getElementById("leaderboard");

let myId = null;
let currentStash = { wood: 0, gold: 0, meat: 0, rare: 0 };
let phaserGame = null;
let raidScene = null;

const RESOURCE_TYPES = ["wood", "gold", "meat", "rare"];

function setSlotCount(prefix, type, count) {
  const span = document.getElementById(`${prefix}-${type}`);
  if (!span) return;
  span.textContent = count > 0 ? count : "";
  span.closest(".slot").classList.toggle("empty", count <= 0);
}

function updateStashDisplay(stash) {
  currentStash = stash;
  for (const type of RESOURCE_TYPES) setSlotCount("s", type, stash[type] || 0);
}

function updateBackpackDisplay(carried) {
  for (const type of RESOURCE_TYPES) setSlotCount("c", type, carried[type] || 0);
}

function updateLeaderboard(list) {
  leaderboardEl.innerHTML = "";
  for (const entry of list) {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.total}`;
    leaderboardEl.appendChild(li);
  }
}

function showToast(text, ms = 2500) {
  toastEl.textContent = text;
  toastEl.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.style.display = "none"), ms);
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

let ws;
function connect() {
  ws = new WebSocket(wsUrl());
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", token, name: nameInput.value }));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    handleMessage(msg);
  });
  ws.addEventListener("close", () => {
    showToast("Rozłączono z serwerem — odśwież stronę");
  });
}

function handleMessage(msg) {
  if (msg.type === "welcome") {
    myId = msg.id;
    updateStashDisplay(msg.stash);
    updateLeaderboard(msg.leaderboard);
    return;
  }
  if (msg.type === "leaderboard") {
    updateLeaderboard(msg.leaderboard);
    return;
  }
  if (msg.type === "raidJoined") {
    startRaid(msg);
    return;
  }
  if (msg.type === "extracted") {
    endRaid();
    updateStashDisplay(msg.stash);
    showToast("Wydostałeś się z łupem!");
    return;
  }
  if ((msg.type === "state" || msg.type === "hit") && raidScene) {
    raidScene.onServerMessage(msg);
    return;
  }
}

goBtn.addEventListener("click", () => {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "enterRaid" }));
});

class RaidScene extends Phaser.Scene {
  constructor(data) {
    super("Raid");
    this.raidData = data;
    this.resourceSprites = new Map();
    this.lootSprites = new Map();
    this.otherSprites = new Map();
    this.facingLeft = false;
  }

  preload() {
    this.load.spritesheet("player-idle", "assets/units/Warrior_Idle.png", { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet("player-run", "assets/units/Warrior_Run.png", { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet("player-attack", "assets/units/Warrior_Attack1.png", { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet("res-tree", "assets/resources/tree.png", { frameWidth: 192, frameHeight: 256 });
    this.load.spritesheet("res-meat", "assets/resources/meat.png", { frameWidth: 128, frameHeight: 128 });
    this.load.image("res-gold", "assets/resources/gold.png");
    this.load.image("res-rare", "assets/resources/rare.png");
    this.load.image("ground", "assets/terrain/grass_tile.png");
    this.load.spritesheet("deco-bush1", "assets/decorations/bush1.png", { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet("deco-bush2", "assets/decorations/bush2.png", { frameWidth: 128, frameHeight: 128 });
    this.load.image("deco-rock1", "assets/decorations/rock1.png");
    this.load.image("deco-rock2", "assets/decorations/rock2.png");
    this.load.image("landmark-cliff", "assets/terrain/cliff_formation.png");
  }

  create() {
    const size = this.raidData.world.size;
    // te same strefy co po stronie serwera (server/src/index.js: ZONES) - czysto wizualne, do rozmieszczenia dekoracji
    const ZONES = {
      wood: { x: 750, y: 750, radius: 420 },
      meat: { x: 1650, y: 750, radius: 420 },
      gold: { x: 1650, y: 1650, radius: 420 },
      rare: { x: 1200, y: 1200, radius: 200 },
    };

    this.add.tileSprite(0, 0, size, size, "ground").setOrigin(0, 0);

    // jeziorko - wizualny landmark przy pastwisku
    const pond = this.add.ellipse(1350, 380, 260, 170, 0x47aba9, 1);
    pond.setStrokeStyle(6, 0x2d7d7a, 1);

    // formacja skalna - landmark przy kamieniolomie
    this.add.image(2050, 1980, "landmark-cliff").setScale(1.1).setDepth(-1);

    // przygaszony okrąg wokół skarbca na środku - sygnalizuje "cenne, ale otwarte miejsce"
    const treasureRing = this.add.circle(ZONES.rare.x, ZONES.rare.y, ZONES.rare.radius, 0xffd43b, 0.06);
    treasureRing.setStrokeStyle(3, 0xffd43b, 0.3);

    const scatterInZone = (zone, keys, count, scaleMin, scaleMax) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * zone.radius;
        const x = zone.x + Math.cos(angle) * r;
        const y = zone.y + Math.sin(angle) * r;
        const key = keys[Math.floor(Math.random() * keys.length)];
        this.add.sprite(x, y, key, 0).setScale(scaleMin + Math.random() * (scaleMax - scaleMin)).setAlpha(0.9);
      }
    };
    scatterInZone(ZONES.wood, ["deco-bush1", "deco-bush2"], 45, 0.4, 0.65);
    scatterInZone(ZONES.gold, ["deco-rock1", "deco-rock2"], 35, 0.5, 0.8);
    scatterInZone(ZONES.meat, ["deco-bush1", "deco-bush2"], 20, 0.35, 0.5);
    for (let i = 0; i < 60; i++) {
      const keys = ["deco-bush1", "deco-bush2", "deco-rock1", "deco-rock2"];
      const key = keys[Math.floor(Math.random() * keys.length)];
      this.add.sprite(Math.random() * size, Math.random() * size, key, 0).setScale(0.35 + Math.random() * 0.2).setAlpha(0.7);
    }

    this.physics.world.setBounds(0, 0, size, size);
    this.cameras.main.setBounds(0, 0, size, size);
    this.cameras.main.setZoom(2);

    if (!this.anims.exists("idle")) {
      this.anims.create({ key: "idle", frames: this.anims.generateFrameNumbers("player-idle", { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "run", frames: this.anims.generateFrameNumbers("player-run", { start: 0, end: 5 }), frameRate: 14, repeat: -1 });
      this.anims.create({ key: "attack", frames: this.anims.generateFrameNumbers("player-attack", { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    }

    this.player = this.add.sprite(0, 0, "player-idle").setScale(0.45).play("idle");
    this.player.targetX = 0;
    this.player.targetY = 0;
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.extractGraphics = this.add.graphics();
    this.channelBarBg = this.add.rectangle(0, 0, 60, 8, 0x000000, 0.5).setOrigin(0.5).setVisible(false);
    this.channelBarFg = this.add.rectangle(0, 0, 60, 8, 0x4dabf7, 1).setOrigin(0, 0.5).setVisible(false);

    for (const node of this.raidData.resources) {
      const key = { wood: "res-tree", gold: "res-gold", meat: "res-meat", rare: "res-rare" }[node.type];
      const sprite = this.add.sprite(node.x, node.y, key, 0).setScale(node.type === "wood" || node.type === "meat" ? 0.5 : 0.8);
      this.resourceSprites.set(node.id, sprite);
    }

    this.latestExtractPoints = this.raidData.extractPoints;
    this.extractRadius = this.raidData.extractRadius;

    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE");
    this.input.on("pointerdown", () => this.tryAttack());
    this.lastSentInput = null;
    this.attacking = false;

    raidScene = this; // rejestrujemy się dopiero gdy scena naprawdę jest gotowa
  }

  tryAttack() {
    if (this.attacking) return;
    this.attacking = true;
    this.player.play("attack");
    this.player.once("animationcomplete-attack", () => (this.attacking = false));
    ws.send(JSON.stringify({ type: "attack" }));
  }

  update() {
    const k = this.keys;
    let dx = 0, dy = 0;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    if (Phaser.Input.Keyboard.JustDown(k.SPACE)) this.tryAttack();

    const moving = dx !== 0 || dy !== 0;
    if (!this.attacking) this.player.play(moving ? "run" : "idle", true);
    if (dx !== 0) {
      this.facingLeft = dx < 0;
      this.player.setFlipX(this.facingLeft);
    }

    const payload = JSON.stringify({ type: "input", dx, dy });
    if (payload !== this.lastSentInput) {
      ws.send(payload);
      this.lastSentInput = payload;
    }

    const lerp = 0.35;
    this.player.x += (this.player.targetX - this.player.x) * lerp;
    this.player.y += (this.player.targetY - this.player.y) * lerp;
    if (this.channelBarBg.visible) {
      this.channelBarBg.setPosition(this.player.x, this.player.y - 60);
      this.channelBarFg.setPosition(this.player.x - 30, this.player.y - 60);
    }
    for (const entry of this.otherSprites.values()) {
      entry.sprite.x += (entry.targetX - entry.sprite.x) * lerp;
      entry.sprite.y += (entry.targetY - entry.sprite.y) * lerp;
      entry.label.setPosition(entry.sprite.x, entry.sprite.y - 70);
    }

    this.drawExtractPoints();
    updateBackpackDisplay(this.carriedNow || { wood: 0, gold: 0, meat: 0, rare: 0 });
  }

  drawExtractPoints() {
    this.extractGraphics.clear();
    for (const ep of this.latestExtractPoints || []) {
      this.extractGraphics.lineStyle(4, ep.open ? 0x4dff88 : 0x555555, ep.open ? 1 : 0.4);
      this.extractGraphics.strokeCircle(ep.x, ep.y, this.extractRadius);
      if (ep.open) {
        this.extractGraphics.fillStyle(0x4dff88, 0.12);
        this.extractGraphics.fillCircle(ep.x, ep.y, this.extractRadius);
      }
    }
  }

  onServerMessage(msg) {
    if (msg.type === "hit") {
      if (msg.victimId === myId) {
        this.cameras.main.flash(200, 200, 0, 0);
        showToast("Ktoś Cię trafił — upuściłeś łup!", 2000);
      }
      return;
    }
    if (msg.type !== "state") return;

    this.latestExtractPoints = msg.extractPoints;

    for (const node of msg.resources) {
      const sprite = this.resourceSprites.get(node.id);
      if (sprite) sprite.setVisible(node.active);
    }

    const seenLoot = new Set();
    for (const loot of msg.loot) {
      seenLoot.add(loot.id);
      if (!this.lootSprites.has(loot.id)) {
        const key = { wood: "res-tree", gold: "res-gold", meat: "res-meat", rare: "res-rare" }[loot.type];
        const sprite = this.add.sprite(loot.x, loot.y, key, 0).setScale(0.3).setTint(0xffe066);
        this.lootSprites.set(loot.id, sprite);
      }
    }
    for (const [id, sprite] of this.lootSprites) {
      if (!seenLoot.has(id)) {
        sprite.destroy();
        this.lootSprites.delete(id);
      }
    }

    const seenPlayers = new Set();
    for (const p of msg.players) {
      if (p.id === myId) {
        this.player.targetX = p.x;
        this.player.targetY = p.y;
        this.player.setAlpha(p.invulnerable ? 0.5 : 1);
        this.carriedNow = p.carried;
        if (p.channel) {
          this.channelBarBg.setVisible(true);
          this.channelBarFg.setVisible(true);
          this.channelBarFg.width = 60 * Math.min(1, p.channel.progress);
        } else {
          this.channelBarBg.setVisible(false);
          this.channelBarFg.setVisible(false);
        }
        continue;
      }
      seenPlayers.add(p.id);
      let entry = this.otherSprites.get(p.id);
      if (!entry) {
        const sprite = this.add.sprite(p.x, p.y, "player-idle").setScale(0.45).play("idle");
        sprite.setTint(p.tint);
        const label = this.add.text(p.x, p.y - 70, p.name || "", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5);
        entry = { sprite, label, targetX: p.x, targetY: p.y };
        this.otherSprites.set(p.id, entry);
      }
      const dxMove = p.x - entry.targetX;
      if (Math.abs(dxMove) > 0.5) entry.sprite.setFlipX(dxMove < 0);
      entry.sprite.play(p.moving ? "run" : "idle", true);
      entry.sprite.setAlpha(p.invulnerable ? 0.5 : 1);
      entry.targetX = p.x;
      entry.targetY = p.y;
    }
    for (const [id, entry] of this.otherSprites) {
      if (!seenPlayers.has(id)) {
        entry.sprite.destroy();
        entry.label.destroy();
        this.otherSprites.delete(id);
      }
    }
  }
}

function startRaid(raidJoinedMsg) {
  homeEl.classList.add("hidden");
  raidContainerEl.style.display = "block";
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "raid-container",
    width: window.innerWidth,
    height: window.innerHeight,
    physics: { default: "arcade" },
    scene: new RaidScene(raidJoinedMsg),
  });
  raidScene = phaserGame.scene.keys["Raid"];
}

function endRaid() {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
    raidScene = null;
  }
  raidContainerEl.style.display = "none";
  homeEl.classList.remove("hidden");
}

connect();
