import * as Phaser from 'phaser';
import type { InputController } from './InputController';
import { THEME } from '../theme';

/**
 * On-screen touch controls — portrait layout.
 *
 * Layout (portrait 480×854):
 *   Bottom-left  : virtual joystick — ◄►  swing pump / aim rotate
 *                                   — ▲▼  reel in / reel out
 *   Top-left     : mode toggle pill        (TAP | AIM)
 *
 * Fire/detach:
 *   TAP mode  — tap anywhere on the arena
 *   AIM mode  — hold to aim, release to fire; quick tap snaps-fires
 *
 * The joystick zone is registered on InputController so arena-fire taps
 * are never triggered under the joystick area.
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
    const margin = 16;

    // ── Bottom-left: virtual joystick ────────────────────────────────────
    const joyR = 68;
    const joyX = margin + joyR;
    const joyY = height - margin - joyR;
    this.makeJoystick(joyX, joyY, joyR, 26);

    // ── Top-left: TAP / AIM mode toggle ─────────────────────────────────
    this.makeModeToggle(margin, margin);

    // ── Hint (fades after 8 s) ───────────────────────────────────────────
    const hint = scene.add
      .text(width / 2, joyY - joyR - 10, 'tap arena to fire · joystick to aim/reel', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f4efe6',
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.35)
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

  // ── Virtual joystick ───────────────────────────────────────────────────

  private makeJoystick(cx: number, cy: number, baseR: number, stickR: number): void {
    // Register as a touch zone so arena-fire taps are ignored here.
    this.input.registerTouchZone(cx - baseR, cy - baseR, baseR * 2, baseR * 2);

    const base = this.scene.add
      .circle(cx, cy, baseR, THEME.palette.inkDeep, 0.18)
      .setStrokeStyle(2, THEME.palette.inkDeep, 0.45)
      .setScrollFactor(0)
      .setDepth(1000);

    const stick = this.scene.add
      .circle(cx, cy, stickR, THEME.palette.inkDeep, 0.65)
      .setScrollFactor(0)
      .setDepth(1001);

    // Faint cardinal labels for orientation.
    const d = baseR * 0.62;
    const s = { fontFamily: 'monospace', fontSize: '14px', color: '#f4efe6' };
    const lbl = (x: number, y: number, t: string) =>
      this.scene.add.text(x, y, t, s).setOrigin(0.5).setAlpha(0.28).setScrollFactor(0).setDepth(1000);

    this.root.add([
      base, stick,
      lbl(cx - d, cy, '◄'), lbl(cx + d, cy, '►'),
      lbl(cx, cy - d, '▲'), lbl(cx, cy + d, '▼'),
    ]);

    type Dir = 'left' | 'right' | 'reelUp' | 'reelDown';
    const dirs: Dir[] = ['left', 'right', 'reelUp', 'reelDown'];
    let activeId: number | null = null;

    const travelR = baseR * 0.65; // full deflection = intensity 1.0

    const reset = () => {
      stick.setPosition(cx, cy);
      base.setFillStyle(THEME.palette.inkDeep, 0.18);
      dirs.forEach(k => this.input.setTouchHold(k, false));
      this.input.clearJoyAnalog();
      activeId = null;
    };

    const move = (px: number, py: number) => {
      const dx = px - cx, dy = py - cy;
      const dist = Math.hypot(dx, dy);
      const travel = Math.min(dist, travelR);
      const a = dist > 1 ? Math.atan2(dy, dx) : 0;
      stick.setPosition(cx + Math.cos(a) * travel, cy + Math.sin(a) * travel);

      const thr = baseR * 0.25;
      this.input.setTouchHold('left',     dx < -thr);
      this.input.setTouchHold('right',    dx >  thr);
      this.input.setTouchHold('reelUp',   dy < -thr);
      this.input.setTouchHold('reelDown', dy >  thr);

      // Analog: normalize to [-1, 1] based on visual travel range.
      const normX = Math.max(-1, Math.min(1, dx / travelR));
      const normY = Math.max(-1, Math.min(1, dy / travelR));
      this.input.setJoyAnalog(normX, normY);
    };

    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (activeId !== null) return;
      if (Math.hypot(p.x - cx, p.y - cy) > baseR) return;
      activeId = p.id;
      base.setFillStyle(THEME.palette.accent, 0.28);
      move(p.x, p.y);
    });

    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== activeId) return;
      move(p.x, p.y);
    });

    this.scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== activeId) return;
      reset();
    });

    this.scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      if (p.id !== activeId) return;
      reset();
    });
  }

  // ── Mode toggle pill ───────────────────────────────────────────────────

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
