import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { THEME } from '../theme';
import type { InputState } from '../systems/InputController';

type MatterBody = MatterJS.BodyType;

/**
 * The climber.
 *
 * ## Slide punishment (Worms / Jump King mechanic)
 * Any contact with a surface while NOT on the rope triggers a slide if the
 * player's speed exceeds PHYSICS.player.slideThreshold. While sliding:
 *   - Walk and jump input is ignored — the player has no control.
 *   - Physics (friction + gravity) decelerate them naturally.
 *   - The rope can still be fired — that's the only escape.
 *   - Once speed drops below 0.5 px/frame the slide ends automatically.
 *
 * This forces the player to stay on the rope. Ground contact without a rope
 * is an emergency; only re-firing the rope can save the run.
 *
 * ## Swing pump
 * A/D during SWINGING applies PHYSICS.rope.swingPump force — intentionally
 * tiny. Gravity drives the arc; the player only nudges it.
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

  // Slide state — true while the player has lost control from a hard impact.
  private sliding = false;

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

  /** True while player has lost control from a hard impact. */
  isSliding(): boolean {
    return this.sliding;
  }

  /**
   * Call from the collision handler (collisionstart) when the player hits a
   * surface without a rope. Triggers slide if impact speed is high enough.
   */
  triggerSlide(impactSpeed: number): void {
    if (impactSpeed >= PHYSICS.player.slideThreshold) {
      this.sliding = true;
      // Visual feedback: briefly tint the player body reddish.
      this.scene.tweens.add({
        targets: this.gfx,
        fillColor: { from: 0xcc3300, to: THEME.palette.player },
        duration: 400,
        ease: 'Cubic.easeOut',
      });
    }
  }

  /**
   * Apply a horizontal kick away from a side wall after an impact.
   * Ensures the player can't get wedged against the wall even if Matter's own
   * restitution isn't enough to separate them cleanly.
   *
   * @param outwardNx  +1 = kick right, -1 = kick left (away from wall)
   * @param impactSpeed  speed at moment of collision (used to scale the kick)
   */
  kickFromWall(outwardNx: number, impactSpeed: number): void {
    const v = this.body.velocity;
    // Set horizontal velocity to outward direction, scaled by impact.
    // Minimum kick of 2 ensures the player always separates, even at low speed.
    const kickVx = outwardNx * Math.max(2, impactSpeed * 0.35);
    this.setVelocity(kickVx, v.y);
  }

  update(input: InputState, isSwinging: boolean): void {
    const now = this.scene.time.now;
    const grounded = this.isGrounded(now);
    const v = this.body.velocity;

    // Slide exit: once the body slows below threshold the player regains control.
    if (this.sliding && Math.hypot(v.x, v.y) < 0.5) {
      this.sliding = false;
    }

    if (!this.sliding) {
      if (grounded && !isSwinging) {
        // Ground movement: gradual acceleration blend so it feels weighty.
        const targetVx = input.left ? -2.8 : input.right ? 2.8 : 0;
        const blend = targetVx === 0 ? 0.55 : 0.22;
        const newVx = v.x + (targetVx - v.x) * blend;
        this.setVelocity(newVx, v.y);
      } else if (isSwinging) {
        // Pendulum pump — tiny nudge, gravity does the real work.
        const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (fx !== 0) this.applyForce(fx * PHYSICS.rope.swingPump, 0);
      } else {
        // Free-fall: barely any air control. Trajectory comes from detach momentum.
        const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (fx !== 0) this.applyForce(fx * 0.0008, 0);
      }

      // Jump — only when grounded and not on rope.
      if (input.jumpPressed && grounded && !isSwinging) {
        this.setVelocity(v.x, -8.5);
        this.lastGroundedAt = 0;
      }
    }
    // While sliding: no walk/jump. Physics carries the player until stop.
    // (Rope firing is still allowed — handled by GameScene, not here.)

    // Speed cap — prevents Matter tunneling. maxSpeed < platform thickness (24px).
    const speed = Math.hypot(v.x, v.y);
    if (speed > PHYSICS.player.maxSpeed) {
      const s = PHYSICS.player.maxSpeed / speed;
      this.setVelocity(v.x * s, v.y * s);
    }

    // Sync dressing container to physics body.
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
