import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { THEME } from '../theme';
import { RopeStateMachine } from './RopeStateMachine';
import type { RopeState } from '../types';
import type { Player } from './Player';
import type { InputState } from '../systems/InputController';
import type { VisualFX } from '../systems/VisualFX';

type MatterBody = MatterJS.BodyType;
type MatterConstraint = MatterJS.ConstraintType;

interface RayHit {
  point: { x: number; y: number };
  body: MatterBody;
}

/**
 * Phaser adapter for the rope mechanic.
 *
 * State bookkeeping and math live in RopeStateMachine (pure, tested).
 * This class owns: raycasting, Matter constraint lifecycle, and Graphics.
 *
 * State flow:
 *   IDLE → FIRING → SWINGING → IDLE
 */
export class Rope {
  private scene: Phaser.Scene;
  private player: Player;
  private fx?: VisualFX;

  private sm: RopeStateMachine;

  private constraint?: MatterConstraint;

  private glowGfx: Phaser.GameObjects.Graphics;
  private coreGfx: Phaser.GameObjects.Graphics;
  private hookGfx: Phaser.GameObjects.Arc;
  private fireTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, player: Player, fx?: VisualFX) {
    this.scene = scene;
    this.player = player;
    this.fx = fx;

    this.sm = new RopeStateMachine(PHYSICS.rope);

    this.glowGfx = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.coreGfx = scene.add.graphics().setDepth(6);
    this.hookGfx = scene.add
      .circle(0, 0, 3, THEME.palette.ropeHook)
      .setStrokeStyle(1.5, THEME.palette.ropeGlow, 0.8)
      .setVisible(false)
      .setDepth(7);
  }

  get state(): RopeState {
    return this.sm.state;
  }

  isBusy(): boolean {
    return this.sm.state !== 'IDLE' && this.sm.state !== 'DETACHED';
  }

  fireAt(targetX: number, targetY: number): void {
    // Clean up any existing rope before starting a new one.
    this.detach(false);

    const sx = this.player.x;
    const sy = this.player.y;
    const dx = targetX - sx;
    const dy = targetY - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const ex = sx + nx * PHYSICS.rope.maxLength;
    const ey = sy + ny * PHYSICS.rope.maxLength;

    const hit = this.raycast(sx, sy, ex, ey);
    if (!hit) {
      this.flashMiss(sx, sy, ex, ey);
      return;
    }

    this.sm.startFire();
    this.hookGfx.setPosition(sx, sy).setVisible(true);
    this.fireTween?.stop();
    this.fireTween = this.scene.tweens.add({
      targets: this.hookGfx,
      x: hit.point.x,
      y: hit.point.y,
      duration: PHYSICS.rope.fireTravelMs,
      ease: 'Cubic.easeOut',
      onComplete: () => this.attach(hit),
    });
  }

  private attach(hit: RayHit): void {
    this.fx?.inkSplash(hit.point.x, hit.point.y, 8);
    this.fx?.emberBurst(hit.point.x, hit.point.y);
    this.player.squashStretch(0.82, 1.28, 120);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
    this.scene.events.emit('rope-attach');

    this.sm.attach(
      { x: this.player.x, y: this.player.y },
      hit.point,
      hit.body,
    );

    this.constraint = this.scene.matter.add.constraint(
      this.player.body,
      hit.body,
      this.sm.length,
      PHYSICS.rope.stiffness,
      {
        pointB: { ...this.sm.anchor!.localOffset },
        damping: PHYSICS.rope.damping,
        label: 'rope',
      } as Phaser.Types.Physics.Matter.MatterConstraintConfig,
    ) as unknown as MatterConstraint;
  }

  detach(withImpulse: boolean): void {
    if (this.fireTween?.isPlaying()) this.fireTween.stop();
    this.fireTween = undefined;

    if (this.constraint) {
      const world = (this.scene.matter.world as unknown as {
        remove: (c: MatterConstraint) => void;
      });
      world.remove(this.constraint);
      this.constraint = undefined;
    }

    if (withImpulse) {
      const impulse = this.sm.calcDetachImpulse({ x: this.player.x, y: this.player.y });
      if (impulse) {
        this.applyForce(impulse.x, impulse.y);
        this.fx?.emberFlicker(this.player.x, this.player.y);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(6);
        this.scene.events.emit('rope-detach');
      }
    }

    this.hookGfx.setVisible(false);
    this.sm.detach();
  }

  /**
   * Called from collisionactive when player touches a sidewall while SWINGING.
   * If the player is closer to the anchor than the constraint length, the rigid
   * constraint would push them INTO the wall — a deadlock. Relaxing the length
   * to the actual distance eliminates the push force so the wall bounce is free.
   */
  relaxConstraintToFit(): void {
    if (!this.constraint || this.sm.state !== 'SWINGING') return;
    const aw = this.sm.anchorWorld();
    if (!aw) return;
    const dist = Math.hypot(this.player.x - aw.x, this.player.y - aw.y);
    if (dist < this.sm.length) {
      this.sm.length = dist;
      (this.constraint as unknown as { length: number }).length = dist;
    }
  }

  update(dtSeconds: number, input: InputState): void {
    if (this.sm.state === 'SWINGING' && this.constraint) {
      const newLen = this.sm.reelLength(input.reelUp, input.reelDown, dtSeconds);
      // Mutate the constraint length in place — Matter reads it next step.
      (this.constraint as unknown as { length: number }).length = newLen;
    }

    this.draw();
  }

  private draw(): void {
    this.glowGfx.clear();
    this.coreGfx.clear();

    const aw = this.sm.anchorWorld();
    if (this.sm.state === 'SWINGING' && aw) {
      if (this.fx) {
        this.fx.drawEmberRope(this.glowGfx, this.coreGfx, this.player.x, this.player.y, aw.x, aw.y, this.sm.length);
      } else {
        this.coreGfx.lineStyle(2, THEME.palette.rope, 1);
        this.coreGfx.lineBetween(this.player.x, this.player.y, aw.x, aw.y);
      }
    } else if (this.sm.state === 'FIRING') {
      if (this.fx) {
        this.fx.drawEmberRope(
          this.glowGfx,
          this.coreGfx,
          this.player.x,
          this.player.y,
          this.hookGfx.x,
          this.hookGfx.y,
        );
      } else {
        this.coreGfx.lineStyle(2, THEME.palette.rope, 0.8);
        this.coreGfx.lineBetween(this.player.x, this.player.y, this.hookGfx.x, this.hookGfx.y);
      }
    }
  }

  private flashMiss(sx: number, sy: number, ex: number, ey: number): void {
    const g = this.scene.add.graphics().setDepth(5);
    g.lineStyle(1, THEME.palette.phosphorBase, 0.4);
    g.lineBetween(sx, sy, ex, ey);
    // Perpendicular tick marks at the endpoint (missed hook ricochet)
    const dx = ex - sx, dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len; // perpendicular
    g.lineStyle(1, THEME.palette.phosphorBase, 0.55);
    for (let i = -1; i <= 1; i++) {
      const ox = ex + px * i * 5, oy = ey + py * i * 5;
      g.lineBetween(ox - px * 6, oy - py * 6, ox + px * 6, oy + py * 6);
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  /**
   * Stepped ray walk against Matter's point query.
   * Robust against Phaser 4 Matter API shifts.
   */
  private raycast(sx: number, sy: number, ex: number, ey: number): RayHit | null {
    const STEPS = 40;
    const dx = (ex - sx) / STEPS;
    const dy = (ey - sy) / STEPS;
    for (let i = 2; i <= STEPS; i++) {
      const px = sx + dx * i;
      const py = sy + dy * i;
      const bodies = (this.scene.matter as unknown as {
        intersectPoint: (x: number, y: number) => MatterBody[];
      }).intersectPoint(px, py);
      for (const b of bodies) {
        if (b === this.player.body) continue;
        if (b.label === 'player') continue;
        return { point: { x: px, y: py }, body: b };
      }
    }
    return null;
  }

  private applyForce(fx: number, fy: number): void {
    (this.scene.matter as unknown as {
      body: { applyForce: (b: MatterBody, p: { x: number; y: number }, f: { x: number; y: number }) => void };
    }).body.applyForce(this.player.body, this.player.body.position, { x: fx, y: fy });
  }
}
