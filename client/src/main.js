// Punkt wejścia klienta. Phaser wczytywany jest z CDN-a, więc nie ma tu żadnego
// kroku budowania — wystarczy odświeżyć stronę.

import { BootScene } from './scenes/Boot.js';
import { ForgeScene } from './scenes/Forge.js';
import { HudScene } from './scenes/Hud.js';
import { armAudioUnlock } from './audio/audio.js';
// Suwaki głośności zdjęte z ekranu — trafią do menu pod `ESC`. Panel wiszący
// w rogu przez całą grę był resztką z czasów, gdy nie było gdzie go postawić.
// `M` i `N` dalej działają.

// Przeładowywanie po zapisie pliku obsługuje teraz warstwa sieciowa gry — jedno
// gniazdo zamiast dwóch. Osobne połączenie było odrzucane przez serwer, bo nie
// przedstawiało się komunikatem "join".
armAudioUnlock();

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

