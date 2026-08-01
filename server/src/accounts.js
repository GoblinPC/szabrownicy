// Konta graczy: nick i hasło.
//
// Hasła nie są nigdzie trzymane w czytelnej postaci. Każde dostaje własną sól
// i jest przepuszczane przez `scrypt` z wbudowanego modułu `crypto` — funkcję
// zaprojektowaną tak, żeby jej policzenie było kosztowne. Dzięki temu wyciek
// pliku z kontami nie oddaje nikomu haseł.
//
// `scrypt` jest asynchroniczny i taki musi zostać: policzenie hasza zajmuje
// kilkadziesiąt milisekund, a wersja synchroniczna zablokowałaby na ten czas
// całą pętlę świata i wszyscy gracze by przystanęli.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const NAME_MIN = 3;
const NAME_MAX = 16;
const PASS_MIN = 4;
const PASS_MAX = 72;

/** Nick: litery (także polskie), cyfry, podkreślenie i myślnik. */
const NAME_RE = /^[\p{L}\p{N}_-]{3,16}$/u;

/**
 * Nicki zastrzeżone — nikt ich sobie nie założy z ekranu logowania.
 *
 * Chodzi o podszywanie się: gracz o nicku „GoblinPC" albo „Admin" może naopowiadać
 * ludziom, że jest od obsługi, i wyciągać od nich cokolwiek. Konta z tej listy
 * zakłada się wyłącznie narzędziem `server/src/admin.js`, z konsoli serwera.
 *
 * Porównanie idzie po formie znormalizowanej: bez wielkości liter i bez znaków
 * ozdobnych, więc „G0blin", „g-o-b-l-i-n" i „GOBLIN" też są zablokowane.
 */
const RESERVED = new Set([
  'goblin', 'goblinpc', 'goblin-pc', 'goblinshop',
  'admin', 'administrator', 'admini', 'adm',
  'mod', 'moderator', 'gm', 'gamemaster',
  'obsluga', 'support', 'pomoc', 'system', 'serwer', 'server',
  'szabrownicy', 'kuznia', 'bot', 'null', 'undefined',
]);

/**
 * Forma do porównań z listą zastrzeżonych: małe litery, cyfry podobne do liter
 * sprowadzone do liter, wywalone myślniki i podkreślenia.
 */
function normalize(name) {
  return name
    .toLocaleLowerCase('pl')
    .replace(/[_-]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/ł/g, 'l')
    .replace(/ó/g, 'o')
    .replace(/ą/g, 'a')
    .replace(/ę/g, 'e')
    .replace(/ś/g, 's')
    .replace(/ć/g, 'c')
    .replace(/ź|ż/g, 'z')
    .replace(/ń/g, 'n');
}

export function isReserved(name) {
  return RESERVED.has(normalize(String(name ?? '').trim()));
}

export function checkName(value) {
  if (typeof value !== 'string') return 'nick jest wymagany';
  const name = value.trim();
  if (name.length < NAME_MIN) return `nick musi mieć co najmniej ${NAME_MIN} znaki`;
  if (name.length > NAME_MAX) return `nick może mieć najwyżej ${NAME_MAX} znaków`;
  if (!NAME_RE.test(name)) return 'nick może zawierać tylko litery, cyfry, _ i -';
  return null;
}

export function checkPassword(value) {
  if (typeof value !== 'string') return 'hasło jest wymagane';
  if (value.length < PASS_MIN) return `hasło musi mieć co najmniej ${PASS_MIN} znaki`;
  if (value.length > PASS_MAX) return 'hasło jest za długie';
  return null;
}

function hash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, SCRYPT, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
}

export class Accounts {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'accounts.json');
    this.byKey = new Map();
    this.dirty = false;

    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [key, account] of Object.entries(raw)) this.byKey.set(key, account);
      console.log(`  wczytano ${this.byKey.size} kont`);
    } catch {
      // Pierwsze uruchomienie — pliku jeszcze nie ma.
    }

    setInterval(() => this.flush(), 10_000).unref();
  }

  /** Klucz konta to nick bez wielkości liter — "Zenek" i "zenek" to jeden gracz. */
  static keyOf(name) {
    return name.trim().toLocaleLowerCase('pl');
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Zapis przez plik tymczasowy: przerwanie w połowie zapisu nie zostawia
      // uszkodzonego pliku z kontami wszystkich graczy.
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.byKey)));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error('  nie udało się zapisać kont:', error.message);
    }
  }

  /**
   * `allowReserved` przechodzi tylko z konsoli serwera (`admin.js`) — z sieci
   * nigdy, bo to ono broni przed podszywaniem się pod obsługę.
   */
  async register(name, password, { allowReserved = false, admin = false } = {}) {
    const nameError = checkName(name);
    if (nameError) return { error: nameError };
    const passError = checkPassword(password);
    if (passError) return { error: passError };

    const clean = name.trim();
    if (!allowReserved && isReserved(clean)) {
      return { error: 'ten nick jest zastrzeżony' };
    }

    const key = Accounts.keyOf(clean);
    if (this.byKey.has(key)) return { error: 'ten nick jest już zajęty' };

    const salt = crypto.randomBytes(16).toString('hex');
    const account = {
      name: clean,
      salt,
      hash: await hash(password, salt),
      variant: 0,
      admin,
      created: Date.now(),
      lastSeen: Date.now(),
    };
    this.byKey.set(key, account);
    this.dirty = true;
    return { account };
  }

  /** Zmiana hasła istniejącego konta — używane przez narzędzie konsolowe. */
  async setPassword(name, password) {
    const passError = checkPassword(password);
    if (passError) return { error: passError };
    const account = this.byKey.get(Accounts.keyOf(name));
    if (!account) return { error: 'nie ma takiego konta' };
    account.salt = crypto.randomBytes(16).toString('hex');
    account.hash = await hash(password, account.salt);
    this.dirty = true;
    return { account };
  }

  setAdmin(name, admin) {
    const account = this.byKey.get(Accounts.keyOf(name));
    if (!account) return { error: 'nie ma takiego konta' };
    account.admin = admin;
    this.dirty = true;
    return { account };
  }

  async login(name, password) {
    if (typeof name !== 'string' || typeof password !== 'string') {
      return { error: 'podaj nick i hasło' };
    }
    const account = this.byKey.get(Accounts.keyOf(name));
    // Ten sam komunikat dla nieistniejącego konta i złego hasła — inaczej dałoby
    // się sprawdzać, które nicki są zajęte.
    const wrong = { error: 'zły nick lub hasło' };
    if (!account) return wrong;

    const attempt = await hash(password, account.salt);
    const a = Buffer.from(attempt, 'hex');
    const b = Buffer.from(account.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return wrong;

    account.lastSeen = Date.now();
    this.dirty = true;
    return { account };
  }

  has(key) {
    return this.byKey.has(key);
  }

  /** Zapamiętanie wyglądu wybranego przez zalogowanego gracza. */
  setVariant(name, variant) {
    const account = this.byKey.get(Accounts.keyOf(name));
    if (!account) return;
    account.variant = variant;
    this.dirty = true;
  }

  /**
   * Stan gracza, który ma **przeżyć restart serwera**: plecak, głód, życie.
   *
   * Trafia do tego samego pliku co konta i tym samym zapisem — przez plik
   * tymczasowy i `rename`, więc przerwany zapis nie zostawia po sobie połowy
   * kont. Osobna baza byłaby tu wyłącznie kosztem: stan gracza jest własnością
   * konta, a kont jest kilkadziesiąt, nie milion.
   *
   * Zapisujemy **surowe dane, nie żywe obiekty**: plecak leci jako lista wpisów
   * `{i, k, x, y, r}`, bo to jedyny format, który da się odczytać po zmianie
   * kodu. Gdyby lądował tu obiekt gry, każde pole dołożone do plecaka
   * unieważniałoby zapisy wszystkich graczy.
   */
  setState(name, state) {
    const account = this.byKey.get(Accounts.keyOf(name));
    if (!account) return;
    account.state = state;
    this.dirty = true;
  }

  /** Zapamiętany stan albo `null` dla nowego konta. */
  stateOf(name) {
    return this.byKey.get(Accounts.keyOf(name))?.state ?? null;
  }

  get size() {
    return this.byKey.size;
  }
}
