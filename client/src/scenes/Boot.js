// Wczytanie assetów i przygotowanie animacji.

import { ATTACK_STEPS, AIMS } from '../world/movement.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.spritesheet('tiles', 'assets/gen/tiles.png', { frameWidth: 16, frameHeight: 16 });
    this.load.atlas('props', 'assets/gen/props.png', 'assets/gen/props.json');
    this.load.atlas('goblins', 'assets/gen/goblins.png', 'assets/gen/goblins.json');
    this.load.bitmapFont('goblin', 'assets/gen/font.png', 'assets/gen/font.xml');
    this.load.json('tileIndex', 'assets/gen/tiles.json');
    this.load.json('variants', 'assets/gen/variants.json');
  }

  create() {
    this.createAnimations();
    document.getElementById('boot')?.remove();
    this.scene.start('Forge');
  }

  createAnimations() {
    for (const size of ['small', 'mid', 'big']) {
      this.anims.create({
        key: `flame_${size}`,
        frames: [0, 1, 2, 3].map((i) => ({ key: 'props', frame: `flame_${size}_${i}` })),
        frameRate: 8,
        repeat: -1,
      });
    }

    for (const variant of this.cache.json.get('variants')) {
      for (const dir of ['down', 'up', 'side']) {
        this.anims.create({
          key: `g${variant.id}_${dir}_idle`,
          frames: [0, 1].map((i) => ({ key: 'goblins', frame: `g${variant.id}_${dir}_idle${i}` })),
          frameRate: 2,
          repeat: -1,
        });
        this.anims.create({
          key: `g${variant.id}_${dir}_run`,
          frames: [0, 1, 2, 3, 4, 5].map((i) => ({ key: 'goblins', frame: `g${variant.id}_${dir}_run${i}` })),
          frameRate: 12,
          repeat: -1,
        });

        // Cios ma **nierówne czasy klatek** i to jest sedno odczucia. Zamach trwa
        // najdłużej, bo to on ostrzega, że cios zaraz padnie; samo uderzenie jest
        // najkrótsze — ostrze ma przemknąć, nie przejechać. Przy równych czasach
        // całość czyta się jak powolne machanie.
        //
        // Czasy bierzemy wprost z faz w `world/movement.js`, po jednym zestawie na
        // każdy cios łańcucha. Dzięki temu **animacja nie może rozjechać się
        // z fizyką**: gdy zmieni się czas zamachu, obraz zmienia się razem z nim.
      }

      // Ciosów jest pięć kierunków, a sylwetek cztery: ukos to ta sama postać
      // z bokiem, tylko z drzewcem obróconym. Dlatego osobna pętla.
      for (const aim of AIMS) {
        ATTACK_STEPS.forEach((step, index) => {
          this.anims.create({
            key: `g${variant.id}_${aim}_atk${index}`,
            frames: step.phases.map((phase, frame) => ({
              key: 'goblins',
              frame: `g${variant.id}_${aim}_a${index}f${frame}`,
              duration: phase.ms,
            })),
            repeat: 0,
          });
        });
      }
    }

    // Ślad cięcia: startuje razem z klatką uderzenia, więc jest krótszy niż cios.
    for (const dir of AIMS) {
      this.anims.create({
        key: `slash_${dir}`,
        frames: [0, 1, 2].map((i) => ({ key: 'goblins', frame: `slash_${dir}${i}` })),
        frameRate: 18,
        repeat: 0,
        hideOnComplete: true,
      });
    }
  }
}
