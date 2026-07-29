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

    this.setHint('WASD / strzałki — ruch    Shift — bieg    M — cisza    N — muzyka');
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

  setNet(text) {
    this.net.setText(`sieć: ${text}`);
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
      if (!plate) {
        plate = this.add.bitmapText(0, 0, 'goblin', entry.name, 11)
          .setOrigin(0.5, 1)
          .setTint(0xbda997)
          .setAlpha(0.85);
        this.plates.set(entry.id, plate);
      }
      if (plate.text !== entry.name) plate.setText(entry.name);

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
