// Serwer deweloperski: serwuje klienta i przeładowuje przeglądarkę po każdej
// zmianie pliku. Logika gry (strefy, czat, synchronizacja graczy) dojdzie tutaj
// w kolejnych krokach.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_DIR = path.join(ROOT, 'client');
const PORT = Number(process.env.PORT ?? 8080);

const app = express();

// Zero pamięci podręcznej — w trakcie budowania gry zawsze chcemy świeże pliki.
app.use(express.static(CLIENT_DIR, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));

const server = http.createServer(app);
const sockets = new WebSocketServer({ server });

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const socket of sockets.clients) {
    if (socket.readyState === 1) socket.send(payload);
  }
}

// Zmiany lecą paczkami (zapis pliku to często kilka zdarzeń), więc czekamy chwilę
// na uspokojenie się dysku i dopiero wtedy przeładowujemy stronę.
let reloadTimer = null;
const scheduleReload = (file) => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(`  zmiana: ${file} — przeładowuję`);
    broadcast({ t: 'reload' });
  }, 120);
};

for (const dir of [CLIENT_DIR]) {
  fs.watch(dir, { recursive: true }, (_event, filename) => {
    if (filename) scheduleReload(filename);
  });
}

server.listen(PORT, () => {
  console.log(`Kuźnia stoi na http://localhost:${PORT}`);
  console.log('Podgląd odświeża się sam po zapisie pliku w client/.');
});
