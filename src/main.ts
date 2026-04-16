import * as Phaser from 'phaser';
import { GAME_W, GAME_H, PHYSICS } from './config';
import { THEME } from './theme';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

// Portrait-first (480×854, 9:16). Scales to fill any screen while keeping
// aspect ratio. Desktop: centered tall window. Mobile: fills portrait screen.
// roundPixels off — brush-stroke curves need sub-pixel smoothness.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_W,
  height: GAME_H,
  input: {
    activePointers: 4,
  },
  backgroundColor: THEME.palette.screenBg,
  roundPixels: false,
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: ({
      gravity: { x: 0, y: PHYSICS.gravityY },
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      constraintIterations: PHYSICS.constraintIterations,
      // Tight slop: static bodies reject penetration aggressively.
      // Default 0.05 is too loose; 0.01 tightens it to help prevent tunneling.
      // Phaser 4 types don't expose this Matter.js engine option — cast needed.
      slop: 0.01,
      debug: false,
    } as unknown) as Phaser.Types.Physics.Matter.MatterWorldConfig,
  },
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
