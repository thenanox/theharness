import * as Phaser from 'phaser';
import type { InputController } from './InputController';
import { THEME } from '../theme';

/**
 * On-screen touch controls for mobile.
 *
 * Layout:
 *   top-left     : TAP | AIM toggle (small pill)
 *   bottom-left  : ◄ ►      walk / air-nudge
 *   bottom-right : ▲ / ▼    reel in (+jump) / reel out (+detach)
 *
 * Visual language: ink circles with bone-white glyphs. Buttons sit at
 * ~22% alpha when untouched and brighten to ember when pressed so they
 * stay out of the way on the calm ink world.
 *
 * On touch-capable devices the controls are always visible. On pure-
 * mouse desktops they stay hidden unless ?touch=1 is in the URL.
 * Each button's screen-space rect is registered on the InputController
 * so tap-to-fire ignores taps that land on a button.
 */
export class TouchControls {
  private scene: Phaser.Scene;
  private input: InputController;
  private root: Phaser.GameObjects.Container;
  private modeLabel?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, input: InputController) {
    this.scene = scene;
    this.input = input;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);

    if (!input.isTouchDevice()) {
      this.root.setVisible(false);
      return;
    }

    const { width, height } = scene.scale;
    const size = 72;
    const gap = 12;
    const margin = 18;

    // --- bottom-left: walk pad ---
    const leftX = margin;
    const leftY = height - margin - size;
    this.makeHoldButton(
      leftX,
      leftY,
      size,
      '◄',
      () => {
        input.state.left = true;
      },
      () => {
        input.state.left = false;
      },
    );
    this.makeHoldButton(
      leftX + size + gap,
      leftY,
      size,
      '►',
      () => {
        input.state.right = true;
      },
      () => {
        input.state.right = false;
      },
    );

    // --- bottom-right: reel pad, stacked vertically ---
    const rightX = width - margin - size;
    const topY = height - margin - size * 2 - gap;
    const botY = height - margin - size;
    this.makeHoldButton(
      rightX,
      topY,
      size,
      '▲',
      () => {
        input.state.reelUp = true;
        input.state.jumpPressed = true;
      },
      () => {
        input.state.reelUp = false;
      },
    );
    this.makeHoldButton(
      rightX,
      botY,
      size,
      '▼',
      () => {
        input.state.reelDown = true;
        input.state.detachPressed = true;
      },
      () => {
        input.state.reelDown = false;
      },
    );

    // --- top-left: TAP/AIM mode toggle ---
    this.makeModeToggle(margin, margin);

    // --- centered hint (fades after first interaction) ---
    const hint = scene.add
      .text(
        width / 2,
        height - 14,
        'tap to fire · hold anywhere to aim · press ⓘ to swap mode',
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#1b1c21',
        },
      )
      .setOrigin(0.5, 1)
      .setAlpha(0.55)
      .setScrollFactor(0)
      .setDepth(1000);

    // Fade the hint after 8 seconds so it's not permanent UI clutter.
    scene.tweens.add({
      targets: hint,
      alpha: 0,
      duration: 900,
      delay: 8000,
      onComplete: () => hint.destroy(),
    });
  }

  private makeHoldButton(
    x: number,
    y: number,
    size: number,
    label: string,
    onDown: () => void,
    onUp: () => void,
  ): void {
    this.input.registerTouchZone(x, y, size, size);

    const bg = this.scene.add
      .circle(x + size / 2, y + size / 2, size / 2, THEME.palette.inkDeep, 0.22)
      .setStrokeStyle(2, THEME.palette.inkDeep, 0.6)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    const text = this.scene.add
      .text(x + size / 2, y + size / 2, label, {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#f4efe6',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    bg.on('pointerdown', () => {
      bg.setFillStyle(THEME.palette.accent, 0.5);
      onDown();
    });
    const release = () => {
      bg.setFillStyle(THEME.palette.inkDeep, 0.22);
      onUp();
    };
    bg.on('pointerup', release);
    bg.on('pointerupoutside', release);
    bg.on('pointerout', release);

    this.root.add([bg, text]);
  }

  private makeModeToggle(x: number, y: number): void {
    const w = 118;
    const h = 32;
    this.input.registerTouchZone(x, y, w, h);

    const bg = this.scene.add
      .rectangle(x + w / 2, y + h / 2, w, h, THEME.palette.inkDeep, 0.3)
      .setStrokeStyle(1.5, THEME.palette.inkDeep, 0.7)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    this.modeLabel = this.scene.add
      .text(x + w / 2, y + h / 2, this.labelText(), {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f4efe6',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    bg.on('pointerdown', () => {
      this.input.toggleTouchMode();
      if (this.modeLabel) this.modeLabel.setText(this.labelText());
      // Subtle pulse so the player sees the change.
      this.scene.tweens.add({
        targets: [bg, this.modeLabel],
        alpha: { from: 0.4, to: 1 },
        duration: 180,
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(4);
      }
    });

    this.root.add([bg, this.modeLabel]);
  }

  private labelText(): string {
    return this.input.touchMode === 'tap' ? 'ⓘ  MODE · TAP' : 'ⓘ  MODE · AIM';
  }
}
