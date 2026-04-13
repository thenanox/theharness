import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { THEME } from '../theme';
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
 * The Worms Ninja Rope faithful-ish implementation.
 *
 * State flow:
 *   IDLE → FIRING → ATTACHED → SWINGING → DETACHED → IDLE
 *
 * Attach uses a Matter distance constraint between the player body and
 * the hit body. Length is mutated live on reel. Refire mid-air cleans
 * up the existing constraint before re-firing, never double-tethers.
 */
export class Rope {
  private scene: Phaser.Scene;
  private player: Player;
  private fx?: VisualFX;

  state: RopeState = 'IDLE';
  private length = 0;

  private constraint?: MatterConstraint;
  private anchorBody?: MatterBody;
  private anchorLocal?: { x: number; y: number };

  // Two Graphics objects so we can do a cheap two-pass glow:
  //   glowGfx = outer soft ember + mid ember (additive-ish via alpha)
  //   coreGfx = hot-white core line
  private glowGfx: Phaser.GameObjects.Graphics;
  private coreGfx: Phaser.GameObjects.Graphics;
  private hookGfx: Phaser.GameObjects.Arc;
  private fireTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, player: Player, fx?: VisualFX) {
    this.scene = scene;
    this.player = player;
    this.fx = fx;
    this.glowGfx = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.coreGfx = scene.add.graphics().setDepth(6);
    this.hookGfx = scene.add
      .circle(0, 0, 3, THEME.palette.ropeHook)
      .setStrokeStyle(1.5, THEME.palette.ropeGlow, 0.8)
      .setVisible(false)
      .setDepth(7);
  }

  isBusy(): boolean {
    return this.state !== 'IDLE' && this.state !== 'DETACHED';
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
      // Flash a miss line briefly so the player gets feedback.
      this.flashMiss(sx, sy, ex, ey);
      return;
    }

    this.state = 'FIRING';
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
    this.state = 'ATTACHED';

    // Ink splash on stick — only if VisualFX was wired in.
    this.fx?.inkSplash(hit.point.x, hit.point.y, 8);
    // Subtle haptic — mobile devices only, silently noop elsewhere.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(8);
    }

    this.anchorBody = hit.body;
    this.anchorLocal = {
      x: hit.point.x - hit.body.position.x,
      y: hit.point.y - hit.body.position.y,
    };

    const px = this.player.x;
    const py = this.player.y;
    this.length = Math.hypot(hit.point.x - px, hit.point.y - py);

    // Create Matter constraint. In Phaser 4 the factory is unchanged:
    //   matter.add.constraint(bodyA, bodyB, length, stiffness, options)
    this.constraint = this.scene.matter.add.constraint(
      this.player.body,
      hit.body,
      this.length,
      PHYSICS.rope.stiffness,
      {
        pointB: { ...this.anchorLocal },
        damping: PHYSICS.rope.damping,
        label: 'rope',
      } as Phaser.Types.Physics.Matter.MatterConstraintConfig,
    ) as unknown as MatterConstraint;

    this.state = 'SWINGING';
  }

  detach(withImpulse: boolean): void {
    if (this.fireTween?.isPlaying()) this.fireTween.stop();
    this.fireTween = undefined;

    if (this.constraint) {
      // Phaser 4 still routes through matter.world.remove for constraints.
      const world = (this.scene.matter.world as unknown as {
        remove: (c: MatterConstraint) => void;
      });
      world.remove(this.constraint);
      this.constraint = undefined;
    }

    if (withImpulse && this.state === 'SWINGING' && this.anchorBody && this.anchorLocal) {
      // Kick perpendicular to rope direction — preserves swing momentum.
      const ax = this.anchorBody.position.x + this.anchorLocal.x;
      const ay = this.anchorBody.position.y + this.anchorLocal.y;
      const dx = this.player.x - ax;
      const dy = this.player.y - ay;
      const d = Math.hypot(dx, dy) || 1;
      // Outward-along-rope nudge so you don't get yanked back.
      const kick = PHYSICS.rope.detachImpulse;
      this.applyForce((dx / d) * kick, (dy / d) * kick - kick * 0.5);

      // Ember flicker + haptic on release.
      this.fx?.emberFlicker(this.player.x, this.player.y);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(6);
      }
    }

    this.anchorBody = undefined;
    this.anchorLocal = undefined;
    this.hookGfx.setVisible(false);
    this.state = 'IDLE';
  }

  update(dtSeconds: number, input: InputState): void {
    if (this.state === 'SWINGING' && this.constraint && this.anchorBody && this.anchorLocal) {
      if (input.reelUp) {
        this.length = Math.max(PHYSICS.rope.minLength, this.length - PHYSICS.rope.reelSpeed * dtSeconds);
      }
      if (input.reelDown) {
        this.length = Math.min(PHYSICS.rope.maxLength, this.length + PHYSICS.rope.reelSpeed * dtSeconds);
      }
      // Mutate the constraint's length in place.
      (this.constraint as unknown as { length: number }).length = this.length;
    }

    this.draw();
  }

  private draw(): void {
    this.glowGfx.clear();
    this.coreGfx.clear();
    if (this.state === 'SWINGING' && this.anchorBody && this.anchorLocal) {
      const ax = this.anchorBody.position.x + this.anchorLocal.x;
      const ay = this.anchorBody.position.y + this.anchorLocal.y;
      if (this.fx) {
        this.fx.drawEmberRope(this.glowGfx, this.coreGfx, this.player.x, this.player.y, ax, ay);
      } else {
        this.coreGfx.lineStyle(2, THEME.palette.rope, 1);
        this.coreGfx.lineBetween(this.player.x, this.player.y, ax, ay);
      }
    } else if (this.state === 'FIRING') {
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
    g.lineStyle(1, THEME.palette.inkGhost, 0.35);
    g.lineBetween(sx, sy, ex, ey);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 160,
      onComplete: () => g.destroy(),
    });
  }

  /**
   * Stepped ray walk against Matter's point query. Good enough for M1
   * and robust against Phaser 4 Matter API shifts. Upgrade to
   * Matter.Query.ray later if we need pixel-perfect hit points.
   */
  private raycast(sx: number, sy: number, ex: number, ey: number): RayHit | null {
    const STEPS = 40;
    const dx = (ex - sx) / STEPS;
    const dy = (ey - sy) / STEPS;
    // start at i=2 so we don't immediately collide with the player body
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
