import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { TUNING } from '../tuning';
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
  /** Anchor body, or null when the ray was blocked by a non-anchorable surface (sidewall). */
  body: MatterBody | null;
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

    this.sm = new RopeStateMachine({
      get stiffness() { return PHYSICS.rope.stiffness; },
      get damping() { return PHYSICS.rope.damping; },
      get reelSpeed() { return TUNING.reelSpeed; },
      get maxLength() { return TUNING.maxLength; },
      get minLength() { return PHYSICS.rope.minLength; },
    });

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
    this.detach();

    const sx = this.player.x;
    const sy = this.player.y;
    const dx = targetX - sx;
    const dy = targetY - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    // Cable whip — heard the moment the hook leaves your hand.
    this.scene.events.emit('rope-fire');

    const nx = dx / dist;
    const ny = dy / dist;
    const ex = sx + nx * TUNING.maxLength;
    const ey = sy + ny * TUNING.maxLength;

    const hit = this.raycast(sx, sy, ex, ey);
    const tx = hit ? hit.point.x : ex;
    const ty = hit ? hit.point.y : ey;

    this.sm.startFire();
    this.hookGfx.setPosition(sx, sy).setVisible(true);
    this.fireTween?.stop();
    this.fireTween = this.scene.tweens.add({
      targets: this.hookGfx,
      x: tx,
      y: ty,
      duration: PHYSICS.rope.fireTravelMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // Only anchor if the ray landed on an anchorable body.
        // Sidewalls return a hit with body=null → treated as miss (ricochet at wall).
        if (hit && hit.body) {
          this.attach(hit as RayHit & { body: MatterBody });
        } else {
          this.flashRicochet(tx, ty, nx, ny);
          this.fireTween = this.scene.tweens.add({
            targets: this.hookGfx,
            x: this.player.x,
            y: this.player.y,
            duration: PHYSICS.rope.fireTravelMs * 0.7,
            ease: 'Cubic.easeIn',
            onComplete: () => {
              this.hookGfx.setVisible(false);
              this.sm.detach();
            },
          });
        }
      },
    });
  }

  private attach(hit: RayHit & { body: MatterBody }): void {
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

  detach(): void {
    if (this.fireTween?.isPlaying()) this.fireTween.stop();
    this.fireTween = undefined;

    const wasSwinging = this.sm.state === 'SWINGING';

    if (this.constraint) {
      const world = (this.scene.matter.world as unknown as {
        remove: (c: MatterConstraint) => void;
      });
      world.remove(this.constraint);
      this.constraint = undefined;
    }

    if (wasSwinging) {
      this.fx?.emberFlicker(this.player.x, this.player.y);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(6);
      this.scene.events.emit('rope-detach');
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
      // Scale reel speed by joystick deflection; keyboard always gives full speed (joyY = ±1).
      const reelScale = input.joyY !== 0 ? Math.abs(input.joyY) : 1;
      const prevLen = this.sm.length;
      let newLen = this.sm.reelLength(input.reelUp, input.reelDown, dtSeconds * reelScale);

      // Tunneling guard: a Matter constraint at stiffness 1 yanks the player
      // along the anchor line each step regardless of any platform sitting
      // between them. If the reel would shorten the rope past the first
      // obstacle on that line, clamp the length so the player stops *under*
      // the platform instead of being pulled through it.
      if (newLen < prevLen) {
        const aw = this.sm.anchorWorld();
        if (aw) {
          const safeMin = this.minSafeReelLength(aw);
          if (safeMin !== null && newLen < safeMin) {
            newLen = Math.max(prevLen, safeMin);
            this.sm.length = newLen;
          }
        }
      }

      // Mutate the constraint length in place — Matter reads it next step.
      (this.constraint as unknown as { length: number }).length = newLen;
    }

    this.draw();
  }

  /**
   * Lower bound for the constraint length so reeling in doesn't pull the
   * player through a solid platform between them and the anchor.
   *
   * Steps a ray from player → anchor; on the first hit that isn't the
   * player or the anchor body, returns:
   *   distance(anchor → hit) + PLAYER_HALF
   *
   * Returns null when the line of sight is clear (no clamp needed).
   */
  private minSafeReelLength(aw: { x: number; y: number }): number | null {
    const sx = this.player.x, sy = this.player.y;
    const ex = aw.x, ey = aw.y;
    const total = Math.hypot(ex - sx, ey - sy);
    if (total < 1) return null;

    const STEPS = 24;
    const dx = (ex - sx) / STEPS;
    const dy = (ey - sy) / STEPS;
    const anchorBody = this.sm.anchor?.body;
    const PLAYER_HALF = 14; // player half-height; ~half-width too (20×28 box)

    // Start a couple of steps out so the player's own body doesn't register.
    for (let i = 2; i <= STEPS - 1; i++) {
      const px = sx + dx * i;
      const py = sy + dy * i;
      const bodies = (this.scene.matter as unknown as {
        intersectPoint: (x: number, y: number) => MatterBody[];
      }).intersectPoint(px, py);
      for (const b of bodies) {
        if (b === this.player.body) continue;
        if (b.label === 'player') continue;
        // The anchor body itself is not an "obstacle" — the rope is allowed
        // to reel up to it.
        if (anchorBody && b === anchorBody) continue;
        const distAnchorToHit = Math.hypot(ex - px, ey - py);
        return distAnchorToHit + PLAYER_HALF;
      }
    }
    return null;
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

  private flashRicochet(ex: number, ey: number, nx: number, ny: number): void {
    const g = this.scene.add.graphics().setDepth(5);
    const px = -ny, py = nx;
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
        // Sidewalls stop the hook but do not anchor — forces genuine swinging.
        // The caller treats body=null as a miss (ricochet off the wall).
        if (b.label === 'sidewall') {
          return { point: { x: px, y: py }, body: null };
        }
        return { point: { x: px, y: py }, body: b };
      }
    }
    return null;
  }

}
