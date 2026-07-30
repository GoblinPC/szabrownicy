// Sprawdzenie składni całego kodu projektu.
//
//   node tools/check.mjs
//
// Powstało po to, żeby zastąpić doraźne pętle `foreach ... node --check ...`
// wpisywane w wierszu poleceń. Takie pętle są za każdym razem innym poleceniem,
// więc każda z nich pytała o zgodę osobno — a jako pętla powłoki nie da się ich
// sensownie objąć jednym wzorcem uprawnień. Jedno polecenie rozwiązuje jedno
// i drugie.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['client/src', 'server/src', 'tools'];
const SKIP = new Set(['node_modules', 'legacy', 'assets']);

function collect(dir, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, found);
    else if (/\.(js|mjs)$/.test(entry.name)) found.push(full);
  }
  return found;
}

const files = ROOTS.flatMap((dir) => collect(path.join(ROOT, dir)));
const broken = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    broken.push({ file: path.relative(ROOT, file), message: String(error.stderr ?? error.message).trim() });
  }
}

for (const item of broken) {
  console.error(`BLAD  ${item.file}`);
  console.error(item.message.split('\n').slice(0, 6).join('\n'));
  console.error('');
}

console.log(`${files.length - broken.length}/${files.length} plikow sklada sie poprawnie`);
process.exit(broken.length ? 1 : 0);
