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

  private beltRect:   Phaser.GameObjects.Rectangle;
  private maskRect:   Phaser.GameObjects.Rectangle;   // dark hood band
  private eyeSlit:    Phaser.GameObjects.Rectangle;   // ember eye gap
  private shoulderL:  Phaser.GameObjects.Rectangle;
  private shoulderR:  Phaser.GameObjects.Rectangle;
  private katanaGfx:  Phaser.GameObjects.Graphics;    // back-mounted, outside container
  private bandanaGfx: Phaser.GameObjects.Graphics;    // trailing tails, velocity-driven
  private glowCircle: Phaser.GameObjects.Arc;

  private lastGroundedAt    = 0;
  private lastVyForLanding  = 0;
  private lastWallContactAt = 0;
  private sliding           = false;
  private slideExpiresAt    = 0;
  private squashActive      = false;
  private stunTumbleTween?: Phaser.Tweens.Tween;
  private stunPulseTween?:  Phaser.Tweens.Tween;

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

    // Katana strapped to the back (behind body, squashes with dressing via position sync)
    this.katanaGfx = scene.add.graphics().setDepth(9.5);

    // Dressing (front-facing ninja kit, container — rotates during stun tumble)
    // Order back→front: shoulder pads, hood mask, eye slit, ember sash
    this.shoulderL = scene.add.rectangle(-8, -10, 6, 4, THEME.palette.inkDeep, 0.95);
    this.shoulderR = scene.add.rectangle( 8, -10, 6, 4, THEME.palette.inkDeep, 0.95);
    this.maskRect  = scene.add.rectangle(0, -9,  18, 10, THEME.palette.inkDeep, 0.85);
    this.eyeSlit   = scene.add.rectangle(0, -9,  12, 1.5, THEME.palette.ember, 1);
    this.beltRect  = scene.add.rectangle(0,  4,  22, 3,  THEME.palette.playerAccent);
    this.dressing  = scene.add.container(x, y, [
      this.shoulderL, this.shoulderR, this.maskRect, this.eyeSlit, this.beltRect,
    ]).setDepth(11);

    // Bandana tails — separate gfx, drawn each frame based on velocity direction
    this.bandanaGfx = scene.add.graphics().setDepth(12);
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

  /** Called from scene collision handlers each frame the player touches a sidewall. */
  markWallContact(now: number): void {
    this.lastWallContactAt = now;
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

  /** Redraw the katana strapped to the back. Local to player position. */
  private drawKatana(x: number, y: number): void {
    this.katanaGfx.clear();
    // Scabbard — thin dark line from behind-left-shoulder to behind-right-hip
    const x1 = x - 9, y1 = y - 13;
    const x2 = x + 10, y2 = y + 10;
    this.katanaGfx.lineStyle(4, THEME.palette.inkDeep, 1);
    this.katanaGfx.lineBetween(x1, y1, x2, y2);
    // Ember-wrapped hilt tip peeking above shoulder
    this.katanaGfx.fillStyle(THEME.palette.ember, 0.9);
    this.katanaGfx.fillRect(x1 - 1.5, y1 - 2, 3, 4);
    // Silver guard
    this.katanaGfx.fillStyle(0xd8dade, 0.9);
    this.katanaGfx.fillRect(x1 - 3, y1 + 1, 6, 1);
  }

  /**
   * Bandana tails — two strips trailing opposite to velocity direction.
   * When stationary they hang down with a tiny sway.
   */
  private drawBandana(x: number, y: number, t: number): void {
    this.bandanaGfx.clear();
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const speed = Math.hypot(vx, vy);

    // Trail direction = opposite of velocity (clamped), plus gravity pull when slow
    let tx: number, ty: number;
    if (speed > 0.8) {
      tx = -vx / speed;
      ty = -vy / speed;
    } else {
      const sway = Math.sin(t * 0.004) * 0.15;
      tx = sway;
      ty = 1;
    }

    const anchorX = x + 7;           // right side of head, where bandana knot sits
    const anchorY = y - 10;
    const length = 10 + Math.min(14, speed * 2.2);
    const spread = 0.25;

    const color = THEME.palette.ember;
    for (let i = 0; i < 2; i++) {
      const ang = Math.atan2(ty, tx) + (i === 0 ? -spread : spread);
      const segs = 5;
      const endX = anchorX + Math.cos(ang) * length;
      const endY = anchorY + Math.sin(ang) * length;
      // Drooping curve — interpolate with a mild sag perpendicular to direction
      const sagPx = -Math.sin(ang - Math.PI / 2) * 3;
      const sagPy =  Math.cos(ang - Math.PI / 2) * 3;
      this.bandanaGfx.lineStyle(2, color, 0.85);
      for (let s = 0; s < segs; s++) {
        const t1 = s / segs, t2 = (s + 1) / segs;
        const u1 = 1 - t1, u2 = 1 - t2;
        // Quadratic: anchor → mid+sag → end
        const midX = (anchorX + endX) / 2 + sagPx;
        const midY = (anchorY + endY) / 2 + sagPy;
        const x1 = u1 * u1 * anchorX + 2 * u1 * t1 * midX + t1 * t1 * endX;
        const y1 = u1 * u1 * anchorY + 2 * u1 * t1 * midY + t1 * t1 * endY;
        const x2 = u2 * u2 * anchorX + 2 * u2 * t2 * midX + t2 * t2 * endX;
        const y2 = u2 * u2 * anchorY + 2 * u2 * t2 * midY + t2 * t2 * endY;
        this.bandanaGfx.lineBetween(x1, y1, x2, y2);
      }
    }
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

      // Tumble spin on dressing only — gfx is the physics body, must not rotate.
      const spinDir = this.body.velocity.x >= 0 ? 1 : -1;
      const spins = Math.min(3, 1 + impactSpeed / 3);
      this.stunTumbleTween?.stop();
      this.stunTumbleTween = this.scene.tweens.add({
        targets: this.dressing,
        rotation: { from: 0, to: spinDir * Math.PI * 2 * spins },
        duration: 300 + impactSpeed * 80,
        ease: 'Cubic.easeOut',
        onComplete: () => { this.dressing.setRotation(0); },
      });

      this.stunPulseTween?.stop();
      this.stunPulseTween = this.scene.tweens.add({
        targets: this.glowCircle,
        fillColor: { from: 0xff2200, to: this.currentPhosphorColor },
        alpha: { from: 0.35, to: 0.12 },
        duration: 320,
        yoyo: true,
        repeat: -1,
      });

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
      // Exit stun when: (a) min duration elapsed AND
      //   (b1) grounded and nearly stopped (landed cleanly), OR
      //   (b2) no longer in contact with a sidewall (peeled off → freefall or repositioned)
      // The original check "total speed < 0.12" locked the player in stun while
      // falling alongside a wall, because gravity kept vy high even with vx=0.
      if (now >= this.slideExpiresAt) {
        const vx = Math.abs(this.body.velocity.x);
        const vy = Math.abs(this.body.velocity.y);
        const grounded = this.isGrounded(now);
        const wallRecent = (now - this.lastWallContactAt) < 80;
        const landedStill = grounded && vx < 0.5 && vy < 0.5;
        const peeledOff   = !wallRecent && !grounded;
        if (landedStill || peeledOff) {
          this.sliding = false;
          this.stunTumbleTween?.stop();
          this.stunTumbleTween = undefined;
          this.stunPulseTween?.stop();
          this.stunPulseTween = undefined;
          this.glowCircle.setFillStyle(this.currentPhosphorColor, 0.12);
          this.dressing.setRotation(0);
        }
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
    this.drawKatana(this.x, this.y);
    this.drawBandana(this.x, this.y, this.scene.time.now);
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
