// Warstwa interfejsu. Osobna scena, bo kamera świata pracuje w powiększeniu,
// a napisy mają być rysowane piksel w piksel. Tu wyląduje też czat.

import { audio } from '../audio/audio.js';

export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    this.hint = this.add.bitmapText(10, 10, 'goblin', '', 11).setTint(0x9c8f80);
    this.zone = this.add.bitmapText(10, 26, 'goblin', '', 11).setTint(0xf2700f);
    this.sound_ = this.add.bitmapText(10, 42, 'goblin', '', 11).setTint(0x4fc3f7);
    this.net = this.add.bitmapText(10, 58, 'goblin', '', 11).setTint(0x66913f);

    // Plakietki innych graczy. Trzymamy je w puli i tylko przestawiamy — tworzenie
    // i kasowanie napisów co klatkę potrafi zauważalnie kosztować.
    this.plates = new Map();

    const agent = navigator.userAgent;
    this.browser = /Firefox/.test(agent) ? 'Firefox'
      : /Edg\//.test(agent) ? 'Edge'
      : /Chrome/.test(agent) ? 'Chrome'
      : /Safari/.test(agent) ? 'Safari'
      : 'inna';

    this.diagPanel = this.add.rectangle(0, 0, 250, 300, 0x14100f, 0.72).setOrigin(0, 0);
    this.diag = this.add.bitmapText(8, 8, 'goblin', '', 11).setTint(0x66913f);
    this.input.keyboard.on('keydown-F1', (event) => {
      event.preventDefault();
      const on = !this.diag.visible;
      this.diag.setVisible(on);
      this.diagPanel.setVisible(on);
    });

    this.setHint('WASD / strzałki — ruch    Shift — bieg    M — cisza    N — muzyka    F1 — diagnostyka');
    this.refreshAudioLabel();
    audio.onChange(() => this.refreshAudioLabel());

    this.input.keyboard.on('keydown-M', () => audio.unlock().then(() => audio.toggleMute()));
    this.input.keyboard.on('keydown-N', () => audio.unlock().then(() => audio.toggleMusic()));

    this.scale.on('resize', () => this.reposition());
    this.reposition();
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

  setHint(text) {
    this.hint.setText(text);
  }

  setZone(text) {
    this.zone.setText(text);
  }

  /** Powitanie po wejściu — inne dla nowego konta i dla powrotu. */
  setHello(name, fresh) {
    this.setHint(fresh
      ? `Witaj, ${name}. Konto założone.    WASD — ruch    Shift — bieg    F1 — diagnostyka`
      : `Witaj ponownie, ${name}.    WASD — ruch    Shift — bieg    F1 — diagnostyka`);
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

    for (const entry of list) {
      seen.add(entry.id);
      let plate = this.plates.get(entry.id);
      // Administrator ma inny kolor plakietki i gwiazdkę przed nickiem. Jedno
      // i drugie jest po to, żeby nie dało się podszyć pod obsługę: sam nick
      // można wpisać, koloru plakietki nie.
      const label = entry.admin ? `\u2605 ${entry.name}` : entry.name;
      if (!plate) {
        plate = this.add.bitmapText(0, 0, 'goblin', label, 11)
          .setOrigin(0.5, 1)
          .setAlpha(0.9);
        this.plates.set(entry.id, plate);
      }
      plate.setTint(entry.admin ? 0xffa524 : 0xbda997);
      if (plate.text !== label) plate.setText(label);

      plate.setPosition(Math.round(entry.x), Math.round(entry.y));
      // Napis daleko poza kadrem nie musi być rysowany.
      plate.setVisible(entry.x > -60 && entry.x < this.scale.width + 60
        && entry.y > -60 && entry.y < this.scale.height + 60);
    }

    for (const [id, plate] of this.plates) {
      if (seen.has(id)) continue;
      plate.destroy();
      this.plates.delete(id);
    }
  }

  reposition() {
    this.hint.setPosition(10, this.scale.height - 64);
    this.zone.setPosition(10, this.scale.height - 48);
    this.sound_.setPosition(10, this.scale.height - 32);
    this.net.setPosition(10, this.scale.height - 16);
  }
}
