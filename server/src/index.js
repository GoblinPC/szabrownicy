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

// Tryb testowy: wejście do gry bez logowania, na losowym nicku. Wpisywanie nicku
// i hasła przy każdym przeładowaniu strony — a serwer deweloperski przeładowuje ją
// po każdym zapisie pliku — jest nie do wytrzymania podczas pracy nad grą.
//
// Flaga wiersza poleceń, nie zmienna środowiskowa, bo działa tak samo na Windowsie
// i na macOS. Domyślnie logowanie **jest** wymagane, więc wdrożenie na VPS nie
// stanie otwarte przez przeoczenie.
const GUESTS_REQUESTED = process.argv.includes('--bez-logowania');
const GUESTS = GUESTS_REQUESTED && !PRODUCTION;

const app = express();
app.disable('x-powered-by');

app.use(express.static(CLIENT_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    // `no-cache` nie znaczy "nie zapamiętuj" tylko "zawsze zapytaj, czy się nie
    // zmieniło" — przeglądarka dostaje 304 i nic nie pobiera, gdy plik jest ten
    // sam. Zwykłe `max-age` było tu złym pomysłem: kod klienta to moduły ES,
    // a strona sklepu osadza grę w ramce z innej domeny, więc odświeżenie
    // strony rodzica wcale nie musi pobrać nowej wersji skryptów. Przez godzinę
    // gracz siedziałby na starym kodzie i nie dałoby się tego z niego wydusić.
    res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Prosty punkt kontrolny — przydaje się do sprawdzenia, czy usługa żyje,
// bez otwierania gry.
app.get('/zdrowie', (_req, res) => {
  res.json({
    ok: true,
    graczy: game.players.size,
    czas: Math.round(process.uptime()),
    // Wersja kodu, którą odpala każdy podłączony klient — pozwala odróżnić
    // "poprawka nie działa" od "przeglądarka trzyma stary plik".
    najgorszyTik: game.stats?.worstGap ?? 0,
    gracze: [...game.players.values()].map((p) => ({
      kto: p.name,
      wersja: p.version ?? 0,
      // Ile razy limit czasu obcial ruch i ile komend czeka w kolejce.
      obciec: p.clamped ?? 0,
      kolejka: p.backlog ?? 0,
    })),
  });
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

const game = attachGame(sockets, DATA_DIR, variantCount, { guests: GUESTS });

// Druga blokada, obok samego `PRODUCTION`: gdyby flaga kiedyś trafiła do pliku
// usługi na serwerze, ma być o tym głośno w logu, a nie po cichu.
if (GUESTS_REQUESTED && PRODUCTION) {
  console.warn('  UWAGA: --bez-logowania ZIGNOROWANE, bo NODE_ENV=production');
}

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
  console.log(GUESTS
    ? 'LOGOWANIE WYŁĄCZONE — wejście na losowym nicku. Włączasz: npm start'
    : 'Logowanie włączone. Wyłączasz na czas testów: npm run start:bez-logowania');
});
