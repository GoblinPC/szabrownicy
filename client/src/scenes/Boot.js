// Wczytanie assetów i przygotowanie animacji.

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
      }
    }
  }
}
