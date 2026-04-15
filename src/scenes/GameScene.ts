import * as Phaser from 'phaser';
import { GAME_W, GAME_H, TOWER_H, PHYSICS } from '../config';
import { THEME } from '../theme';
import { InputController } from '../systems/InputController';
import { TouchControls } from '../systems/TouchControls';
import { VisualFX } from '../systems/VisualFX';
import { AudioBus } from '../systems/AudioBus';
import { Player } from '../entities/Player';
import { Rope } from '../entities/Rope';

/**
 * GameScene — vertical tower arena (portrait 480 × 5000).
 *
 * ## Aim system (Worms-style, no mouse required)
 * A rotating aim arm extends from the player. A/D (or ◄/► on mobile) rotate
 * it. SPACE / fire button shoots. Mouse hover also updates the angle on desktop
 * for players who prefer it, but is never required.
 *
 * ## Slide punishment
 * Any hard contact with a surface while NOT swinging triggers a slide.
 * The player loses walk/jump control until they decelerate to ~0. The rope
 * can still be fired to recover — that's the intended escape.
 *
 * ## Platform layout (bottom → top)
 *   Zone 1  y 4200–4968  Start / tutorial
 *   Zone 2  y 3200–4200  Boiler Hall
 *   Zone 3  y 2200–3200  Gauge Shafts
 *   Zone 4  y 1200–2200  Ignition Chamber
 *   Zone 5  y    0–1200  Core
 */
export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private player!: Player;
  private rope!: Rope;
  private fx!: VisualFX;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private trajGuide!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private heightText!: Phaser.GameObjects.Text;
  private slideText!: Phaser.GameObjects.Text;

  // Angle-based aim (radians, screen coords where +y is down).
  // -π/2 = straight up. Updated by A/D input and optionally mouse.
  private aimAngle = -Math.PI / 2 + 0.3; // start slightly right of up

  // Tracks whether mouse has moved so desktop mouse can drive aim.
  private lastMouseX = -1;
  private lastMouseY = -1;

  constructor() {
    super('Game');
  }

  create(): void {
    const W = GAME_W;
    const H = TOWER_H;

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(THEME.palette.background);

    this.matter.world.setGravity(0, PHYSICS.gravityY);
    this.matter.world.setBounds(0, -200, W, H + 200);

    this.fx = new VisualFX(this);
    this.fx.paintPaperBackdrop(W, H);
    this.fx.paintMachineParallax(W, H);

    this.buildTower(W, H);
    this.paintTowerDecor(W, H);

    const spawnY = H - 100;
    this.player = new Player(this, W / 2, spawnY);
    this.rope = new Rope(this, this.player, this.fx);

    this.aimGuide = this.add.graphics().setDepth(4);
    this.trajGuide = this.add.graphics().setDepth(4);

    this.input2 = new InputController(this);
    new TouchControls(this, this.input2);

    // Camera: upward look-ahead so anchors above are visible.
    this.cameras.main.startFollow(this.player.gfx, true, 0.08, 0.08);
    this.cameras.main.setFollowOffset(0, GAME_H * 0.15);

    this.fx.paintBottomFog(GAME_W, GAME_H);

    // ── Collision: grounded detection (collisionactive) ───────────────────
    // Side walls (label: 'sidewall') do NOT count as grounded — only platforms.
    this.matter.world.on(
      'collisionactive',
      (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
        for (const pair of event.pairs) {
          const isBodyA = pair.bodyA === this.player.body;
          const isBodyB = pair.bodyB === this.player.body;
          if (!isBodyA && !isBodyB) continue;
          const other = isBodyA ? pair.bodyB : pair.bodyA;
          if (other.label === 'sidewall') continue; // wall contact ≠ grounded
          if (this.player.body.velocity.y >= -0.1) {
            const vyBefore = this.player.body.velocity.y;
            this.player.markGrounded(this.time.now);
            if (vyBefore > 6) this.fx.dustPuff(this.player.x, this.player.y + 14);
          }
        }
      },
    );

    // ── Collision: slide + wall rebound (collisionstart) ─────────────────
    // First contact with any surface while not swinging → slide if fast.
    // Wall hits also get an extra outward impulse so the player can't get stuck.
    this.matter.world.on(
      'collisionstart',
      (event: {
        pairs: Array<{
          bodyA: MatterJS.BodyType;
          bodyB: MatterJS.BodyType;
          collision: { normal: { x: number; y: number } };
        }>;
      }) => {
        for (const pair of event.pairs) {
          const isBodyA = pair.bodyA === this.player.body;
          const isBodyB = pair.bodyB === this.player.body;
          if (!isBodyA && !isBodyB) continue;
          if (this.rope.state === 'SWINGING') continue;

          const v = this.player.body.velocity;
          const speed = Math.hypot(v.x, v.y);
          this.player.triggerSlide(speed);

          // For wall hits: apply an extra outward impulse so the player
          // can't get wedged against the wall. The normal points bodyA→bodyB;
          // flip sign based on which body is the player to get "away from wall".
          const other = isBodyA ? pair.bodyB : pair.bodyA;
          if (other.label === 'sidewall' && speed >= PHYSICS.player.slideThreshold) {
            // normal points bodyA → bodyB; outward for player is the opposite
            const n = pair.collision?.normal ?? { x: 0, y: 0 };
            const outX = isBodyA ? -n.x : n.x;
            // Push the player away from the wall proportional to impact speed.
            this.player.kickFromWall(outX, speed);
          }
        }
      },
    );

    // HUD.
    this.hudText = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '11px', color: '#1b1c21' })
      .setScrollFactor(0).setDepth(200).setAlpha(0.6);

    this.heightText = this.add
      .text(W / 2, 14, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ff7a3d' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);

    // Slide indicator — flashes when player is sliding.
    this.slideText = this.add
      .text(W / 2, GAME_H / 2 - 60, 'SLIDING — fire rope to recover', {
        fontFamily: 'monospace', fontSize: '12px', color: '#cc3300',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0).setVisible(false);

    // Controls hint — fades after 12s.
    const hint = this.add
      .text(W / 2, GAME_H - 28,
        'A/D aim · SPACE fire/detach · W/S reel · ◄► mobile aim',
        { fontFamily: 'monospace', fontSize: '10px', color: '#1b1c21' })
      .setOrigin(0.5, 1).setAlpha(0.55).setScrollFactor(0).setDepth(200);
    this.tweens.add({ targets: hint, alpha: 0, duration: 900, delay: 12000, onComplete: () => hint.destroy() });

    // Start music on first touch.
    this.input.once('pointerdown', () => {
      AudioBus.startIfLoaded(this);
      AudioBus.duck(this, 0.6);
    });
  }

  // ── Tower geometry ────────────────────────────────────────────────────────

  private buildTower(W: number, H: number): void {
    // Platform thickness 24px — MUST be > PHYSICS.player.maxSpeed (15) to prevent tunneling.
    const T = 24;
    const half = T / 2;

    // Walkable horizontal surface: normal friction for landing.
    const slab = (x: number, y: number, w: number, h: number, color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, color, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0.4, restitution: 0, label: 'platform' });
      this.fx.paintBrushSlab(x, y, w, h, color, seed);
    };

    // Vertical side wall: zero friction so the player slides off (no sticking),
    // small restitution so Matter naturally bounces the player outward on impact.
    const sidewall = (x: number, y: number, w: number, h: number, color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, color, 0);
      this.matter.add.gameObject(r, {
        isStatic: true,
        friction: 0,
        frictionStatic: 0,
        restitution: 0.3,   // natural bounce: 30% of impact speed reflected outward
        label: 'sidewall',
      });
      this.fx.paintBrushSlab(x, y, w, h, color, seed);
    };

    // Side walls — full height, 32px thick.
    sidewall(16,     H / 2, 32, H, THEME.palette.stone, 101);
    sidewall(W - 16, H / 2, 32, H, THEME.palette.stone, 109);

    // Floor.
    slab(W / 2, H - half, W, T + 8, THEME.palette.stone, 201);

    // Ceiling / ignition socket.
    slab(W / 2, half, W, T + 8, THEME.palette.stone, 203);
    const glow = this.add.circle(W / 2, 32, 30, THEME.palette.ropeGlow, 0.3).setDepth(-5);
    this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.4 }, duration: 1300, yoyo: true, repeat: -1 });
    this.add.text(W / 2, 52, THEME.framing.finishLabel, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff7a3d',
    }).setOrigin(0.5, 0).setAlpha(0.9);

    // ── Zone 1: Start (y 4200–4968) ──────────────────────────────────────
    slab(W * 0.5,  4820, W * 0.55, T, THEME.palette.moss,  301);
    slab(W * 0.2,  4660, W * 0.30, T, THEME.palette.stone, 305);
    slab(W * 0.8,  4600, W * 0.25, T, THEME.palette.stone, 307);
    slab(W * 0.5,  4450, W * 0.40, T, THEME.palette.moss,  311);

    // ── Zone 2: Boiler Hall (y 3200–4200) ────────────────────────────────
    slab(W * 0.15, 4100, W * 0.22, T, THEME.palette.stone, 401);
    slab(W * 0.85, 4000, W * 0.22, T, THEME.palette.stone, 403);
    slab(W * 0.5,  3870, W * 0.35, T, THEME.palette.moss,  407);
    slab(W * 0.2,  3720, W * 0.28, T, THEME.palette.stone, 411);
    slab(W * 0.8,  3600, W * 0.28, T, THEME.palette.stone, 413);
    slab(W * 0.5,  3440, W * 0.35, T, THEME.palette.ice,   417);
    slab(W * 0.15, 3300, W * 0.22, T, THEME.palette.stone, 421);

    // ── Zone 3: Gauge Shafts (y 2200–3200) ───────────────────────────────
    slab(W * 0.5,  3150, W * 0.18, 200, THEME.palette.stone, 501);
    slab(W * 0.15, 3000, W * 0.22, T,   THEME.palette.moss,  505);
    slab(W * 0.85, 2870, W * 0.22, T,   THEME.palette.stone, 507);
    slab(W * 0.5,  2720, W * 0.30, T,   THEME.palette.stone, 511);
    slab(W * 0.15, 2580, W * 0.22, T,   THEME.palette.ice,   513);
    slab(W * 0.8,  2450, W * 0.28, T,   THEME.palette.stone, 517);
    slab(W * 0.4,  2300, W * 0.35, T,   THEME.palette.moss,  521);

    // ── Zone 4: Ignition Chamber (y 1200–2200) ────────────────────────────
    slab(W * 0.85, 2150, W * 0.22, T,   THEME.palette.stone, 601);
    slab(W * 0.15, 2000, W * 0.22, T,   THEME.palette.stone, 603);
    slab(W * 0.6,  1850, W * 0.25, T,   THEME.palette.ice,   607);
    slab(W * 0.5,  1700, W * 0.16, 150, THEME.palette.stone, 611);
    slab(W * 0.15, 1580, W * 0.22, T,   THEME.palette.moss,  615);
    slab(W * 0.85, 1450, W * 0.22, T,   THEME.palette.stone, 619);
    slab(W * 0.4,  1300, W * 0.28, T,   THEME.palette.stone, 623);

    // ── Zone 5: Core (y 0–1200) ───────────────────────────────────────────
    slab(W * 0.8,  1150, W * 0.30, T,   THEME.palette.stone, 701);
    slab(W * 0.2,  1000, W * 0.30, T,   THEME.palette.stone, 703);
    slab(W * 0.55, 860,  W * 0.22, T,   THEME.palette.moss,  707);
    slab(W * 0.5,  700,  W * 0.18, 140, THEME.palette.stone, 711);
    slab(W * 0.15, 580,  W * 0.22, T,   THEME.palette.stone, 715);
    slab(W * 0.85, 440,  W * 0.22, T,   THEME.palette.ice,   719);
    slab(W * 0.5,  300,  W * 0.35, T,   THEME.palette.moss,  723);
  }

  private paintTowerDecor(W: number, H: number): void {
    for (let y = 200; y < H; y += 320) {
      this.fx.paintRivetRow(W * 0.5, y, W - 48, 2000 + y);
    }
    this.fx.paintPipeRun(W * 0.2, 4660, W * 0.8, 4600, 3001);
    this.fx.paintPipeRun(W * 0.2, 3720, W * 0.8, 3600, 3003);
    this.fx.paintPipeRun(W * 0.2, 3000, W * 0.8, 2870, 3005);
    this.fx.paintPipeRun(W * 0.8, 2150, W * 0.2, 2000, 3007);
    this.fx.paintPipeRun(W * 0.8, 1450, W * 0.2, 1580, 3009);

    const dialY = [400, 800, 1100, 1600, 1900, 2400, 2700, 3100, 3500, 3900, 4300, 4700];
    dialY.forEach((y, i) => {
      this.fx.paintGaugeDial(i % 2 === 0 ? 44 : GAME_W - 44, y, 13 + (i % 3) * 2, 4000 + i);
    });
    this.fx.paintSteamVent(GAME_W * 0.25, 60, 5001);
    this.fx.paintSteamVent(GAME_W * 0.75, 60, 5003);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;

    this.input2.sample();
    const inp = this.input2.state;

    // ── Angle-based aim ───────────────────────────────────────────────────
    // Only update aim angle when IDLE. A/D (or ◄/► on mobile) rotate it.
    // Mouse overrides on desktop only when the pointer has actually moved.
    // aimAngle stays frozen while FIRING/SWINGING so it's sensible on detach.
    if (this.rope.state === 'IDLE') {
      if (inp.left)  this.aimAngle -= PHYSICS.aim.rotateSpeed * dt;
      if (inp.right) this.aimAngle += PHYSICS.aim.rotateSpeed * dt;

      // Optional mouse override — only when mouse has moved (desktop).
      if (!this.input2.isTouchDevice()) {
        const ptr = this.input.activePointer;
        if (ptr.worldX !== this.lastMouseX || ptr.worldY !== this.lastMouseY) {
          this.lastMouseX = ptr.worldX;
          this.lastMouseY = ptr.worldY;
          const dx = ptr.worldX - this.player.x;
          const dy = ptr.worldY - this.player.y;
          if (Math.hypot(dx, dy) > 20) this.aimAngle = Math.atan2(dy, dx);
        }
      }

      // Derive world aim target from angle.
      inp.aimX = this.player.x + Math.cos(this.aimAngle) * PHYSICS.rope.maxLength;
      inp.aimY = this.player.y + Math.sin(this.aimAngle) * PHYSICS.rope.maxLength;
    }

    // ── Fire / detach ─────────────────────────────────────────────────────
    // firePressed   → fires rope when IDLE (does NOT auto-detach when SWINGING)
    // detachPressed → detaches when SWINGING (SPACE, ▼, right-click)
    if (inp.firePressed && this.rope.state === 'IDLE') {
      this.rope.fireAt(inp.aimX, inp.aimY);
    }
    if (inp.detachPressed && this.rope.state === 'SWINGING') {
      this.rope.detach(true);
    }

    // ── Player update ─────────────────────────────────────────────────────
    // A/D while IDLE controls aim (already handled above); don't pass left/right
    // to player while IDLE so the arm rotation feels exclusive.
    // While SWINGING or grounded, pass normally.
    const playerInput = this.rope.state === 'IDLE'
      ? { ...inp, left: false, right: false }  // aim mode: no lateral force
      : inp;

    this.player.update(playerInput, this.rope.state === 'SWINGING');
    this.rope.update(dt, inp);

    // ── Aim guide ─────────────────────────────────────────────────────────
    this.aimGuide.clear();
    if (this.rope.state === 'IDLE') {
      this.fx.drawAimGuide(
        this.aimGuide,
        this.player.x,
        this.player.y,
        inp.aimX,
        inp.aimY,
        PHYSICS.rope.maxLength,
        false,
      );
    }

    // ── Trajectory preview while swinging ────────────────────────────────
    // Dots extrapolated from current velocity help the player intuit when
    // to release — like the trajectory arc in Worms.
    this.trajGuide.clear();
    if (this.rope.state === 'SWINGING') {
      const v = this.player.body.velocity;
      const g = PHYSICS.gravityY;
      this.trajGuide.fillStyle(THEME.palette.rope, 0.25);
      for (let i = 1; i <= 8; i++) {
        const t = i * 5; // frames ahead
        const px = this.player.x + v.x * t;
        const py = this.player.y + v.y * t + 0.5 * g * t * t * 0.016; // rough gravity
        const r = 3 - i * 0.25;
        if (r > 0.5) this.trajGuide.fillCircle(px, py, r);
      }
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    const metersLeft = Math.max(0, Math.round((this.player.y - 32) / 10));
    this.heightText.setText(metersLeft > 0 ? `${metersLeft} m` : 'CLIMB!');

    const sliding = this.player.isSliding();
    this.slideText.setVisible(sliding).setAlpha(sliding ? 0.9 : 0);

    this.hudText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}  rope ${this.rope.state}${sliding ? '  SLIDING' : ''}`,
    );

    this.input2.clearOneShots();
  }
}
