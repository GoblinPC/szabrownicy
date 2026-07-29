// Serwer gry: serwuje klienta i prowadzi świat.
//
// W trybie deweloperskim dokłada przeładowywanie przeglądarki po zapisie pliku.
// Na produkcji (`NODE_ENV=production`) obserwowanie plików jest wyłączone,
// a zasoby dostają nagłówki pozwalające je zapamiętać.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { WebSocketServer } from 'ws';

import { attachGame } from './net.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_DIR = path.join(ROOT, 'client');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const PORT = Number(process.env.PORT ?? 8080);
const PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');

app.use(express.static(CLIENT_DIR, {
  etag: PRODUCTION,
  lastModified: PRODUCTION,
  maxAge: PRODUCTION ? '1h' : 0,
  setHeaders: (res, filePath) => {
    // Grafika jest generowana i wymieniana rzadko, kod klienta zmienia się często
    // — ale index.html nigdy nie może zostać w pamięci podręcznej, bo to on
    // wskazuje na resztę.
    if (!PRODUCTION || filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// Prosty punkt kontrolny — przydaje się do sprawdzenia, czy usługa żyje,
// bez otwierania gry.
app.get('/zdrowie', (_req, res) => {
  res.json({ ok: true, graczy: game.players.size, czas: Math.round(process.uptime()) });
});

const server = http.createServer(app);
const sockets = new WebSocketServer({ server, maxPayload: 4096 });

// Ilu jest wariantów goblina — serwer musi to wiedzieć, żeby sprawdzać zakres.
let variantCount = 6;
try {
  variantCount = JSON.parse(fs.readFileSync(path.join(CLIENT_DIR, 'assets/gen/variants.json'), 'utf8')).length;
} catch {
  console.warn('  nie udało się odczytać variants.json — przyjmuję 6 wariantów');
}

const game = attachGame(sockets, DATA_DIR, variantCount);

if (!PRODUCTION) {
  let reloadTimer = null;
  const scheduleReload = (file) => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      console.log(`  zmiana: ${file} — przeładowuję`);
      const payload = JSON.stringify({ t: 'reload' });
      for (const socket of sockets.clients) {
        if (socket.readyState === 1) socket.send(payload);
      }
    }, 120);
  };

  fs.watch(CLIENT_DIR, { recursive: true }, (_event, filename) => {
    if (filename) scheduleReload(filename);
  });
}

server.listen(PORT, () => {
  console.log(`Kuźnia stoi na http://localhost:${PORT}  (${PRODUCTION ? 'produkcja' : 'development'})`);
  if (!PRODUCTION) console.log('Podgląd odświeża się sam po zapisie pliku w client/.');
});
