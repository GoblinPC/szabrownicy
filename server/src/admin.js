// Narzędzie konsolowe do kont. Uruchamiane na serwerze, nigdy z sieci.
//
// To jedyna droga do założenia konta na zastrzeżonym nicku (Goblin, GoblinPC,
// Admin i tak dalej) oraz do nadania komuś odznaki administratora.
//
//   node server/src/admin.js zaloz  <nick> <haslo> [--admin]
//   node server/src/admin.js haslo  <nick> <nowe-haslo>
//   node server/src/admin.js admin  <nick> <tak|nie>
//   node server/src/admin.js lista
//
// Uwaga: hasło podane w wierszu poleceń zostaje w historii powłoki. Po założeniu
// konta warto je zmienić z gry, gdy dojdzie taka możliwość.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Accounts } from './accounts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(ROOT, 'server', 'data');

const [command, ...args] = process.argv.slice(2);
const accounts = new Accounts(DATA_DIR);

function usage() {
  console.log('uzycie:');
  console.log('  node server/src/admin.js zaloz  <nick> <haslo> [--admin]');
  console.log('  node server/src/admin.js haslo  <nick> <nowe-haslo>');
  console.log('  node server/src/admin.js admin  <nick> <tak|nie>');
  console.log('  node server/src/admin.js lista');
  process.exit(1);
}

const done = (message) => {
  accounts.dirty = true;
  accounts.flush();
  console.log(message);
  process.exit(0);
};

const fail = (message) => {
  console.error(`blad: ${message}`);
  process.exit(2);
};

switch (command) {
  case 'zaloz': {
    const [nick, pass] = args;
    if (!nick || !pass) usage();
    const admin = args.includes('--admin');
    // Z konsoli wolno wszystko, w tym nicki zastrzeżone — o to tu chodzi.
    const result = await accounts.register(nick, pass, { allowReserved: true, admin });
    if (result.error) fail(result.error);
    done(`zalozono konto ${result.account.name}${admin ? ' (ADMIN)' : ''}`);
    break;
  }

  case 'haslo': {
    const [nick, pass] = args;
    if (!nick || !pass) usage();
    const result = await accounts.setPassword(nick, pass);
    if (result.error) fail(result.error);
    done(`zmieniono haslo konta ${result.account.name}`);
    break;
  }

  case 'admin': {
    const [nick, value] = args;
    if (!nick || !value) usage();
    const on = value === 'tak' || value === 'true' || value === '1';
    const result = accounts.setAdmin(nick, on);
    if (result.error) fail(result.error);
    done(`${result.account.name}: admin = ${on ? 'tak' : 'nie'}`);
    break;
  }

  case 'lista': {
    const rows = [...accounts.byKey.values()].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    console.log(`kont: ${rows.length}`);
    for (const a of rows) {
      const when = a.lastSeen ? new Date(a.lastSeen).toISOString().slice(0, 16).replace('T', ' ') : '—';
      console.log(`  ${a.admin ? '[A] ' : '    '}${a.name.padEnd(18)} ostatnio: ${when}`);
    }
    process.exit(0);
    break;
  }

  default:
    usage();
}
