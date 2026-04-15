/**
 * RopeStateMachine — pure state machine for the Worms-style ninja rope.
 *
 * Zero Phaser / Matter dependencies. All physics integration (constraint
 * creation, raycasting, Graphics drawing) lives in Rope.ts, which uses
 * this class for state bookkeeping and math.
 *
 * Fully covered by tests/rope.test.ts. Add a test before changing invariants.
 *
 * State flow:
 *   IDLE → FIRING → SWINGING → IDLE
 *   Any state → IDLE via detach()
 *   SWINGING → FIRING via refire() (old constraint cleaned by Rope.ts first)
 */

import type { RopeState } from '../types';

export interface RopeConfig {
  stiffness: number;
  damping: number;
  reelSpeed: number;   // px/s
  maxLength: number;   // px
  minLength: number;   // px
  detachImpulse: number;
}

/** A body with a world position — minimal interface so tests can use plain objects. */
export interface PhysicsBody {
  position: { x: number; y: number };
}

export interface AnchorPoint {
  body: PhysicsBody;
  /** Hit point expressed in body's LOCAL space. */
  localOffset: { x: number; y: number };
}

export interface Vec2 {
  x: number;
  y: number;
}

export class RopeStateMachine {
  private readonly cfg: RopeConfig;

  state: RopeState = 'IDLE';
  /** Current rope length (px). Only meaningful in SWINGING state. */
  length = 0;
  /** The anchor the rope is attached to. Null when not SWINGING. */
  anchor: AnchorPoint | null = null;

  constructor(cfg: RopeConfig) {
    this.cfg = cfg;
  }

  // ─── State transitions ──────────────────────────────────────────────────

  /** Call when the hook is fired. Rope.ts handles the actual tween + raycast. */
  startFire(): void {
    this.state = 'FIRING';
  }

  /**
   * Called by Rope.ts once the hook tween completes and the constraint is
   * created. Records the attachment so math helpers work.
   */
  attach(playerPos: Vec2, hitPoint: Vec2, hitBody: PhysicsBody): void {
    this.anchor = {
      body: hitBody,
      localOffset: {
        x: hitPoint.x - hitBody.position.x,
        y: hitPoint.y - hitBody.position.y,
      },
    };
    this.length = Math.hypot(hitPoint.x - playerPos.x, hitPoint.y - playerPos.y);
    this.state = 'SWINGING';
  }

  /**
   * Clears state. Rope.ts removes the Matter constraint before calling this.
   */
  detach(): void {
    this.anchor = null;
    this.state = 'IDLE';
  }

  // ─── Per-frame math ─────────────────────────────────────────────────────

  /**
   * Compute updated rope length based on reel input.
   * Mutates `this.length` and returns it for convenient use.
   * No-op when not SWINGING.
   */
  reelLength(reelUp: boolean, reelDown: boolean, dtSeconds: number): number {
    if (this.state !== 'SWINGING') return this.length;

    if (reelUp) {
      this.length = Math.max(this.cfg.minLength, this.length - this.cfg.reelSpeed * dtSeconds);
    }
    if (reelDown) {
      this.length = Math.min(this.cfg.maxLength, this.length + this.cfg.reelSpeed * dtSeconds);
    }
    return this.length;
  }

  /**
   * World position of the anchor point.
   * Returns null when not SWINGING (no anchor set).
   */
  anchorWorld(): Vec2 | null {
    if (!this.anchor) return null;
    return {
      x: this.anchor.body.position.x + this.anchor.localOffset.x,
      y: this.anchor.body.position.y + this.anchor.localOffset.y,
    };
  }

  /**
   * Calculate the detach impulse force vector.
   *
   * Direction: away from anchor along the rope direction, with an upward bias
   * so releasing at the top of a swing arc flings the player upward.
   *
   * Returns null when not in SWINGING state (caller should not apply force).
   */
  calcDetachImpulse(playerPos: Vec2): Vec2 | null {
    if (this.state !== 'SWINGING') return null;
    const aw = this.anchorWorld();
    if (!aw) return null;

    const dx = playerPos.x - aw.x;
    const dy = playerPos.y - aw.y;
    const d = Math.hypot(dx, dy) || 1;

    const k = this.cfg.detachImpulse;
    return {
      x: (dx / d) * k,
      // Outward radial component minus an upward kick so apex releases go up.
      y: (dy / d) * k - k * 0.5,
    };
  }
}
