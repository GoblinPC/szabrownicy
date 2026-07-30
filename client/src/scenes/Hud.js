// Warstwa interfejsu. Osobna scena, bo kamera świata pracuje w powiększeniu,
// a napisy mają być rysowane piksel w piksel.
//
// Tu żyje czat — dymki nad głowami i log ostatnich wiadomości w lewym dolnym
// rogu — oraz tabela graczy pod TAB-em. Jedyne, czego HUD nie rysuje, to linijka,
// w którą gracz właśnie pisze: to element HTML (`ui/chat.js`), żeby polskie znaki,
// wklejanie i klawiatury mobilne działały same z siebie.

import { audio } from '../audio/audio.js';
import { createChatInput } from '../ui/chat.js';
import { bubbleShape, bubbleWidth, BUBBLE_COLORS } from '../render/bubble.js';
import { DODGE_CHARGES } from '../world/movement.js';

// Uklad panelu stanu. Rysowany w jednostkach interfejsu i powiekszany UI_SCALE
// razy - kanwa pracuje w pelnej rozdzielczosci monitora, wiec pasek szeroki na
// 232 piksele zajmowalby na ekranie 1920 nieco ponad dziesiata czesc szerokosci.
const PANEL_X = 16;
const PANEL_Y = 16;
const UI_SCALE = 2;
const BAR_W = 100;
const BAR_H = 18;
const PIP_STEP = 21;

// Szerokość nierozciąganego brzegu ramki 9-slice.
//
// **Musi zgadzać się z `SLICE` w `tools/art/ui.js`** — to ta sama grafika
// oglądana z dwóch stron. Rozjazd już raz kosztował błąd: brzeg urósł
// w generatorze z 3 na 6, tutaj został 3, i pasek życia wylewał się poza ramkę.
// Liczba jest wpisana w dwóch miejscach, bo klient nie importuje niczego
// z narzędzi budowania — przy zmianie poprawić obie.
const SLICE = 6;

const CHAT_LIMIT = 120;        // musi zgadzać się z limitem serwera
const LOG_LINES = 6;
const LOG_IDLE_MS = 10_000;    // po tylu sekundach ciszy log blaknie
const LOG_FADE_MS = 1500;

const BUBBLE_WRAP = 28;        // znaków w linii dymka
const BUBBLE_MS = 4000;        // podstawa czasu życia
const BUBBLE_PER_CHAR_MS = 60; // plus tyle na każdy znak — dłuższe czyta się dłużej
const BUBBLE_MAX_MS = 9000;
const BUBBLE_FADE_MS = 500;

// Kolory z tej samej palety, co panele HTML — inaczej interfejs rozjeżdża się
// na dwa różne światy.
const PANEL = 0x14100f;
const BORDER = 0x453b37;
const TEXT = 0xe8dcc0;
const DIM = 0xbda997;
const ADMIN = 0xffa524;
const SYSTEM = 0x6b5d54;
const EMBER = 0xf2700f;

// Kolory dymka opisuje `render/bubble.js` jako zapis szesnastkowy, bo używa ich
// też generator podglądu. Phaser potrzebuje liczb, więc przeliczamy raz, tutaj.
const BUBBLE_TONES = Object.fromEntries(
  Object.entries(BUBBLE_COLORS).map(([tone, hex]) => [tone, Number.parseInt(hex.slice(1), 16)]),
);
// Atrament na pergaminie — nie ten sam kolor co obrys dymka.
const BUBBLE_TEXT = BUBBLE_TONES.text;

// Kolejność rysowania. Wpisana jawnie, bo domyślna głębokość 0 dla wszystkiego
// oznacza kolejność tworzenia obiektów — a ta zmienia się przy każdej przeróbce.
const DEPTH = {
  log: 5,
  plate: 10,
  bubble: 20,
  bubbleText: 21,
  table: 30,
  tableText: 31,
  diag: 100,
};

/** Czy kursor stoi w polu tekstowym — wtedy skróty klawiszowe muszą milczeć. */
function typing() {
  const el = document.activeElement;
  return Boolean(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/**
 * Łamanie wiadomości na linie dymka.
 *
 * Osobno obsłużone jest jedno bardzo długie słowo — wklejony adres strony nie ma
 * gdzie się złamać i bez tego dymek wyjechałby daleko za kadr.
 */
function wrapText(text, limit) {
  const lines = [];
  let line = '';

  for (const word of text.split(' ')) {
    let rest = word;
    while (rest.length > limit) {
      if (line) { lines.push(line); line = ''; }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (!rest) continue;
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= limit) line += ` ${rest}`;
    else { lines.push(line); line = rest; }
  }

  if (line) lines.push(line);
  return lines;
}

export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    // Na ekranie zostaje **tylko to, co zmienia decyzję w walce**.
    //
    // Podpowiedź sterowania, stan dźwięku i stan sieci zeszły pod `F1` razem
    // z resztą przyrządów. To były trzy linijki technicznego tekstu wiszące nad
    // grą przez cały czas i nie niosły nic, co gracz musiałby wiedzieć w chwili,
    // gdy ktoś na niego biegnie. Zostają — ale schowane.
    // Nazwy strefy **nie ma na ekranie**. Gracz i tak widzi, gdzie stoi, a przy
    // przekroczeniu granicy PvP dostaje komunikat na środku — i to jest jedyny
    // moment, w którym ta informacja cokolwiek zmienia. Stały napis w rogu był
    // tylko szumem.
    this.zone = this.add.bitmapText(0, 0, 'goblin', '', 11).setVisible(false);
    this.sound_ = this.add.bitmapText(0, 0, 'goblin', '', 11)
      .setTint(0x4fc3f7).setDepth(DEPTH.diag + 1).setVisible(false);
    this.net = this.add.bitmapText(0, 0, 'goblin', '', 11)
      .setTint(0x66913f).setDepth(DEPTH.diag + 1).setVisible(false);

    // Plakietki innych graczy. Trzymamy je w puli i tylko przestawiamy — tworzenie
    // i kasowanie napisów co klatkę potrafi zauważalnie kosztować.
    this.plates = new Map();
    // Gdzie na ekranie wylądowała plakietka każdego gracza. Dymki wiszą nad nimi,
    // a przeliczenie świata na ekran zna wyłącznie scena świata.
    this.plateAt = new Map();

    this.createChat();
    this.createRoster();
    this.createDiagnostics();
    this.createHealth();

    this.refreshAudioLabel();
    audio.onChange(() => this.refreshAudioLabel());

    this.input.keyboard.on('keydown-M', () => {
      if (!typing()) audio.unlock().then(() => audio.toggleMute());
    });
    this.input.keyboard.on('keydown-N', () => {
      if (!typing()) audio.unlock().then(() => audio.toggleMusic());
    });

    this.scale.on('resize', () => this.reposition());
    this.reposition();
  }

  // --- Czat -------------------------------------------------------------------

  createChat() {
    this.bubbles = new Map();      // id gracza → { text, lines, until, node }
    this.bubbleArt = this.add.graphics().setDepth(DEPTH.bubble);

    this.logEntries = [];
    this.lastMessageAt = -Infinity;
    this.logSlots = [];
    for (let i = 0; i < LOG_LINES; i++) {
      this.logSlots.push(this.add.bitmapText(10, 0, 'goblin', '', 11)
        .setDepth(DEPTH.log)
        .setVisible(false));
    }

    this.chatInput = createChatInput({
      limit: CHAT_LIMIT,
      onSend: (text) => this.submitChat(text),
    });

    this.input.keyboard.on('keydown-ENTER', (event) => {
      // Bez zalogowania nie ma do czego pisać, a przy otwartym formularzu
      // logowania Enter należy do niego.
      if (typing() || !this.chatSend) return;
      event.preventDefault();
      this.chatInput.open();
      this.hideRoster();
    });
  }

  /** Włączenie czatu — wywoływane przez scenę świata po udanym wejściu do gry. */
  enableChat(send) {
    this.chatSend = send;
  }

  submitChat(text) {
    const result = this.chatSend?.(text);
    // Odmowa z powodem trafia do logu jako komunikat lokalny. Bez tego wiadomość
    // wysłana za szybko przepadałaby w ciszy i wyglądało to na zerwaną sieć.
    if (result && !result.ok && result.reason) {
      this.addMessage({ system: true, text: result.reason });
    }
  }

  /**
   * Nowa wiadomość: ląduje w logu, a jeśli ma autora — także w dymku nad jego
   * głową. Kolejna wiadomość tego samego gracza zastępuje poprzedni dymek.
   */
  addMessage(entry) {
    const text = String(entry.text ?? '').trim();
    if (!text) return;

    this.lastMessageAt = this.time.now;
    this.logEntries.push({
      name: entry.system ? null : entry.name,
      admin: Boolean(entry.admin),
      you: Boolean(entry.you),
      text,
    });
    if (this.logEntries.length > LOG_LINES) this.logEntries.shift();
    this.refreshLog();

    if (entry.system || entry.id === null || entry.id === undefined) return;

    let bubble = this.bubbles.get(entry.id);
    if (!bubble) {
      bubble = {
        // Ciemny brąz na pergaminie. Tekst w kolorze pergaminu — jak w plakietkach
        // i w logu — byłby na tym tle niewidoczny.
        node: this.add.bitmapText(0, 0, 'goblin', '', 11)
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.bubbleText)
          .setTint(BUBBLE_TEXT),
      };
      this.bubbles.set(entry.id, bubble);
    }

    bubble.node.setText(wrapText(text, BUBBLE_WRAP).join('\n'));
    bubble.until = this.time.now + Math.min(BUBBLE_MAX_MS, BUBBLE_MS + text.length * BUBBLE_PER_CHAR_MS);
  }

  refreshLog() {
    for (let i = 0; i < LOG_LINES; i++) {
      const slot = this.logSlots[i];
      const entry = this.logEntries[i];
      if (!entry) {
        slot.setVisible(false);
        continue;
      }
      slot.setVisible(true);
      slot.setText(entry.name ? `${entry.name}: ${entry.text}` : entry.text);
      slot.setTint(entry.name === null ? SYSTEM : entry.admin ? ADMIN : entry.you ? TEXT : DIM);
    }
  }

  /**
   * Dymki. Rysowane w `update`, a nie przy nadejściu wiadomości, bo postać się
   * rusza i tło dymka musi iść za nią co klatkę.
   */
  updateBubbles(now) {
    this.bubbleArt.clear();

    for (const [id, bubble] of this.bubbles) {
      const left = bubble.until - now;
      if (left <= 0) {
        bubble.node.destroy();
        this.bubbles.delete(id);
        continue;
      }

      const at = this.plateAt.get(id);
      // Gracz poza kadrem albo świeżo rozłączony — dymek istnieje, ale nie ma go
      // gdzie powiesić. Dożyje swojego czasu niewidoczny.
      if (!at) {
        bubble.node.setVisible(false);
        continue;
      }

      const fade = left < BUBBLE_FADE_MS ? left / BUBBLE_FADE_MS : 1;
      const node = bubble.node;

      // Dymek przy krawędzi ekranu wsuwamy do kadru, ale ogonek zostaje nad
      // postacią — inaczej przesunięty dymek wskazywałby kogoś innego.
      const half = bubbleWidth(node.width) / 2;
      const centerX = Math.round(Math.max(half + 2, Math.min(this.scale.width - half - 2, at.x)));
      const shape = bubbleShape(node.width, node.height, at.x - centerX);

      // Zaczepienie: czubek ogonka dwa piksele nad plakietką z nickiem, a ta
      // zajmuje 11 pikseli w górę od swojej pozycji.
      const originX = Math.round(centerX - shape.width / 2);
      const originY = Math.round(at.y - 13) - shape.tipY;

      for (const rect of shape.rects) {
        this.bubbleArt.fillStyle(BUBBLE_TONES[rect.tone], fade);
        this.bubbleArt.fillRect(originX + rect.x, originY + rect.y, rect.w, rect.h);
      }

      node.setVisible(true);
      node.setAlpha(fade);
      node.setPosition(originX + shape.textX, originY + shape.textY);
    }
  }

  updateLog(now) {
    // Przy otwartym polu tekstowym log jest w pełni widoczny — gracz właśnie
    // rozmawia, więc chce widzieć, co było powiedziane.
    if (this.chatInput.isOpen) {
      for (const slot of this.logSlots) slot.setAlpha(1);
      return;
    }
    const silence = now - this.lastMessageAt - LOG_IDLE_MS;
    const alpha = silence <= 0 ? 1 : Math.max(0, 1 - silence / LOG_FADE_MS);
    for (const slot of this.logSlots) slot.setAlpha(alpha);
  }

  // --- Tabela graczy ----------------------------------------------------------

  createRoster() {
    this.rosterArt = this.add.graphics().setDepth(DEPTH.table).setVisible(false);
    this.rosterHead = this.add.bitmapText(0, 0, 'goblin', '', 11)
      .setDepth(DEPTH.tableText)
      .setTint(EMBER)
      .setVisible(false);
    // Wiersze jako pula napisów: każdy ma własny kolor (admin, ty, reszta),
    // a jeden napis wielolinijkowy umie mieć tylko jeden.
    this.rosterRows = [];
    this.rosterVisible = false;

    // Lista graczy chodzi razem z panelem diagnostycznym pod `F1`, a nie pod
    // `TAB`-em. Powód jest prosty: to jest przyrząd dla prowadzącego serwer, nie
    // element rozgrywki — a `TAB` jest potrzebny plecakowi, do którego sięga się
    // sto razy częściej niż do listy obecnych.
    //
    // Samego przełączania nie ma tutaj: robi je `createDiagnostics()`, żeby oba
    // panele zapalały się i gasły jednym warunkiem i nie dało się ich rozjechać.
  }

  /** Skąd brać listę graczy. Pytamy dopiero, gdy tabela jest na ekranie. */
  setRosterSource(source) {
    this.rosterSource = source;
  }

  hideRoster() {
    this.rosterVisible = false;
  }

  updateRoster(now) {
    if (!this.rosterVisible) {
      if (this.rosterArt.visible) {
        this.rosterArt.setVisible(false);
        this.rosterHead.setVisible(false);
        for (const row of this.rosterRows) { row.name.setVisible(false); row.zone.setVisible(false); }
      }
      return;
    }

    // Lista odświeżana pięć razy na sekundę. Co klatkę nie ma po co — nicki się
    // nie zmieniają, a przeskakująca kolejność wierszy jest nieczytelna.
    if (!this.rosterList || now - (this.rosterAt ?? 0) > 200) {
      this.rosterAt = now;
      this.rosterList = [...(this.rosterSource?.() ?? [])].sort((a, b) => {
        if (a.admin !== b.admin) return a.admin ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), 'pl');
      });
    }

    const rows = this.rosterList;
    const width = 236;
    const rowHeight = 14;
    const boxX = Math.round((this.scale.width - width) / 2);
    const boxY = 56;
    const boxH = 30 + Math.max(1, rows.length) * rowHeight + 6;

    this.rosterArt.clear();
    this.rosterArt.fillStyle(PANEL, 0.88);
    this.rosterArt.fillRect(boxX, boxY, width, boxH);
    this.rosterArt.lineStyle(1, BORDER, 1);
    this.rosterArt.strokeRect(boxX + 0.5, boxY + 0.5, width - 1, boxH - 1);
    this.rosterArt.lineBetween(boxX + 1, boxY + 24, boxX + width - 1, boxY + 24);
    this.rosterArt.setVisible(true);

    this.rosterHead
      .setText(`W KUŹNI: ${rows.length}`)
      .setPosition(boxX + 9, boxY + 8)
      .setVisible(true);

    for (let i = 0; i < Math.max(rows.length, this.rosterRows.length); i++) {
      if (i >= this.rosterRows.length) {
        this.rosterRows.push({
          name: this.add.bitmapText(0, 0, 'goblin', '', 11).setDepth(DEPTH.tableText),
          zone: this.add.bitmapText(0, 0, 'goblin', '', 11).setDepth(DEPTH.tableText).setTint(SYSTEM),
        });
      }
      const row = this.rosterRows[i];
      const entry = rows[i];
      if (!entry) {
        row.name.setVisible(false);
        row.zone.setVisible(false);
        continue;
      }

      const y = boxY + 30 + i * rowHeight;
      // Gwiazdka i pomarańczowy kolor idą z serwera, nie z nicku — plakietki
      // obsługi nie da się podrobić wpisanym tekstem.
      row.name
        .setText((entry.admin ? '★ ' : '') + entry.name + (entry.you ? '  (ty)' : ''))
        .setTint(entry.admin ? ADMIN : entry.you ? TEXT : DIM)
        .setPosition(boxX + 9, y)
        .setVisible(true);
      row.zone
        .setText(entry.zone ?? '')
        .setPosition(boxX + width - 9 - row.zone.width, y)
        .setVisible(true);
    }
  }

  // --- Pozostałe napisy -------------------------------------------------------

  createDiagnostics() {
    // Do logu diagnostycznego: „poprawka nie działa" i „przeglądarka odpala stary
    // plik z cache" wyglądają identycznie, dopóki nie widać, co to za przeglądarka.
    const agent = navigator.userAgent;
    this.browser = /Firefox/.test(agent) ? 'Firefox'
      : /Edg\//.test(agent) ? 'Edge'
      : /Chrome/.test(agent) ? 'Chrome'
      : /Safari/.test(agent) ? 'Safari'
      : 'inna';

    this.diagPanel = this.add.rectangle(0, 0, 270, 330, PANEL, 0.72)
      .setOrigin(0, 0)
      .setDepth(DEPTH.diag)
      .setVisible(false);
    this.diag = this.add.bitmapText(8, 8, 'goblin', '', 11)
      .setDepth(DEPTH.diag + 1)
      .setTint(0x66913f)
      .setVisible(false);

    this.input.keyboard.on('keydown-F1', (event) => {
      if (typing()) return;
      event.preventDefault();
      const on = !this.diag.visible;
      this.diag.setVisible(on);
      this.diagPanel.setVisible(on);
      // Lista graczy należy do tego samego przyrządu, więc zapala się razem z nim.
      this.rosterVisible = on && Boolean(this.rosterSource);
      if (!on) this.hideRoster();
      // Suwak pory dnia to element HTML, więc mieszka w scenie świata — stąd
      // przełączanie przez scenę, a nie tutaj.
      this.scene.get('Forge')?.setDiagVisible(on);
    });
  }

  refreshAudioLabel() {
    if (!audio.ready) {
      this.sound_.setText('dźwięk: naciśnij dowolny klawisz');
    } else if (audio.muted) {
      this.sound_.setText('dźwięk: cisza (M)');
    } else {
      this.sound_.setText(audio.musicOn ? 'dźwięk: ogień, wiatr, muzyka' : 'dźwięk: ogień i wiatr (N — muzyka)');
    }
  }

  /**
   * Podpowiedź sterowania. Nie ma jej już na ekranie — trafia do logu czatu jako
   * jedna linijka przy wejściu i tam blaknie razem z resztą. Wisząca stale nad
   * grą była szumem: czyta się ją raz, a przeszkadza zawsze.
   */
  setHint(text) {
    this.hintText = text;
  }

  /**
   * Nazwa strefy i to, czy jesteś w niej bezpieczny.
   *
   * Bezpieczeństwo idzie **kolorem**, nie słowem: kolor czyta się kątem oka,
   * a słowo trzeba przeczytać. Napis jest dla pewności, nie zamiast.
   */
  setZone(text, safe = true) {
    // Tylko znaki z `CHARSET` w `tools/art/font.js`. Font jest generowany i ma
    // zamkniętą listę glifów — wszystko poza nią wypada jako puste miejsce.
    this.zone.setText(safe ? `${text}   [bezpiecznie]` : `${text}   [DZICZ]`);
    this.zone.setTint(safe ? 0x66913f : 0xc43a0d);
  }

  /**
   * Komunikat na środku ekranu. Jedyna rzecz, która ma prawo tam wejść —
   * zarezerwowana na zmianę zasad świata, czyli przekroczenie granicy PvP.
   * Gdyby wchodziło tam cokolwiek innego, przestałby działać.
   */
  announce(text, good = true) {
    if (!this.banner) {
      this.banner = this.add.bitmapText(0, 0, 'goblin', '', 22)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH.diag - 1);
    }
    this.banner.setText(text);
    this.banner.setTint(good ? 0x8ab355 : 0xc43a0d);
    this.banner.setPosition(Math.round(this.scale.width / 2), Math.round(this.scale.height * 0.32));
    this.banner.setAlpha(1);
    this.bannerUntil = this.time.now + 2200;
  }

  updateBanner(now) {
    if (!this.banner || this.banner.alpha <= 0) return;
    const left = this.bannerUntil - now;
    if (left <= 0) this.banner.setAlpha(0);
    else if (left < 700) this.banner.setAlpha(left / 700);
  }

  /** Powitanie po wejściu — inne dla nowego konta i dla powrotu. */
  setHello(name, fresh) {
    // **Bez powitania.** Nikt nie potrzebuje wiedzieć, że wrócił. Zostaje jedna
    // linijka sterowania w logu czatu, która sama zblaknie po chwili ciszy —
    // czyta się ją raz, a wisząca stale nad grą przeszkadzałaby zawsze.
    this.addMessage({
      system: true,
      text: 'WASD ruch   MYSZ cios   SPACJA unik   Shift bieg   Enter czat   F1 panel',
    });
  }

  setNet(text) {
    this.netStatus = text;
    this.net.setText(`sieć: ${text}`);
  }

  /**
   * Panel diagnostyczny. Najważniejsze są trzy liczby czasu: ile go naprawdę
   * minęło, ile twierdzi Phaser i ile trafiło do symulacji. Powinny być bliskie
   * 1000 ms na sekundę — każda wyraźnie mniejsza znaczy, że postać gubi ruch,
   * i od razu widać, na którym etapie.
   */
  setDiagnostics(stats) {
    if (!this.diag.visible) return;
    const now = this.time.now;
    if (now - (this.lastStats ?? 0) < 200) return;   // migające liczby są nieczytelne
    this.lastStats = now;

    const ms = (value) => `${Math.round(value)}`;
    const strata = stats.czasRealny > 0
      ? Math.round((1 - stats.czasSymulacji / stats.czasRealny) * 100)
      : 0;

    this.diag.setText([
      `klient v${stats.wersja}   ${this.browser}`,
      `stan: ${stats.stan}`,
      // Stan sieci i dźwięku zszedł tutaj z ekranu. To są liczby dla
      // prowadzącego serwer, nie informacje potrzebne graczowi w walce.
      this.net.text,
      this.sound_.text,
      '',
      `fps: ${stats.fps.toFixed(0)}   najdłuższa klatka: ${ms(stats.najgorszaKlatka)} ms`,
      '',
      'czas na sekundę (ma być ~1000):',
      `  realny:    ${ms(stats.czasRealny)} ms`,
      `  Phaser:    ${ms(stats.czasPhasera)} ms`,
      `  symulacja: ${ms(stats.czasSymulacji)} ms`,
      `  strata ruchu: ${strata}%`,
      '',
      `ping: ${ms(stats.ping)} ms`,
      `korekta pozycji: ${stats.korekta.toFixed(2)} px`,
      `niepotwierdzone: ${stats.niepotwierdzone}`,
      `gracze obok: ${stats.obok}`,
      `pora dnia: ${stats.poraDnia}   ${stats.pogoda}`,
      `plakietki: ${this.plates.size}   dymki: ${this.bubbles.size}`,
      `ekran: ${Math.round(this.scale.width)}x${Math.round(this.scale.height)}`,
    ].join('\n'));

    // Strata ruchu to jedyna liczba, która wprost tłumaczy "postać jest ciężka".
    this.diag.setTint(strata > 8 ? 0xc43a0d : 0x66913f);
  }

  /**
   * Nicki nad głowami. Współrzędne przychodzą już przeliczone na ekran, bo tylko
   * scena świata wie, jak ustawiona jest jej kamera.
   */
  setNameplates(list) {
    const seen = new Set();
    this.plateAt.clear();
    if (!this.plateBars) this.plateBars = this.add.graphics().setDepth(DEPTH.plate - 1);
    this.plateBars.clear();

    for (const entry of list) {
      seen.add(entry.id);
      let plate = this.plates.get(entry.id);
      // Administrator ma inny kolor plakietki i gwiazdkę przed nickiem. Jedno
      // i drugie jest po to, żeby nie dało się podszyć pod obsługę: sam nick
      // można wpisać, koloru plakietki nie.
      const label = entry.admin ? `★ ${entry.name}` : entry.name;
      if (!plate) {
        plate = this.add.bitmapText(0, 0, 'goblin', label, 11)
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.plate)
          .setAlpha(0.9);
        this.plates.set(entry.id, plate);
      }
      plate.setTint(entry.admin ? ADMIN : DIM);
      if (plate.text !== label) plate.setText(label);

      const x = Math.round(entry.x);
      const y = Math.round(entry.y);
      plate.setPosition(x, y);
      plate.setVisible(true);
      // Dymek wisi nad plakietką, a przeliczenie na ekran zna tylko scena świata.
      this.plateAt.set(entry.id, { x, y });

      // Pasek życia **tylko u rannych**. Nad każdym z osobna wisiałby zawsze
      // i zamieniłby plac w tablicę wyników; pojawiający się dopiero po trafieniu
      // sam z siebie mówi „ten jest ranny, można go dogonić".
      const ratio = entry.maxHp > 0 ? entry.hp / entry.maxHp : 1;
      if (!(ratio < 0.999)) continue;
      const w = 26;
      const bx = x - w / 2;
      const by = y + 2;
      this.plateBars.fillStyle(0x14100f, 0.85);
      this.plateBars.fillRect(bx - 1, by - 1, w + 2, 5);
      this.plateBars.fillStyle(ratio < 0.3 ? 0xc43a0d : 0x66913f, 1);
      this.plateBars.fillRect(bx, by, Math.max(1, Math.round(w * Math.max(0, ratio))), 3);
    }

    for (const [id, plate] of this.plates) {
      if (seen.has(id)) continue;
      plate.destroy();
      this.plates.delete(id);
    }
  }

  // --- Pasek życia ------------------------------------------------------------

  /**
   * Pasek zdrowia własnej postaci.
   *
   * Rysowany prostokątami, nie sprite'em, bo ma **spadać płynnie**, a nie skakać
   * co migawkę. Za czerwoną warstwą idzie druga, jasna, która dogania ją z
   * opóźnieniem — po niej widać, ile życia właśnie ubyło, a nie tylko ile zostało.
   * Bez tego mocny cios i lekkie draśnięcie wyglądają tak samo.
   */
  /**
   * Panel gracza: portret, życie, wytrzymałość, głód i uniki.
   *
   * **Rysowany w powiększeniu `UI_SCALE`, nie w pikselach ekranu.** To była
   * przyczyna, dla której poprzednich wersji nie dało się zobaczyć w grze:
   * kanwa pracuje w pełnej rozdzielczości monitora, więc pasek szeroki na 232
   * piksele zajmował na ekranie 1920 nieco ponad dziesiątą część szerokości
   * i miał piętnaście pikseli wysokości. Świat jest powiększany dwu- albo
   * czterokrotnie i interfejs musi być też — inaczej pixel art w HUD-zie jest
   * po prostu drobny, a nie pikselowy.
   */
  /**
   * Panel stanu: pasek zycia i trzy ladunki uniku pod nim.
   *
   * Wersja z portretem, imieniem, trzema paskami i gniazdami na tekst zostala
   * ODRZUCONA przez uzytkownika po czterech przebudowach. Wracamy do tego, co
   * dzialalo od poczatku, z jedyna poprawka, ktorej naprawde brakowalo:
   * POWIEKSZENIEM i liczba w pasku.
   *
   * Lekcja warta zapisania: gdy uzytkownik mowi, ze cos jest za male, to zwykle
   * znaczy dokladnie tyle. Przebudowa zamiast powiekszenia kosztowala tu kilka
   * godzin i skonczyla sie powrotem do punktu wyjscia.
   */
  createHealth() {
    // Ramka rysowana w jednostkach interfejsu i dopiero potem powiekszana,
    // zeby piksele zostaly ostre.
    this.healthFrame = this.add.nineslice(
      PANEL_X, PANEL_Y, 'ui', 'frame_slot', BAR_W, BAR_H, SLICE, SLICE, SLICE, SLICE
    ).setOrigin(0, 0).setScale(UI_SCALE).setDepth(DEPTH.plate);

    // Wypelnienie pod ramka: ramka ma pusty srodek, wiec pasek widac przez nia.
    this.health = this.add.graphics().setDepth(DEPTH.plate - 1);

    this.healthShown = 1;
    this.healthGhost = 1;
    this.healthValue = 1;

    this.healthLabel = this.add.bitmapText(0, 0, 'goblin', '', 11)
      .setScale(UI_SCALE).setTint(TEXT).setDepth(DEPTH.plate + 1);

    // Znaczniki uniku pod paskiem.
    this.pips = [];
    for (let i = 0; i < DODGE_CHARGES; i++) {
      const px = PANEL_X + i * PIP_STEP * UI_SCALE;
      const py = PANEL_Y + (BAR_H + 4) * UI_SCALE;
      this.pips.push({
        empty: this.add.image(px, py, 'ui', 'pip_empty')
          .setOrigin(0, 0).setScale(UI_SCALE).setDepth(DEPTH.plate),
        full: this.add.image(px, py, 'ui', 'pip_full')
          .setOrigin(0, 0).setScale(UI_SCALE).setDepth(DEPTH.plate + 1),
      });
    }
    this.dodgeFuel = DODGE_CHARGES;
  }

  setPlayerName() {}

  setHealth(hp, maxHp, safe) {
    this.healthValue = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.healthText = `${Math.max(0, Math.round(hp))}/${Math.round(maxHp)}`;
    this.healthSafe = Boolean(safe);
  }

  setDodge(fuel) {
    this.dodgeFuel = Math.max(0, Math.min(DODGE_CHARGES, fuel));
  }

  updateHealth(delta) {
    if (!this.health) return;
    const dt = Math.min(delta, 60) / 1000;

    // Czerwony pasek dogania szybko, jasny slad wolno - stad bierze sie blysk
    // pokazujacy wielkosc ciosu.
    this.healthShown += (this.healthValue - this.healthShown) * Math.min(1, dt * 14);
    this.healthGhost += (this.healthShown - this.healthGhost) * Math.min(1, dt * 2.6);
    if (this.healthGhost < this.healthShown) this.healthGhost = this.healthShown;

    // Wnetrze ramki, liczone w pikselach ekranu.
    const ix = PANEL_X + SLICE * UI_SCALE;
    const iy = PANEL_Y + SLICE * UI_SCALE;
    const iw = (BAR_W - SLICE * 2) * UI_SCALE;
    const ih = (BAR_H - SLICE * 2) * UI_SCALE;

    this.health.clear();
    this.health.fillStyle(0x231c15, 1);
    this.health.fillRect(ix, iy, iw, ih);
    this.health.fillStyle(0xc47a74, 0.75);
    this.health.fillRect(ix, iy, Math.round(iw * this.healthGhost), ih);
    // Rampa life z palety: przygaszona czerwien, nie neon.
    const low = this.healthShown < 0.3;
    const filled = Math.round(iw * this.healthShown);
    this.health.fillStyle(low ? 0x7a3236 : 0xa04a4a, 1);
    this.health.fillRect(ix, iy, filled, ih);
    this.health.fillStyle(low ? 0xa04a4a : 0xc47a74, 1);
    this.health.fillRect(ix, iy, filled, Math.round(ih * 0.32));

    // Liczba W pasku, nie obok: obok robi sie z niej osobny element, ktorego oko
    // musi szukac.
    this.healthLabel.setPosition(ix + 6 * UI_SCALE, iy + Math.round((ih - 11 * UI_SCALE) / 2));
    this.healthLabel.setText(this.healthText ?? '');

    // Ladujacy sie znacznik wypelnia sie OD DOLU, wiec widac nie tylko ile masz,
    // ale ile zaraz bedziesz mial.
    this.pips.forEach((pip, i) => {
      const part = Math.max(0, Math.min(1, this.dodgeFuel - i));
      pip.full.setVisible(part > 0);
      if (part <= 0) return;
      const h = pip.full.height;
      const shown = Math.max(1, Math.round(h * part));
      pip.full.setCrop(0, h - shown, pip.full.width, shown);
    });
  }
  update(time, delta) {
    this.updateBubbles(time);
    this.updateLog(time);
    this.updateRoster(time);
    this.updateHealth(delta ?? 16);
    this.updateBanner(time);
  }

  reposition() {
    // Panel gracza i strefa ustawiają się same w `updateHealth()` — trzymają się
    // lewego górnego rogu, więc rozmiar okna ich nie dotyczy. Tutaj zostają tylko
    // te elementy, które wiszą przy dolnej krawędzi.

    // Log siedzi nad polem do pisania, a to nad paskiem podpowiedzi. Wysokość
    // pola (`#chat-input` w index.html) jest stała, więc ten odstęp jest wpisany
    // liczbą — 72 px na pole plus 26 px na ramkę i tekst w nim.
    const bottom = this.scale.height - 106;
    for (let i = 0; i < LOG_LINES; i++) {
      this.logSlots[i].setPosition(10, bottom - (LOG_LINES - 1 - i) * 13);
    }
  }
}





