import * as Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { THEME } from '../theme';
import { AudioBus } from '../systems/AudioBus';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void { AudioBus.queuePreload(this); }

  create(): void {
    this.cameras.main.setBackgroundColor(THEME.palette.screenBg);

    // ── CRT power-on scan line sweeping top→bottom ─────────────────────────
    const scanBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    scanBar.fillStyle(THEME.palette.phosphorBase, 0.5);
    scanBar.fillRect(0, 0, GAME_W, 4);
    scanBar.setAlpha(0.8);

    let scanY = 0;
    const sweepDuration = 600;
    this.tweens.add({
      targets: scanBar,
      y: { from: 0, to: GAME_H },
      duration: sweepDuration,
      ease: 'Sine.easeIn',
      onComplete: () => {
        scanBar.destroy();
        this.showTitle();
      },
    });

    // Falling ember dot (phosphor trace — preview of the rope mechanic)
    const traceGfx = this.add.graphics().setScrollFactor(0).setDepth(5);
    const trace: { x: number; y: number }[] = [];
    const dotX = GAME_W * 0.5;
    let dotY = 0;
    this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        dotY += 2.5;
        trace.push({ x: dotX, y: dotY });
        if (trace.length > 30) trace.shift();
        traceGfx.clear();
        trace.forEach((p, i) => {
          const a = (i / trace.length) * 0.35;
          traceGfx.fillStyle(THEME.palette.ember, a);
          traceGfx.fillCircle(p.x, p.y, 1.5);
        });
        if (dotY > GAME_H) {
          dotY = 0;
          trace.length = 0;
        }
      },
    });

    void scanY;
  }

  private showTitle(): void {
    // Title glitches in: offset right then snaps
    const title = this.add
      .text(GAME_W / 2 + 10, GAME_H / 2 - 40, THEME.title, {
        fontFamily: 'ui-serif, Cormorant Garamond, Georgia, serif',
        fontSize: '56px',
        color: `#${THEME.palette.phosphorBase.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: title,
      alpha: { from: 0, to: 1 },
      x: { from: GAME_W / 2 + 10, to: GAME_W / 2 },
      duration: 120,
      ease: 'Cubic.easeOut',
    });

    // Tagline — ember accent (warm element on the cold CRT)
    const tagline = this.add
      .text(GAME_W / 2, GAME_H / 2 + 16, THEME.tagline, {
        fontFamily: 'monospace', fontSize: '15px', color: '#ff7a3d',
      })
      .setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: tagline, alpha: 1, duration: 400, delay: 300 });

    // Start prompt — pulses
    const prompt = this.add
      .text(GAME_W / 2, GAME_H / 2 + 56, THEME.labels.startPrompt, {
        fontFamily: 'monospace', fontSize: '12px',
        color: `#${THEME.palette.phosphorBase.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: prompt, alpha: { from: 0, to: 0.7 }, duration: 500, delay: 600,
      onComplete: () => {
        this.tweens.add({
          targets: prompt, alpha: { from: 0.3, to: 0.7 },
          duration: 1400, yoyo: true, repeat: -1,
        });
      },
    });

    // Transition: pointer-down OR 4s
    const launch = () => {
      this.cameras.main.fade(300, 0, 0, 0);
      this.time.delayedCall(300, () => this.scene.start('Game'));
    };
    this.time.delayedCall(4000, launch);
    this.input.once('pointerdown', launch);
  }
}
