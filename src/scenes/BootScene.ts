import * as Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { THEME } from '../theme';
import { AudioBus } from '../systems/AudioBus';

/**
 * Placeholder boot + preload merged into one tiny scene for M0/M1.
 * Real MenuScene + PreloadScene split lands in M2.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Music slot — graceful fallback if the file is missing.
    AudioBus.queuePreload(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(THEME.palette.background);

    // Title: ink-charcoal type against bone paper.
    this.add
      .text(GAME_W / 2, GAME_H / 2 - 40, THEME.title, {
        fontFamily: 'ui-serif, Cormorant Garamond, Georgia, serif',
        fontSize: '56px',
        color: '#1b1c21',
      })
      .setOrigin(0.5);

    // Tagline — ember accent (the only warm element on the title card).
    this.add
      .text(GAME_W / 2, GAME_H / 2 + 16, THEME.tagline, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ff7a3d',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_W / 2, GAME_H / 2 + 56, THEME.labels.startPrompt, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#636572',
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    // M0 smoke test: jump straight into GameScene so we can see Matter ticking.
    // Replaced by a real Menu in M5.
    this.time.delayedCall(700, () => this.scene.start('Game'));
  }
}
