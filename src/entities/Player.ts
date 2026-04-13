import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { THEME } from '../theme';
import type { InputState } from '../systems/InputController';

// Matter body type — loosely typed from phaser's exports.
type MatterBody = MatterJS.BodyType;

/**
 * The climber. A single capsule-ish box body with rotation locked
 * (inertia: Infinity). Walks when grounded, nudges when airborne,
 * jumps on press. All swinging is done by the Rope via a constraint.
 *
 * Visually: a charcoal ink silhouette with a single ember accent line
 * (the harness belt) so the player reads against the cool-grey world.
 * The sprite is a Phaser.Container holding:
 *   - body rect (ink)
 *   - belt rect (ember)
 *   - head dot (ink)
 * Only the body rect participates in Matter physics.
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

    // Physics body — invisible shape, the physical truth.
    this.gfx = scene.add.rectangle(x, y, 20, 28, THEME.palette.player);
    this.gfx.setDepth(10);
    scene.matter.add.gameObject(this.gfx, {
      mass: PHYSICS.player.mass,
      frictionAir: PHYSICS.player.frictionAir,
      friction: PHYSICS.player.friction,
      frictionStatic: 0.1,
      restitution: PHYSICS.player.restitution,
      inertia: Infinity, // lock rotation — feels better for aim
      label: 'player',
    } as Phaser.Types.Physics.Matter.MatterBodyConfig);
    this.body = (this.gfx as unknown as { body: MatterBody }).body;

    // Dressing: ember belt + head dot. Drawn over the body rect.
    // Stored in a Container so we can follow the physics body each frame.
    this.beltRect = scene.add.rectangle(0, 4, 22, 3, THEME.palette.playerAccent).setDepth(11);
    this.headDot = scene.add.circle(0, -11, 4, THEME.palette.player).setDepth(11);
    this.dressing = scene.add.container(x, y, [this.beltRect, this.headDot]).setDepth(11);
  }

  get x(): number {
    return this.body.position.x;
  }
  get y(): number {
    return this.body.position.y;
  }

  /** How hard the player hit the ground on the most recent grounded frame. */
  get lastLandingVelocity(): number {
    return this.lastVyForLanding;
  }

  /** Called from the scene's `matter world collision` listener. */
  markGrounded(now: number): void {
    // Cache pre-landing vy so FX systems can decide on dust puffs.
    this.lastVyForLanding = this.body.velocity.y;
    this.lastGroundedAt = now;
  }

  /** Coyote time — 80ms. */
  isGrounded(now: number): boolean {
    return now - this.lastGroundedAt < 80;
  }

  update(input: InputState, isSwinging: boolean): void {
    const now = this.scene.time.now;
    const grounded = this.isGrounded(now);

    // Horizontal control: stronger on ground, swing pump on rope, soft drift in air.
    const walkVx = 3.2;
    if (grounded && !isSwinging) {
      if (input.left) this.setVelocity(-walkVx, this.body.velocity.y);
      else if (input.right) this.setVelocity(walkVx, this.body.velocity.y);
      else this.setVelocity(this.body.velocity.x * 0.6, this.body.velocity.y);
    } else {
      // Swinging: strong horizontal pump so A/D meaningfully adds pendulum
      // energy (the Worms "kick to swing higher" move). Free-fall air nudge
      // stays subtle so you can't just fly sideways without a rope.
      const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (fx !== 0) {
        const accel = isSwinging ? 0.006 : 0.0012;
        this.applyForce(fx * accel, 0);
      }
    }

    // Jump — only when grounded and not swinging.
    if (input.jumpPressed && grounded && !isSwinging) {
      this.setVelocity(this.body.velocity.x, -8.5);
      this.lastGroundedAt = 0;
    }

    // Safety cap to prevent tunneling through thin walls.
    const v = this.body.velocity;
    const vmax = PHYSICS.player.maxSpeed;
    const speed = Math.hypot(v.x, v.y);
    if (speed > vmax) {
      const s = vmax / speed;
      this.setVelocity(v.x * s, v.y * s);
    }

    // Sync the dressing container to the body's current position.
    this.dressing.setPosition(this.x, this.y);
  }

  private setVelocity(x: number, y: number): void {
    (this.scene.matter as unknown as { body: { setVelocity: (b: MatterBody, v: { x: number; y: number }) => void } }).body.setVelocity(this.body, { x, y });
  }

  private applyForce(fx: number, fy: number): void {
    (this.scene.matter as unknown as { body: { applyForce: (b: MatterBody, p: { x: number; y: number }, f: { x: number; y: number }) => void } }).body.applyForce(
      this.body,
      this.body.position,
      { x: fx, y: fy },
    );
  }
}
