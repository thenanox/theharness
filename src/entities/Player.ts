import * as Phaser from 'phaser';
import { PHYSICS } from '../config';
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
    if (impactSpeed >= PHYSICS.player.slideThreshold) {
      this.sliding = true;
      this.scene.tweens.add({
        targets: this.gfx,
        fillColor: { from: 0xcc3300, to: this.currentPhosphorColor },
        duration: 280, ease: 'Cubic.easeOut',
      });
    }
  }

  kickFromWall(outwardNx: number, impactSpeed: number): void {
    const v = this.body.velocity;
    this.setVelocity(outwardNx * Math.max(2, impactSpeed * 0.35), v.y);
  }

  update(input: InputState, isSwinging: boolean): void {
    const v = this.body.velocity;

    if (this.sliding && Math.hypot(v.x, v.y) < 0.5) this.sliding = false;

    if (!this.sliding) {
      if (isSwinging) {
        const fx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (fx !== 0) this.applyForce(fx * PHYSICS.rope.swingPump, 0);
      }
      // Ground: no walking — rope is the only locomotion.
      // Airborne without rope: gravity only, no air control.
    }

    const speed = Math.hypot(v.x, v.y);
    if (speed > PHYSICS.player.maxSpeed) {
      const s = PHYSICS.player.maxSpeed / speed;
      this.setVelocity(v.x * s, v.y * s);
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
