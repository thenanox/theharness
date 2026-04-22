import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
import { TUNING } from '../tuning';
import { THEME } from '../theme';
import type { InputState } from '../systems/InputController';

type MatterBody = MatterJS.BodyType;

export class Player {
  readonly scene: Phaser.Scene;
  readonly gfx: Phaser.GameObjects.Rectangle;
  readonly body: MatterBody;
  readonly dressing: Phaser.GameObjects.Container;

  private beltRect:  Phaser.GameObjects.Rectangle;
  private headDot:   Phaser.GameObjects.Arc;
  private glowCircle: Phaser.GameObjects.Arc;

  private lastGroundedAt    = 0;
  private lastVyForLanding  = 0;
  private sliding           = false;
  private slideExpiresAt    = 0;
  private squashActive      = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Body drawn in phosphor color (filled, bright — stands out from wireframe world)
    this.gfx = scene.add.rectangle(x, y, 20, 28, THEME.palette.phosphorBase, 0.9);
    this.gfx.setDepth(10);
    scene.matter.add.gameObject(this.gfx, {
      mass: PHYSICS.player.mass,
      frictionAir: PHYSICS.player.frictionAir,
      friction: PHYSICS.player.friction,
      frictionStatic: 0,   // must be 0: Matter uses max(a,b) so any player frictionStatic wins over wall's 0 and creates Spiderman grip
      restitution: PHYSICS.player.restitution,
      inertia: Infinity,
      label: 'player',
    } as Phaser.Types.Physics.Matter.MatterBodyConfig);
    this.body = (this.gfx as unknown as { body: MatterBody }).body;

    // Additive glow behind body
    this.glowCircle = scene.add.circle(x, y, 16, THEME.palette.phosphorBase, 0.12);
    this.glowCircle.setDepth(9).setBlendMode(Phaser.BlendModes.ADD);

    // Dressing: ember belt stays warm always; head is hot-white
    this.beltRect = scene.add.rectangle(0, 4, 22, 3, THEME.palette.playerAccent);
    this.headDot  = scene.add.circle(0, -11, 4, 0xffffff, 0.9);
    this.dressing = scene.add.container(x, y, [this.beltRect, this.headDot]).setDepth(11);
  }

  get x(): number { return this.body.position.x; }
  get y(): number { return this.body.position.y; }
  get lastLandingVelocity(): number { return this.lastVyForLanding; }

  markGrounded(now: number): void {
    this.lastVyForLanding = this.body.velocity.y;
    this.lastGroundedAt   = now;
    if (!this.squashActive && this.lastVyForLanding > 2) {
      this.squashStretch(1.32, 0.72, 180);
    }
  }

  isGrounded(now: number): boolean { return now - this.lastGroundedAt < 110; }
  isSliding():  boolean            { return this.sliding; }

  private currentPhosphorColor: number = THEME.palette.phosphorBase;

  /** Called from zone system when the phosphor color changes. */
  setPhosphorColor(color: number): void {
    this.currentPhosphorColor = color;
    this.gfx.setFillStyle(color, 0.9);
    this.glowCircle.setFillStyle(color, 0.12);
  }

  /** Squash & stretch — tweens gfx + dressing simultaneously. */
  squashStretch(sx: number, sy: number, duration: number): void {
    this.squashActive = true;
    this.scene.tweens.add({
      targets: [this.gfx, this.dressing],
      scaleX: { from: sx, to: 1 },
      scaleY: { from: sy, to: 1 },
      duration,
      ease: 'Back.easeOut',
      onComplete: () => { this.squashActive = false; },
    });
  }

  triggerSlide(impactSpeed: number): void {
    if (this.sliding) return;
    if (impactSpeed >= TUNING.slideThreshold) {
      this.sliding = true;
      this.slideExpiresAt = this.scene.time.now + TUNING.slideMinDuration;

      this.scene.tweens.add({
        targets: this.gfx,
        fillColor: { from: 0xcc3300, to: this.currentPhosphorColor },
        duration: 280, ease: 'Cubic.easeOut',
      });
    }
  }

  /**
   * Billiard-style wall reflection: flip the horizontal component and preserve
   * vertical velocity so up-left → left wall → up-right works naturally.
   * Called from collisionstart (first contact frame).
   */
  reflectOffWall(outwardNx: number, restitution: number): void {
    const v = this.body.velocity;
    const outV = Math.max(1.5, Math.abs(v.x) * restitution);
    this.setVelocity(outwardNx * outV, v.y);
  }

  /** Sustained minimum push used in collisionactive when player lingers on a wall. */
  kickFromWall(outwardNx: number): void {
    const v = this.body.velocity;
    this.setVelocity(outwardNx * Math.max(4, Math.abs(v.x) * 0.6), v.y);
  }

  applyFloorFriction(): void {
    const vx = this.body.velocity.x;
    if (Math.abs(vx) > 0.05) this.setVelocity(vx * TUNING.floorFriction, this.body.velocity.y);
  }

  update(input: InputState, isSwinging: boolean): void {
    const now = this.scene.time.now;

    this.body.frictionAir = TUNING.frictionAir;

    if (this.sliding) {
      if (this.isGrounded(now)) this.applyFloorFriction();
      if (Math.hypot(this.body.velocity.x, this.body.velocity.y) < 0.5 && now >= this.slideExpiresAt) {
        this.sliding = false;
      }
    } else {
      if (!isSwinging && this.isGrounded(now)) this.applyFloorFriction();

      if (isSwinging && input.joyX !== 0) {
        this.applyForce(input.joyX * TUNING.swingPump, 0);
      }
    }

    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    if (speed > TUNING.maxSpeed) {
      const s = TUNING.maxSpeed / speed;
      this.setVelocity(this.body.velocity.x * s, this.body.velocity.y * s);
    }

    this.dressing.setPosition(this.x, this.y);
    this.glowCircle.setPosition(this.x, this.y);
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
