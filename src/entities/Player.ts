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
 */
export class Player {
  readonly scene: Phaser.Scene;
  readonly gfx: Phaser.GameObjects.Rectangle;
  readonly body: MatterBody;

  private lastGroundedAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    this.gfx = scene.add.rectangle(x, y, 20, 28, THEME.palette.player);
    scene.matter.add.gameObject(this.gfx, {
      mass: PHYSICS.player.mass,
      frictionAir: PHYSICS.player.frictionAir,
      friction: PHYSICS.player.friction,
      frictionStatic: 0.1,
      restitution: PHYSICS.player.restitution,
      inertia: Infinity, // lock rotation — feels better for aim
      label: 'player',
    } as Phaser.Types.Physics.Matter.MatterBodyConfig);

    // After gameObject(), the rectangle has a .body we can grab.
    this.body = (this.gfx as unknown as { body: MatterBody }).body;
  }

  get x(): number {
    return this.body.position.x;
  }
  get y(): number {
    return this.body.position.y;
  }

  /** Called from the scene's `matter world collision` listener. */
  markGrounded(now: number): void {
    this.lastGroundedAt = now;
  }

  /** Coyote time — 80ms. */
  isGrounded(now: number): boolean {
    return now - this.lastGroundedAt < 80;
  }

  update(input: InputState, isSwinging: boolean): void {
    const now = this.scene.time.now;
    const grounded = this.isGrounded(now);

    // Horizontal control: stronger on ground, soft nudge in air.
    const walkVx = 3.2;
    const airAccel = 0.0008;
    if (grounded && !isSwinging) {
      if (input.left) this.setVelocity(-walkVx, this.body.velocity.y);
      else if (input.right) this.setVelocity(walkVx, this.body.velocity.y);
      else this.setVelocity(this.body.velocity.x * 0.6, this.body.velocity.y);
    } else {
      // Air / swing nudge — applies force without clobbering rope pendulum.
      const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (fx !== 0) {
        this.applyForce(fx * airAccel, 0);
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
  }

  private setVelocity(x: number, y: number): void {
    // Phaser 4 exposes the raw Matter.Body namespace as `matter.body`.
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
