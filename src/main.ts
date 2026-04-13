import * as Phaser from 'phaser';
import { GAME_W, GAME_H, PHYSICS } from './config';
import { THEME } from './theme';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

// Ink & Ember is smooth / brush-stroke, not pixel-art — so pixelArt is off
// and roundPixels is false. Leaving pixelArt on would fuzzy-up the circle
// strokes on the rope glow.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: THEME.palette.background,
  roundPixels: false,
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: PHYSICS.gravityY },
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      constraintIterations: PHYSICS.constraintIterations,
      debug: false,
    },
  },
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
