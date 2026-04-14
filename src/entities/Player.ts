import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { THEME } from '../theme';
import type { InputState } from '../systems/InputController';

type MatterBody = MatterJS.BodyType;

/**
 * The climber. A single capsule-ish box body with rotation locked.
 *
 * Ground movement uses gradual acceleration (not instant velocity snap) so
 * it feels weighty rather than ice-skate-y.
 *
 * Swing control is a TINY pendulum pump (PHYSICS.rope.swingPump per step).
 * Gravity drives the swing; the player nudges it. This is the Worms feel.
 * Do NOT increase swingPump — it breaks the pendulum skill expression.
 */
export class Player {
  readonly scene: Phaser.Scene;
  readonly gfx: Phaser.GameObjects.Rectangle;
  readonly body: MatterBody;
  readonly dressing: Phaser.GameObjects.Container;

  private beltRect: Phaser.GameObjects.Rectangle;
  private headDot: Phaser.GameObjects.Arc;

  private lastGroundedAt = 0;
  private lastVyForLanding = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    this.gfx = scene.add.rectangle(x, y, 20, 28, THEME.palette.player);
    this.gfx.setDepth(10);
    scene.matter.add.gameObject(this.gfx, {
      mass: PHYSICS.player.mass,
      frictionAir: PHYSICS.player.frictionAir,
      friction: PHYSICS.player.friction,
      frictionStatic: 0.1,
      restitution: PHYSICS.player.restitution,
      inertia: Infinity,
      label: 'player',
    } as Phaser.Types.Physics.Matter.MatterBodyConfig);
    this.body = (this.gfx as unknown as { body: MatterBody }).body;

    this.beltRect = scene.add.rectangle(0, 4, 22, 3, THEME.palette.playerAccent).setDepth(11);
    this.headDot = scene.add.circle(0, -11, 4, THEME.palette.player).setDepth(11);
    this.dressing = scene.add.container(x, y, [this.beltRect, this.headDot]).setDepth(11);
  }

  get x(): number { return this.body.position.x; }
  get y(): number { return this.body.position.y; }

  get lastLandingVelocity(): number { return this.lastVyForLanding; }

  markGrounded(now: number): void {
    this.lastVyForLanding = this.body.velocity.y;
    this.lastGroundedAt = now;
  }

  /** Coyote time — 80 ms. */
  isGrounded(now: number): boolean {
    return now - this.lastGroundedAt < 80;
  }

  update(input: InputState, isSwinging: boolean): void {
    const now = this.scene.time.now;
    const grounded = this.isGrounded(now);

    if (grounded && !isSwinging) {
      // Ground movement: gradual acceleration toward target speed.
      // Feels weighty; avoids the instant-direction-flip that kills immersion.
      const targetVx = input.left ? -3.0 : input.right ? 3.0 : 0;
      const blendFactor = targetVx === 0 ? 0.55 : 0.25; // decel faster than accel
      const newVx = this.body.velocity.x + (targetVx - this.body.velocity.x) * blendFactor;
      this.setVelocity(newVx, this.body.velocity.y);
    } else if (isSwinging) {
      // Swing pump: a tiny horizontal impulse so the player can nudge the
      // pendulum arc. Gravity does the real work — this just gives agency.
      // PHYSICS.rope.swingPump is intentionally tiny (0.003). Do not raise.
      const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (fx !== 0) {
        this.applyForce(fx * PHYSICS.rope.swingPump, 0);
      }
    } else {
      // Free-fall (detached, not grounded): minimal air drift.
      // Weak enough that trajectory is mostly determined by detach momentum.
      const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (fx !== 0) {
        this.applyForce(fx * 0.0008, 0);
      }
    }

    // Jump — only when grounded and not on rope.
    if (input.jumpPressed && grounded && !isSwinging) {
      this.setVelocity(this.body.velocity.x, -8.5);
      this.lastGroundedAt = 0;
    }

    // Speed cap — prevents Matter tunneling through thin walls.
    // Cap is higher now (30) to let pendulum reach natural peak speed.
    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed > PHYSICS.player.maxSpeed) {
      const s = PHYSICS.player.maxSpeed / speed;
      this.setVelocity(v.x * s, v.y * s);
    }

    // Sync dressing container to physics body position.
    this.dressing.setPosition(this.x, this.y);
  }

  private setVelocity(x: number, y: number): void {
    (this.scene.matter as unknown as {
      body: { setVelocity: (b: MatterBody, v: { x: number; y: number }) => void };
    }).body.setVelocity(this.body, { x, y });
  }

  private applyForce(fx: number, fy: number): void {
    (this.scene.matter as unknown as {
      body: { applyForce: (b: MatterBody, p: { x: number; y: number }, f: { x: number; y: number }) => void };
    }).body.applyForce(this.body, this.body.position, { x: fx, y: fy });
  }
}
