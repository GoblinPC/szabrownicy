import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "..", "..", "client");
const STASH_FILE = path.join(__dirname, "..", "data", "stashes.json");

const PORT = process.env.PORT || 8080;

// --- Mapa wyprawy ---
const WORLD_SIZE = 2400;
const PLAYER_SPEED = 220; // px/s
const PLAYER_RADIUS = 24;
const PICKUP_RADIUS = 36;
const ATTACK_RANGE = 64;
const ATTACK_COOLDOWN_MS = 700;
const HIT_INVULN_MS = 1500;
const SPAWN_INVULN_MS = 1500;
const CARRY_CAP = 20;
const LOOT_DESPAWN_MS = 30000;
const TICK_MS = 50; // 20Hz

// Strefy - zasoby grupują się tematycznie zamiast losowo po całej mapie
const ZONES = {
  wood: { x: 750, y: 750, radius: 420 }, // Zagajnik
  meat: { x: 1650, y: 750, radius: 420 }, // Pastwisko
  gold: { x: 1650, y: 1650, radius: 420 }, // Kamieniołom
  rare: { x: 1200, y: 1200, radius: 200 }, // Skarbiec (środek mapy)
};
const RESOURCE_DEFS = [
  { type: "wood", count: 20 },
  { type: "gold", count: 12 },
  { type: "meat", count: 8 },
  { type: "rare", count: 4 },
];
const RESOURCE_VALUE = { wood: 1, gold: 3, meat: 2, rare: 10 };
const RESOURCE_RESPAWN_MS = { wood: [10000, 20000], gold: [15000, 30000], meat: [15000, 25000], rare: [40000, 70000] };

function randomPointInZone(zone) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * zone.radius;
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(WORLD_SIZE - PLAYER_RADIUS, zone.x + Math.cos(angle) * r)),
    y: Math.max(PLAYER_RADIUS, Math.min(WORLD_SIZE - PLAYER_RADIUS, zone.y + Math.sin(angle) * r)),
  };
}

// --- Punkty wyjścia (rotujące) ---
const EXTRACT_RADIUS = 70;
const EXTRACT_CHANNEL_MS = 4000;
const EXTRACT_ACTIVE_COUNT = 2;
const EXTRACT_OPEN_MS = [45000, 90000];
const M = 160; // margines od krawędzi mapy
const EXTRACT_CANDIDATES = [
  { x: M, y: M },
  { x: WORLD_SIZE - M, y: M },
  { x: M, y: WORLD_SIZE - M },
  { x: WORLD_SIZE - M, y: WORLD_SIZE - M },
  { x: WORLD_SIZE / 2, y: M },
  { x: WORLD_SIZE / 2, y: WORLD_SIZE - M },
  { x: M, y: WORLD_SIZE / 2 },
  { x: WORLD_SIZE - M, y: WORLD_SIZE / 2 },
];

// --- Trwały schowek (per token) ---
function loadStashes() {
  try {
    return JSON.parse(fs.readFileSync(STASH_FILE, "utf8"));
  } catch {
    return {};
  }
}
let stashes = loadStashes();
let stashesDirty = false;
function saveStashesIfDirty() {
  if (!stashesDirty) return;
  fs.mkdirSync(path.dirname(STASH_FILE), { recursive: true });
  fs.writeFileSync(STASH_FILE, JSON.stringify(stashes, null, 2));
  stashesDirty = false;
}
function getStash(token, name) {
  if (!stashes[token]) stashes[token] = { wood: 0, gold: 0, meat: 0, rare: 0, name: name || "Goblin" };
  if (name) stashes[token].name = name;
  return stashes[token];
}

function emptyCarried() {
  return { wood: 0, gold: 0, meat: 0, rare: 0 };
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}

function randomSpawnPoint() {
  return {
    x: PLAYER_RADIUS + Math.random() * (WORLD_SIZE - 2 * PLAYER_RADIUS),
    y: PLAYER_RADIUS + Math.random() * (WORLD_SIZE - 2 * PLAYER_RADIUS),
  };
}

// --- Węzły surowców (wspólne, trwają cały czas na mapie wyprawy) ---
let nextEntityId = 1;
const resourceNodes = [];
for (const def of RESOURCE_DEFS) {
  for (let i = 0; i < def.count; i++) {
    const { x, y } = randomPointInZone(ZONES[def.type]);
    resourceNodes.push({ id: nextEntityId++, type: def.type, x, y, active: true, respawnAt: null });
  }
}

// --- Punkty wyjścia: stan otwarcia ---
const extractPoints = EXTRACT_CANDIDATES.map((c, i) => ({ id: i + 1, x: c.x, y: c.y, open: false, openUntil: 0 }));
function openRandomExtracts(count) {
  const closed = extractPoints.filter((e) => !e.open);
  for (let i = 0; i < count && closed.length > 0; i++) {
    const idx = Math.floor(Math.random() * closed.length);
    const point = closed.splice(idx, 1)[0];
    point.open = true;
    point.openUntil = Date.now() + randRange(EXTRACT_OPEN_MS);
  }
}
openRandomExtracts(EXTRACT_ACTIVE_COUNT);

// --- Łup na ziemi (po trafieniu gracza) ---
const lootPickups = []; // {id, type, amount, x, y, expiresAt}

// --- Gracze ---
const players = new Map(); // peerId -> player
let nextPeerId = 1;
const TINTS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b];

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    tint: p.tint,
    carried: p.carried,
    invulnerable: Date.now() < p.invulnerableUntil,
    moving: p.moving,
    channel: p.channelingId ? { pointId: p.channelingId, progress: p.channelProgress / EXTRACT_CHANNEL_MS } : null,
  };
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastToRaid(obj) {
  const data = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.state === "raid" && p.ws.readyState === 1) p.ws.send(data);
  }
}

function leaderboard() {
  return Object.values(stashes)
    .map((s) => ({
      name: s.name,
      total: s.wood * RESOURCE_VALUE.wood + s.gold * RESOURCE_VALUE.gold + s.meat * RESOURCE_VALUE.meat + s.rare * RESOURCE_VALUE.rare,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function broadcastLeaderboard() {
  const data = JSON.stringify({ type: "leaderboard", leaderboard: leaderboard() });
  for (const p of players.values()) {
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

// --- HTTP + WS ---
const app = express();
app.use(express.static(CLIENT_DIR));
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const peerId = nextPeerId++;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const token = String(msg.token || "").slice(0, 64) || `anon-${peerId}`;
      const name = String(msg.name || "Goblin").slice(0, 20);
      const player = {
        id: peerId,
        ws,
        token,
        name,
        state: "home", // 'home' | 'raid'
        x: 0,
        y: 0,
        input: { dx: 0, dy: 0 },
        moving: false,
        carried: emptyCarried(),
        invulnerableUntil: 0,
        lastAttackAt: 0,
        channelingId: null,
        channelProgress: 0,
      };
      player.tint = TINTS[peerId % TINTS.length];
      players.set(peerId, player);

      send(ws, { type: "welcome", id: peerId, stash: getStash(token, name), leaderboard: leaderboard() });
      return;
    }

    const player = players.get(peerId);
    if (!player) return;

    if (msg.type === "enterRaid") {
      if (player.state === "raid") return;
      const spawn = randomSpawnPoint();
      player.state = "raid";
      player.x = spawn.x;
      player.y = spawn.y;
      player.carried = emptyCarried();
      player.invulnerableUntil = Date.now() + SPAWN_INVULN_MS;
      player.channelingId = null;
      player.channelProgress = 0;

      send(ws, {
        type: "raidJoined",
        world: { size: WORLD_SIZE },
        resources: resourceNodes,
        extractPoints,
        extractChannelMs: EXTRACT_CHANNEL_MS,
        extractRadius: EXTRACT_RADIUS,
      });
      return;
    }

    if (player.state !== "raid") return; // reszta wiadomości ma sens tylko na wyprawie

    if (msg.type === "input") {
      let dx = Number(msg.dx) || 0;
      let dy = Number(msg.dy) || 0;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      player.input = { dx, dy };
      player.moving = len > 0.01;
      return;
    }

    if (msg.type === "attack") {
      const now = Date.now();
      if (now - player.lastAttackAt < ATTACK_COOLDOWN_MS) return;
      if (now < player.invulnerableUntil) return;
      player.lastAttackAt = now;

      for (const other of players.values()) {
        if (other.id === player.id || other.state !== "raid") continue;
        if (Date.now() < other.invulnerableUntil) continue;
        if (dist(player.x, player.y, other.x, other.y) > ATTACK_RANGE) continue;

        const angle = Math.atan2(other.y - player.y, other.x - player.x);
        for (const [type, amount] of Object.entries(other.carried)) {
          if (amount <= 0) continue;
          lootPickups.push({
            id: nextEntityId++,
            type,
            amount,
            x: other.x + (Math.random() - 0.5) * 40,
            y: other.y + (Math.random() - 0.5) * 40,
            expiresAt: Date.now() + LOOT_DESPAWN_MS,
          });
        }
        other.carried = emptyCarried();
        other.invulnerableUntil = Date.now() + HIT_INVULN_MS;
        other.channelingId = null;
        other.channelProgress = 0;
        other.x += Math.cos(angle) * 50;
        other.y += Math.sin(angle) * 50;
        broadcastToRaid({ type: "hit", attackerId: player.id, victimId: other.id, x: other.x, y: other.y });
      }
      return;
    }
  });

  ws.on("close", () => {
    players.delete(peerId);
  });
});

// --- Pętla gry ---
setInterval(() => {
  const dt = TICK_MS / 1000;
  const now = Date.now();

  // rotacja punktów wyjścia
  for (const ep of extractPoints) {
    if (ep.open && now >= ep.openUntil) {
      ep.open = false;
      for (const p of players.values()) {
        if (p.channelingId === ep.id) {
          p.channelingId = null;
          p.channelProgress = 0;
        }
      }
    }
  }
  const openCount = extractPoints.filter((e) => e.open).length;
  if (openCount < EXTRACT_ACTIVE_COUNT) openRandomExtracts(EXTRACT_ACTIVE_COUNT - openCount);

  for (const p of players.values()) {
    if (p.state !== "raid") continue;

    p.x += p.input.dx * PLAYER_SPEED * dt;
    p.y += p.input.dy * PLAYER_SPEED * dt;
    p.x = Math.max(PLAYER_RADIUS, Math.min(WORLD_SIZE - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(WORLD_SIZE - PLAYER_RADIUS, p.y));

    // zbieranie z węzłów surowców
    for (const node of resourceNodes) {
      if (!node.active) continue;
      const total = p.carried.wood + p.carried.gold + p.carried.meat + p.carried.rare;
      if (total >= CARRY_CAP) continue;
      if (dist(p.x, p.y, node.x, node.y) <= PICKUP_RADIUS) {
        node.active = false;
        node.respawnAt = now + randRange(RESOURCE_RESPAWN_MS[node.type]);
        p.carried[node.type] += 1;
      }
    }

    // zbieranie łupu z ziemi
    for (let i = lootPickups.length - 1; i >= 0; i--) {
      const loot = lootPickups[i];
      const total = p.carried.wood + p.carried.gold + p.carried.meat + p.carried.rare;
      if (total >= CARRY_CAP) continue;
      if (dist(p.x, p.y, loot.x, loot.y) <= PICKUP_RADIUS) {
        p.carried[loot.type] += loot.amount;
        lootPickups.splice(i, 1);
      }
    }

    // kanałowanie punktu wyjścia
    const nearOpenExtract = extractPoints.find((ep) => ep.open && dist(p.x, p.y, ep.x, ep.y) <= EXTRACT_RADIUS);
    if (nearOpenExtract) {
      if (p.channelingId !== nearOpenExtract.id) {
        p.channelingId = nearOpenExtract.id;
        p.channelProgress = 0;
      }
      p.channelProgress += TICK_MS;
      if (p.channelProgress >= EXTRACT_CHANNEL_MS) {
        const stash = getStash(p.token);
        stash.wood += p.carried.wood;
        stash.gold += p.carried.gold;
        stash.meat += p.carried.meat;
        stash.rare += p.carried.rare;
        stashesDirty = true;
        p.state = "home";
        p.carried = emptyCarried();
        p.channelingId = null;
        p.channelProgress = 0;
        send(p.ws, { type: "extracted", stash });
      }
    } else {
      p.channelingId = null;
      p.channelProgress = 0;
    }
  }

  // odświeżanie węzłów surowców
  for (const node of resourceNodes) {
    if (!node.active && node.respawnAt !== null && now >= node.respawnAt) {
      node.active = true;
      node.respawnAt = null;
    }
  }

  // wygasanie łupu na ziemi
  for (let i = lootPickups.length - 1; i >= 0; i--) {
    if (now >= lootPickups[i].expiresAt) lootPickups.splice(i, 1);
  }

  broadcastToRaid({
    type: "state",
    players: Array.from(players.values())
      .filter((p) => p.state === "raid")
      .map(publicPlayer),
    resources: resourceNodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, active: n.active })),
    loot: lootPickups.map((l) => ({ id: l.id, type: l.type, amount: l.amount, x: l.x, y: l.y })),
    extractPoints,
  });

  saveStashesIfDirty();
}, TICK_MS);

setInterval(broadcastLeaderboard, 3000);

server.listen(PORT, () => {
  console.log(`Szabrownicy server na porcie ${PORT}`);
});
