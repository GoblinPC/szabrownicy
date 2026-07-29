const RESOURCE_LABELS = { gold: "Złoto", gem: "Klejnoty", potion: "Mikstury", relic: "Relikwie" };
const RESOURCE_TYPES = ["gold", "gem", "potion", "relic"];
const LOOT_KEY = { gold: "loot-gold", gem: "loot-gem", potion: "loot-potion", relic: "loot-relic" };

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
let currentStash = { gold: 0, gem: 0, potion: 0, relic: 0 };
let phaserGame = null;
let raidScene = null;

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

const TILE = 48; // rozmiar kafla na ekranie (zrodlo 16px * 3)

function overlaps1D(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

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
    this.load.spritesheet("goblin-idle", "assets/units/goblin_idle.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("goblin-run", "assets/units/goblin_run.png", { frameWidth: 16, frameHeight: 16 });
    for (let i = 1; i <= 8; i++) this.load.image(`floor-${i}`, `assets/dungeon/floor_${i}.png`);
    this.load.image("wall-top-left", "assets/dungeon/wall_top_left.png");
    this.load.image("wall-top-mid", "assets/dungeon/wall_top_mid.png");
    this.load.image("wall-top-right", "assets/dungeon/wall_top_right.png");
    this.load.image("wall-left", "assets/dungeon/wall_left.png");
    this.load.image("wall-right", "assets/dungeon/wall_right.png");
    this.load.image("crate", "assets/dungeon/crate.png");
    this.load.image("chest", "assets/dungeon/chest_empty_open_anim_f0.png");
    this.load.image("column", "assets/dungeon/column_wall.png");
    this.load.image("banner", "assets/dungeon/wall_banner_red.png");
    this.load.spritesheet("loot-gold", "assets/loot/gold.png", { frameWidth: 6, frameHeight: 7 });
    this.load.image("loot-gem", "assets/loot/gem.png");
    this.load.image("loot-potion", "assets/loot/potion.png");
    this.load.image("loot-relic", "assets/loot/relic.png");
  }

  create() {
    const world = this.raidData.world;
    const rooms = this.raidData.rooms;
    const corridors = this.raidData.corridors;
    const allRects = [...Object.values(rooms), ...corridors];

    this.cameras.main.setBackgroundColor("#100c0a");

    // podloga - kazdy prostokat (pokoj/korytarz) wypelniony losowymi kaflami podlogi
    for (const r of allRects) {
      const cols = Math.max(1, Math.round(r.w / TILE));
      const rows = Math.max(1, Math.round(r.h / TILE));
      const colW = r.w / cols;
      const rowH = r.h / rows;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const key = `floor-${1 + Math.floor(Math.random() * 8)}`;
          this.add.image(r.x + colW * cx, r.y + rowH * cy, key).setOrigin(0, 0).setDisplaySize(colW + 1, rowH + 1);
        }
      }
    }

    // sciany wokol kazdego pokoju, z przerwa tam gdzie wchodzi korytarz
    for (const key of Object.keys(rooms)) {
      this.buildRoomWalls(rooms[key], corridors);
    }
    // sciany boczne korytarzy (dluzsze krawedzie)
    for (const c of corridors) this.buildCorridorWalls(c);

    // kolumna i tabliczka w komnacie relikwii dla klimatu
    this.add.image(rooms.relic.x + rooms.relic.w / 2, rooms.relic.y + 18, "banner").setScale(2).setOrigin(0.5, 0);
    this.add.image(rooms.relic.x + 24, rooms.relic.y + rooms.relic.h - 24, "column").setOrigin(0.5, 1).setScale(1.5);
    this.add.image(rooms.relic.x + rooms.relic.w - 24, rooms.relic.y + rooms.relic.h - 24, "column").setOrigin(0.5, 1).setScale(1.5);
    // skrzynie/skrzynki jako dekoracja w pokojach zewnetrznych
    this.add.image(rooms.gold.x + 40, rooms.gold.y + 40, "crate").setOrigin(0.5, 1).setScale(2);
    this.add.image(rooms.gold.x + rooms.gold.w - 40, rooms.gold.y + rooms.gold.h - 30, "chest").setOrigin(0.5, 1).setScale(2.2);
    this.add.image(rooms.potion.x + rooms.potion.w - 40, rooms.potion.y + 40, "crate").setOrigin(0.5, 1).setScale(2);
    this.add.image(rooms.gem.x + 40, rooms.gem.y + rooms.gem.h - 30, "chest").setOrigin(0.5, 1).setScale(2.2);

    this.physics.world.setBounds(world.x0, world.y0, world.x1 - world.x0, world.y1 - world.y0);
    this.cameras.main.setBounds(world.x0, world.y0, world.x1 - world.x0, world.y1 - world.y0);
    this.cameras.main.setZoom(2.2);

    if (!this.anims.exists("idle")) {
      this.anims.create({ key: "idle", frames: this.anims.generateFrameNumbers("goblin-idle", { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
      this.anims.create({ key: "run", frames: this.anims.generateFrameNumbers("goblin-run", { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: "coin-spin", frames: this.anims.generateFrameNumbers("loot-gold", { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }

    this.player = this.add.sprite(0, 0, "goblin-idle").setScale(3).play("idle");
    this.player.targetX = 0;
    this.player.targetY = 0;
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.extractGraphics = this.add.graphics();
    this.channelBarBg = this.add.rectangle(0, 0, 60, 8, 0x000000, 0.5).setOrigin(0.5).setVisible(false);
    this.channelBarFg = this.add.rectangle(0, 0, 60, 8, 0x4dabf7, 1).setOrigin(0, 0.5).setVisible(false);

    for (const node of this.raidData.resources) {
      const key = LOOT_KEY[node.type];
      const sprite = this.add.sprite(node.x, node.y, key, 0).setScale(node.type === "gold" ? 3.5 : 1.8);
      if (node.type === "gold") sprite.play("coin-spin");
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

  buildRoomWalls(room, corridors) {
    const gapRange = (side) => {
      for (const c of corridors) {
        if (side === "left" && Math.abs(c.x + c.w - room.x) < 2 && overlaps1D(c.y, c.y + c.h, room.y, room.y + room.h)) return [c.y, c.y + c.h];
        if (side === "right" && Math.abs(c.x - (room.x + room.w)) < 2 && overlaps1D(c.y, c.y + c.h, room.y, room.y + room.h)) return [c.y, c.y + c.h];
        if (side === "top" && Math.abs(c.y + c.h - room.y) < 2 && overlaps1D(c.x, c.x + c.w, room.x, room.x + room.w)) return [c.x, c.x + c.w];
      }
      return null;
    };

    const cols = Math.max(1, Math.round(room.w / TILE));
    const rows = Math.max(1, Math.round(room.h / TILE));
    const colW = room.w / cols;
    const rowH = room.h / rows;

    const topGap = gapRange("top");
    for (let i = 0; i < cols; i++) {
      const cx = room.x + colW * (i + 0.5);
      if (topGap && cx > topGap[0] && cx < topGap[1]) continue;
      const key = i === 0 ? "wall-top-left" : i === cols - 1 ? "wall-top-right" : "wall-top-mid";
      this.add.image(room.x + colW * i, room.y, key).setOrigin(0, 1).setDisplaySize(colW + 1, TILE);
    }

    const leftGap = gapRange("left");
    for (let j = 0; j < rows; j++) {
      const cy = room.y + rowH * (j + 0.5);
      if (leftGap && cy > leftGap[0] && cy < leftGap[1]) continue;
      this.add.image(room.x, room.y + rowH * j, "wall-left").setOrigin(1, 0).setDisplaySize(TILE, rowH + 1);
    }

    const rightGap = gapRange("right");
    for (let j = 0; j < rows; j++) {
      const cy = room.y + rowH * (j + 0.5);
      if (rightGap && cy > rightGap[0] && cy < rightGap[1]) continue;
      this.add.image(room.x + room.w, room.y + rowH * j, "wall-right").setOrigin(0, 0).setDisplaySize(TILE, rowH + 1);
    }
  }

  buildCorridorWalls(c) {
    const horizontal = c.w >= c.h;
    if (horizontal) {
      const cols = Math.max(1, Math.round(c.w / TILE));
      const colW = c.w / cols;
      for (let i = 0; i < cols; i++) {
        this.add.image(c.x + colW * i, c.y, "wall-top-mid").setOrigin(0, 1).setDisplaySize(colW + 1, TILE);
      }
    } else {
      const rows = Math.max(1, Math.round(c.h / TILE));
      const rowH = c.h / rows;
      for (let j = 0; j < rows; j++) {
        this.add.image(c.x, c.y + rowH * j, "wall-left").setOrigin(1, 0).setDisplaySize(TILE, rowH + 1);
        this.add.image(c.x + c.w, c.y + rowH * j, "wall-right").setOrigin(0, 0).setDisplaySize(TILE, rowH + 1);
      }
    }
  }

  tryAttack() {
    if (this.attacking) return;
    this.attacking = true;
    this.tweens.add({ targets: this.player, scaleX: 3.6, scaleY: 2.6, duration: 90, yoyo: true, onComplete: () => (this.attacking = false) });
    const slash = this.add.circle(this.player.x + (this.facingLeft ? -22 : 22), this.player.y, 16, 0xffffff, 0.5);
    this.tweens.add({ targets: slash, alpha: 0, scale: 1.6, duration: 150, onComplete: () => slash.destroy() });
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
      this.channelBarBg.setPosition(this.player.x, this.player.y - 36);
      this.channelBarFg.setPosition(this.player.x - 30, this.player.y - 36);
    }
    for (const entry of this.otherSprites.values()) {
      entry.sprite.x += (entry.targetX - entry.sprite.x) * lerp;
      entry.sprite.y += (entry.targetY - entry.sprite.y) * lerp;
      entry.label.setPosition(entry.sprite.x, entry.sprite.y - 40);
    }

    this.drawExtractPoints();
    updateBackpackDisplay(this.carriedNow || { gold: 0, gem: 0, potion: 0, relic: 0 });
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
        const key = LOOT_KEY[loot.type];
        const sprite = this.add.sprite(loot.x, loot.y, key, 0).setScale(loot.type === "gold" ? 3 : 1.6).setTint(0xffe066);
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
        const sprite = this.add.sprite(p.x, p.y, "goblin-idle").setScale(3).play("idle");
        sprite.setTint(p.tint);
        const label = this.add.text(p.x, p.y - 40, p.name || "", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5);
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
