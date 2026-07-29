// Fizyka ruchu postaci — jedyna kopia w projekcie.
//
// Ten plik importuje zarówno klient (do przewidywania własnego ruchu), jak
// i serwer (do liczenia stanu prawdziwego). Gdyby istniały dwie kopie, zaczęłyby
// się rozjeżdżać i gracz widziałby, jak jego postać "cofa się" po każdej korekcie.
// Dlatego kod jest czystym JS-em bez Phasera i bez niczego z przeglądarki.

import { isWalkable } from './forge.js';

export const WALK_SPEED = 74;
export const RUN_SPEED = 112;
export const ACCELERATION = 14;   // im wyżej, tym ostrzejszy start i zatrzymanie
export const FOOT_HALF_W = 5;     // prostokąt stóp, na nim liczona jest kolizja
export const FOOT_H = 6;

// Wejście jako maska bitowa — jedna liczba zamiast obiektu, bo leci przez sieć
// kilkadziesiąt razy na sekundę.
export const KEY_UP = 1;
export const KEY_DOWN = 2;
export const KEY_LEFT = 4;
export const KEY_RIGHT = 8;
export const KEY_RUN = 16;

/** Ruch osobno w poziomie i pionie — dzięki temu postać ślizga się po ścianach. */
function slide(world, body, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const nx = body.x + dx;
  const ny = body.y + dy;
  const fits = isWalkable(
    world,
    nx - FOOT_HALF_W, ny - FOOT_H,
    nx + FOOT_HALF_W, ny - 0.5
  );
  if (fits) {
    body.x = nx;
    body.y = ny;
  } else if (dx !== 0) {
    body.vx = 0;
  } else {
    body.vy = 0;
  }
}

/**
 * Posuwa ciało o jeden krok czasu. `body` to `{x, y, vx, vy}` — modyfikowany
 * w miejscu. `keys` to maska bitowa, `dt` w sekundach.
 */
export function advance(world, body, keys, dt) {
  let ax = 0;
  let ay = 0;
  if (keys & KEY_LEFT) ax -= 1;
  if (keys & KEY_RIGHT) ax += 1;
  if (keys & KEY_UP) ay -= 1;
  if (keys & KEY_DOWN) ay += 1;

  const length = Math.hypot(ax, ay);
  if (length > 0) { ax /= length; ay /= length; }

  const speed = (keys & KEY_RUN) ? RUN_SPEED : WALK_SPEED;
  const blend = Math.min(1, ACCELERATION * dt);
  body.vx += (ax * speed - body.vx) * blend;
  body.vy += (ay * speed - body.vy) * blend;

  slide(world, body, body.vx * dt, 0);
  slide(world, body, 0, body.vy * dt);
}

/**
 * Kierunek i to, czy postać się rusza — liczone z prędkości, więc klient
 * i serwer dochodzą do tej samej animacji bez wysyłania jej po sieci.
 */
export function poseOf(body, previousFacing = 'down') {
  const moving = Math.hypot(body.vx, body.vy) > 6;
  let facing = previousFacing;
  if (moving) {
    if (Math.abs(body.vx) > Math.abs(body.vy) + 4) facing = 'side';
    else facing = body.vy < 0 ? 'up' : 'down';
  }
  return { moving, facing, flip: body.vx < 0 };
}
