import * as Phaser from 'phaser';
import type { InputController } from './InputController';
import { THEME } from '../theme';

/**
 * On-screen touch controls — portrait layout.
 *
 * Layout (portrait 480×854):
 *   Bottom-left  : virtual joystick — ◄►  swing pump
 *                                   — ▲▼  reel in / reel out
 *
 * Fire/detach:
 *   Touch arena → aim guide appears, release fires. Quick tap snaps-fires.
 *   Touch while swinging → detach.
 *
 * The joystick zone is registered on InputController so arena-fire taps
 * are never triggered under the joystick area.
 */
export class TouchControls {
  private scene: Phaser.Scene;
  private input: InputController;
  private root: Phaser.GameObjects.Container;

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

    // ── Top-right: debug toggle (backtick equivalent) ────────────────────
    this.makeDebugButton(width - margin - 20, margin + 20);

    // ── Hint (fades after 8 s) ───────────────────────────────────────────
    const hint = scene.add
      .text(width / 2, joyY - joyR - 10, 'tap to fire · joystick to pump/reel', {
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

  // ── Debug toggle button (fires synthetic backtick keydown) ─────────────

  private makeDebugButton(cx: number, cy: number): void {
    const r = 18;
    // Register its bounds as a no-fire zone so tapping it doesn't launch the rope
    this.input.registerTouchZone(cx - r, cy - r, r * 2, r * 2);

    const ring = this.scene.add
      .circle(cx, cy, r, THEME.palette.inkDeep, 0.35)
      .setStrokeStyle(1.5, THEME.palette.accent, 0.7)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    const label = this.scene.add
      .text(cx, cy, 'DBG', { fontFamily: 'monospace', fontSize: '10px', color: '#ff7a3d' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    this.root.add([ring, label]);

    ring.on('pointerdown', () => {
      // Flash feedback
      ring.setFillStyle(THEME.palette.accent, 0.5);
      this.scene.time.delayedCall(100, () => ring.setFillStyle(THEME.palette.inkDeep, 0.35));
      // Both the TuningPanel and the GameScene debug-cam listen for `keydown` on window
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));
    });
  }

  // ── Virtual joystick ───────────────────────────────────────────────────

  private makeJoystick(cx: number, cy: number, baseR: number, stickR: number): void {
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

    const travelR = baseR * 0.65;

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
}
