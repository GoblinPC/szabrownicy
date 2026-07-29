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

  reposition() {
    this.hint.setPosition(10, this.scale.height - 48);
    this.zone.setPosition(10, this.scale.height - 32);
    this.sound_.setPosition(10, this.scale.height - 16);
  }
}
