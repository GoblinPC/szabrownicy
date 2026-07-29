// Punkt wejścia klienta. Phaser wczytywany jest z CDN-a, więc nie ma tu żadnego
// kroku budowania — wystarczy odświeżyć stronę.

import { BootScene } from './scenes/Boot.js';
import { ForgeScene } from './scenes/Forge.js';
import { HudScene } from './scenes/Hud.js';
import { connectLiveReload } from './util/livereload.js';
import { armAudioUnlock } from './audio/audio.js';
import { createMixer } from './ui/mixer.js';

connectLiveReload();
armAudioUnlock();
createMixer();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0b0908',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, ForgeScene, HudScene],
});
