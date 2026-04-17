import * as Phaser from 'phaser';
import type { InputController } from './InputController';
import { THEME } from '../theme';

/**
 * On-screen touch controls — portrait layout.
 *
 * Layout (portrait 480×854):
 *   Bottom-left  : ◄ ►   walk / swing pump   (two side-by-side circles)
 *   Bottom-right : ▲ ▼   reel in / reel out  (two stacked circles)
 *   Top-left     : mode toggle pill           (TAP | AIM)
 *
 * Buttons sit at 22% alpha when idle, brighten to ember on press.
 * Hidden on pure-mouse desktops unless ?touch=1 is in the URL.
 *
 * Touch zones are registered on InputController so tap-to-fire never
 * triggers under a button.
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
    // Portrait layout: buttons sized relative to viewport.
    // Base size: 72px on a 480px-wide canvas (scales with FIT).
    const size = 72;
    const gap = 10;
    const margin = 16;

    // ── Bottom-left: walk pad ◄ ► ────────────────────────────────────────
    const leftPadX = margin;
    const btnY = height - margin - size;

    this.makeHoldButton(
      leftPadX,
      btnY,
      size,
      '◄',
      () => { input.setTouchHold('left', true); },
      () => { input.setTouchHold('left', false); },
    );
    this.makeHoldButton(
      leftPadX + size + gap,
      btnY,
      size,
      '►',
      () => { input.setTouchHold('right', true); },
      () => { input.setTouchHold('right', false); },
    );

    // ── Bottom-right: reel pad ▲ / ▼ (stacked) ──────────────────────────
    const rightX = width - margin - size;
    const reelUpY   = height - margin - size * 2 - gap;
    const reelDownY = height - margin - size;

    this.makeHoldButton(
      rightX,
      reelUpY,
      size,
      '▲',
      () => {
        input.setTouchHold('reelUp', true);
        // Also fires the rope when IDLE (firePressed is ignored by GameScene when SWINGING).
        // Detach is done by tapping the arena (TAP mode) or lifting after aim (AIM mode).
        input.state.firePressed = true;
      },
      () => { input.setTouchHold('reelUp', false); },
    );
    this.makeHoldButton(
      rightX,
      reelDownY,
      size,
      '▼',
      () => { input.setTouchHold('reelDown', true); },
      () => { input.setTouchHold('reelDown', false); },
    );

    // ── Top-left: TAP / AIM mode toggle ─────────────────────────────────
    this.makeModeToggle(margin, margin);

    // ── Centered hint (fades after 8 s) ──────────────────────────────────
    const hint = scene.add
      .text(width / 2, height - margin - size * 2 - gap * 3, 'tap to fire · ▲▼ to reel', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#1b1c21',
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.5)
      .setScrollFactor(0)
      .setDepth(1000);

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
      .setStrokeStyle(2, THEME.palette.inkDeep, 0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    const text = this.scene.add
      .text(x + size / 2, y + size / 2, label, {
        fontFamily: 'monospace',
        fontSize: '28px',
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
    // pointerout is intentionally omitted: on mobile, any slight finger movement
    // fires pointerout and would immediately release the button while still held.

    this.root.add([bg, text]);
  }

  private makeModeToggle(x: number, y: number): void {
    const w = 110;
    const h = 30;
    this.input.registerTouchZone(x, y, w, h);

    const bg = this.scene.add
      .rectangle(x + w / 2, y + h / 2, w, h, THEME.palette.inkDeep, 0.28)
      .setStrokeStyle(1.5, THEME.palette.inkDeep, 0.6)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    this.modeLabel = this.scene.add
      .text(x + w / 2, y + h / 2, this.labelText(), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f4efe6',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    bg.on('pointerdown', () => {
      this.input.toggleTouchMode();
      if (this.modeLabel) this.modeLabel.setText(this.labelText());
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
    return this.input.touchMode === 'tap' ? 'ⓘ MODE · TAP' : 'ⓘ MODE · AIM';
  }
}
