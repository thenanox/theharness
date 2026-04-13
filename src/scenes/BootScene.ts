import * as Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { THEME } from '../theme';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(THEME.palette.background);

    // Placeholder title until PreloadScene and MenuScene come online.
    this.add
      .text(GAME_W / 2, GAME_H / 2 - 40, THEME.title, {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#f5f5f5',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_W / 2, GAME_H / 2 + 20, THEME.tagline, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#e0c080',
      })
      .setOrigin(0.5);

    // M0 smoke test: jump straight into GameScene so we can see Matter ticking.
    this.time.delayedCall(500, () => this.scene.start('Game'));
  }
}
