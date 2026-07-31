import { buildWorld, isWalkable, SPAWN, CITY_OX, CITY_OY } from '../../client/src/world/forge.js';
import { FOOT_HALF_W, FOOT_H } from '../../client/src/world/movement.js';

const w = buildWorld();
const OX = CITY_OX * 16, OY = CITY_OY * 16;
// Prostokąt stóp, dokładnie taki jak w fizyce ruchu.
const wolne = (x, y) => isWalkable(w, x - FOOT_HALF_W, y - FOOT_H, x + FOOT_HALF_W, y);

const S = 4;
const key = (x, y) => x + ',' + y;
const sx = Math.round((SPAWN.x - OX) / S) * S, sy = Math.round((SPAWN.y - OY) / S) * S;
const widziane = new Set([key(sx, sy)]);
const kolejka = [[sx, sy]];
const wolneLok = (x, y) => x >= 84 && x <= 690 && y >= 50 && y <= 310 && wolne(OX + x, OY + y);
while (kolejka.length) {
  const [x, y] = kolejka.pop();
  for (const [dx, dy] of [[S,0],[-S,0],[0,S],[0,-S]]) {
    const nx = x + dx, ny = y + dy;
    if (widziane.has(key(nx, ny)) || !wolneLok(nx, ny)) continue;
    widziane.add(key(nx, ny)); kolejka.push([nx, ny]);
  }
}
const cele = {
  'kuznia: przy kowadle': [168, 196],
  'kuznia: przy palenisku': [168, 140],
  'sala: ognisko': [392, 176],
  'sala: stol': [316, 268],
  'sklep: przed lada': [580, 160],
  'sklep: za lada (NIE powinno byc)': [580, 100],
  'warsztat: stol': [566, 248],
  'schody': [648, 300],
};
for (const [n, [x, y]] of Object.entries(cele)) {
  const gx = Math.round(x / S) * S, gy = Math.round(y / S) * S;
  console.log(n.padEnd(24), widziane.has(key(gx, gy)) ? 'OSIAGALNE' : 'NIEOSIAGALNE');
}
console.log('pol osiagalnych:', widziane.size);
