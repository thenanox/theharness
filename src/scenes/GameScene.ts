import * as Phaser from 'phaser';
import { GAME_W, GAME_H, TOWER_H, PHYSICS } from '../config';
import { THEME } from '../theme';
import { InputController } from '../systems/InputController';
import { TouchControls } from '../systems/TouchControls';
import { VisualFX } from '../systems/VisualFX';
import { AudioBus } from '../systems/AudioBus';
import { Player } from '../entities/Player';
import { Rope } from '../entities/Rope';

const ZONES = [
  { name: 'Core',             maxY: 1200, phosphor: 0xfff5c0 },
  { name: 'Ignition Chamber', maxY: 2200, phosphor: 0xffb030 },
  { name: 'Gauge Shafts',     maxY: 3200, phosphor: 0xffe060 },
  { name: 'Boiler Hall',      maxY: 4200, phosphor: 0x9aff60 },
  { name: 'Start',            maxY: 5000, phosphor: 0x3aff6a },
] as const;

export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private player!: Player;
  private rope!: Rope;
  private fx!: VisualFX;

  private aimGuide!:   Phaser.GameObjects.Graphics;
  private trajGuide!:  Phaser.GameObjects.Graphics;
  private trailGfx!:   Phaser.GameObjects.Graphics;
  private haloGfx!:    Phaser.GameObjects.Graphics;
  private grainGfx!:   Phaser.GameObjects.Graphics;
  private vignetteGfx!: Phaser.GameObjects.Graphics;
  private barGfx!:     Phaser.GameObjects.Graphics;

  private hudText!:    Phaser.GameObjects.Text;
  private heightText!: Phaser.GameObjects.Text;

  // Platform graphics for zone tinting
  private platformGfxList: Phaser.GameObjects.Graphics[] = [];

  // Zone / phosphor state — typed as number so lerpColor can write to it
  private phosphorColor: number = ZONES[ZONES.length - 1].phosphor;
  private currentZoneName = 'Start';
  private phosphorTween?: Phaser.Tweens.Tween;

  // Trail ring buffer
  private trailPositions: { x: number; y: number }[] = [];

  // Ambient drift
  private ambientDrift!: ReturnType<VisualFX['createAmbientDrift']>;
  private driftAllEmber = false;

  // Ignition socket
  private ignitionSocket!: ReturnType<VisualFX['createIgnitionSocket']>;

  // Win state
  private winTriggered = false;

  private aimAngle = -Math.PI / 2 + 0.3;
  private lastMouseX = -1;
  private lastMouseY = -1;

  constructor() { super('Game'); }

  create(): void {
    const W = GAME_W, H = TOWER_H;

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(THEME.palette.screenBg);
    this.matter.world.setGravity(0, PHYSICS.gravityY);
    this.matter.world.setBounds(0, -200, W, H + 200);

    this.fx = new VisualFX(this);
    this.fx.paintScreenBackdrop(W, H);
    this.fx.paintMachineParallax(W, H);
    this.buildTower(W, H);
    this.paintTowerDecor(W, H);

    const spawnY = H - 42; // floor top (H-28) minus player half-height (14)
    this.player = new Player(this, W / 2, spawnY);
    this.rope   = new Rope(this, this.player, this.fx);

    // Rope events → camera shake + zoom
    this.events.on('rope-attach', () => {
      this.triggerShake(45, 0.003);
      this.tweens.add({
        targets: this.cameras.main, zoom: { from: 1.0, to: 1.04 },
        duration: 80, ease: 'Cubic.easeOut', yoyo: true, hold: 40,
      });
      // Hit-stop: brief physics freeze so the "thunk" registers viscerally.
      const engine = (this.matter.world as unknown as {
        engine: { timing: { timeScale: number } };
      }).engine;
      engine.timing.timeScale = 0;
      this.time.delayedCall(40, () => { engine.timing.timeScale = 1; });
    });
    this.events.on('rope-detach', () => { this.triggerShake(55, 0.0035); });

    this.aimGuide   = this.add.graphics().setDepth(4);
    this.trajGuide  = this.add.graphics().setDepth(4);
    this.trailGfx   = this.add.graphics().setDepth(9);
    this.haloGfx    = this.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.grainGfx   = this.add.graphics().setScrollFactor(0).setDepth(8999);
    this.vignetteGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.barGfx     = this.add.graphics().setScrollFactor(0).setDepth(195);

    this.input2 = new InputController(this);
    new TouchControls(this, this.input2);

    this.cameras.main.startFollow(this.player.gfx, true, 0.12, 0.12);
    this.cameras.main.setFollowOffset(0, GAME_H * 0.15);

    this.fx.paintScanlines(GAME_W, GAME_H);
    this.fx.paintBottomFog(GAME_W, GAME_H);

    this.ambientDrift  = this.fx.createAmbientDrift(GAME_W);
    this.ignitionSocket = this.fx.createIgnitionSocket(W / 2, 12);

    // Initial vignette
    this.fx.paintZoneVignette(this.vignetteGfx, GAME_W, GAME_H, this.phosphorColor, 1.0);

    // ── Collision: sustained contact ─────────────────────────────────────
    this.matter.world.on(
      'collisionactive',
      (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
        for (const pair of event.pairs) {
          const isA = pair.bodyA === this.player.body;
          const isB = pair.bodyB === this.player.body;
          if (!isA && !isB) continue;
          const other = isA ? pair.bodyB : pair.bodyA;

          if (other.label === 'sidewall') {
            // Relax rope constraint each frame so it never pushes player INTO wall.
            this.rope.relaxConstraintToFit();
            // Sustained outward kick — overcomes any residual rope tension.
            const wallX = (other as unknown as { position: { x: number } }).position.x;
            const nx = this.player.x > wallX ? 1 : -1;
            const vx = this.player.body.velocity.x;
            if (vx * nx <= 1.5) this.player.kickFromWall(nx, Math.abs(vx));
          } else {
            // Platform / floor — mark grounded.
            if (this.player.body.velocity.y >= -0.1) {
              const vy = this.player.body.velocity.y;
              this.player.markGrounded(this.time.now);
              if (vy > 6) {
                this.fx.dustPuff(this.player.x, this.player.y + 14);
                this.triggerShake(90, 0.006);
              }
            }
          }
        }
      },
    );

    // ── Collision: slide + wall rebound ──────────────────────────────────
    this.matter.world.on(
      'collisionstart',
      (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
        for (const pair of event.pairs) {
          const isA = pair.bodyA === this.player.body;
          const isB = pair.bodyB === this.player.body;
          if (!isA && !isB) continue;

          const other = isA ? pair.bodyB : pair.bodyA;
          const v     = this.player.body.velocity;
          const speed = Math.hypot(v.x, v.y);

          if (other.label === 'sidewall') {
            // Kick away from the wall using its center position — works at any
            // speed and regardless of rope state (prevents Spiderman pinning).
            const wallX = (other as unknown as { position: { x: number } }).position.x;
            const nx = this.player.x > wallX ? 1 : -1;
            this.player.kickFromWall(nx, speed);
            if (speed >= PHYSICS.player.slideThreshold) this.triggerShake(70, 0.004);
            // Slide punishment still applies when not on rope
            if (this.rope.state !== 'SWINGING') this.player.triggerSlide(speed);
          } else if (this.rope.state !== 'SWINGING') {
            // Platform/floor: slide only when not swinging
            this.player.triggerSlide(speed);
          }
        }
      },
    );

    // ── HUD ───────────────────────────────────────────────────────────────
    this.hudText = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '11px', color: '#3aff6a' })
      .setScrollFactor(0).setDepth(200).setAlpha(0.5);

    this.heightText = this.add
      .text(W / 2, 14, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ff7a3d' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);



    const hint = this.add
      .text(W / 2, GAME_H - 28, 'A/D aim · SPACE fire/detach · W/S reel · ◄► mobile aim',
        { fontFamily: 'monospace', fontSize: '10px', color: '#3aff6a' })
      .setOrigin(0.5, 1).setAlpha(0.45).setScrollFactor(0).setDepth(200);
    this.tweens.add({ targets: hint, alpha: 0, duration: 900, delay: 12000, onComplete: () => hint.destroy() });

    this.input.once('pointerdown', () => { AudioBus.startIfLoaded(this); AudioBus.duck(this, 0.6); });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private triggerShake(ms: number, intensity: number): void {
    this.cameras.main.shake(ms, intensity);
  }

  // ── Tower geometry ────────────────────────────────────────────────────────

  private buildTower(W: number, H: number): void {
    const T = 24, half = T / 2;

    const slab = (x: number, y: number, w: number, h: number, _color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, 0, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0, frictionStatic: 0, restitution: 0, label: 'platform' });
      const gfx = this.fx.paintPhosphorSlab(x, y, w, h, seed);
      this.platformGfxList.push(gfx);
    };

    const sidewall = (x: number, y: number, w: number, h: number, _color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, 0, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0, frictionStatic: 0, restitution: 0.3, label: 'sidewall' });
      const gfx = this.fx.paintPhosphorSlab(x, y, w, h, seed);
      this.platformGfxList.push(gfx);
    };

    sidewall(16,     H / 2, 32, H, THEME.palette.stone, 101);
    sidewall(W - 16, H / 2, 32, H, THEME.palette.stone, 109);
    slab(W / 2, H - half, W, T + 8, THEME.palette.stone, 201);

    slab(W / 2, half, W, T + 8, THEME.palette.stone, 203);
    const glow = this.add.circle(W / 2, 32, 30, THEME.palette.ropeGlow, 0.3).setDepth(-5);
    this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.4 }, duration: 1300, yoyo: true, repeat: -1 });
    this.add.text(W / 2, 52, THEME.framing.finishLabel, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff7a3d',
    }).setOrigin(0.5, 0).setAlpha(0.9);

    // ── ZONE: START (y ≈ 5000..4200) — warmup, generous ledges ──────────────
    // Teach: walk, aim, first rope fire. Falls are cheap here.
    slab(W * 0.32, 4850, W * 0.38, T, THEME.palette.moss,  301);
    slab(W * 0.78, 4760, W * 0.22, T, THEME.palette.stone, 305);
    slab(W * 0.45, 4660, W * 0.18, T, THEME.palette.stone, 309);
    slab(W * 0.18, 4540, W * 0.16, T, THEME.palette.moss,  313);
    // First overhead anchor — invite a rope fire to pass into Boiler Hall.
    slab(W * 0.70, 4380, W * 0.14, T, THEME.palette.stone, 317);
    slab(W * 0.28, 4260, W * 0.12, T, THEME.palette.stone, 321);

    // ── ZONE: BOILER HALL (y ≈ 4200..3200) — boiler pillars, zig-zag pinch ──
    // Signature: two thick vertical "boiler" pillars block straight-up rope
    // lines. The player MUST swing around them. Ledges are narrow and
    // alternate walls — a miss drops through several tiers.
    // First boiler pillar (left-of-center, mid-air hanging).
    slab(W * 0.38, 4080, W * 0.10, 190, THEME.palette.stone, 401);
    slab(W * 0.10, 4040, W * 0.12, T,   THEME.palette.stone, 405); // tight against left wall
    slab(W * 0.88, 3930, W * 0.12, T,   THEME.palette.stone, 409); // tight against right wall
    slab(W * 0.50, 3790, W * 0.08, T,   THEME.palette.moss,  413); // micro middle ledge
    // Second boiler pillar (right-of-center, offset).
    slab(W * 0.62, 3660, W * 0.10, 170, THEME.palette.stone, 417);
    slab(W * 0.18, 3600, W * 0.10, T,   THEME.palette.stone, 421); // force cross-swing left→right
    slab(W * 0.85, 3450, W * 0.10, T,   THEME.palette.ice,   425); // slick ice — don't overshoot
    slab(W * 0.35, 3340, W * 0.10, T,   THEME.palette.stone, 429);
    slab(W * 0.12, 3240, W * 0.10, T,   THEME.palette.moss,  433); // last ledge of zone, tiny

    // ── ZONE: GAUGE SHAFTS (y ≈ 3200..2200) — hair-thin gauge columns ───────
    // Signature: two tall thin vertical "gauge" columns act as the only
    // anchors. Landing ledges are bullseye-small. Reel-in precision required.
    slab(W * 0.25, 3100, W * 0.06, 240, THEME.palette.stone, 501); // left gauge column
    slab(W * 0.75, 3040, W * 0.06, 220, THEME.palette.stone, 505); // right gauge column (offset Y)
    slab(W * 0.50, 3020, W * 0.07, T,   THEME.palette.ice,   509); // thread-the-needle center
    slab(W * 0.12, 2870, W * 0.08, T,   THEME.palette.stone, 513); // tiny far-left
    slab(W * 0.88, 2740, W * 0.08, T,   THEME.palette.stone, 517); // tiny far-right
    slab(W * 0.50, 2600, W * 0.06, T,   THEME.palette.ice,   521); // BULLSEYE — 29px landing
    slab(W * 0.22, 2460, W * 0.09, T,   THEME.palette.stone, 525);
    slab(W * 0.78, 2340, W * 0.09, T,   THEME.palette.moss,  529);
    // Recovery ledge + needle anchor for Ignition entry.
    slab(W * 0.45, 2250, W * 0.16, T,   THEME.palette.stone, 533); // the only "safe" ledge
    slab(W * 0.50, 2130, W * 0.05, 130, THEME.palette.ice,   537); // needle anchor column

    // ── ZONE: IGNITION CHAMBER (y ≈ 2200..1200) — funnel & drop traps ───────
    // Signature: wall-mounted ceiling overhangs narrow the aim cone; anchors
    // are sparse; one "invite" ledge is a trap that fires you into a wall
    // bounce if over-swung. This is the zone designed to break the player.
    // Overhangs hang DOWN from ledges above — they block vertical rope lines.
    slab(W * 0.16, 2020, W * 0.30, T,   THEME.palette.stone, 601); // left overhang (wall-anchored)
    slab(W * 0.84, 1940, W * 0.30, T,   THEME.palette.stone, 605); // right overhang (wall-anchored)
    // The ONLY anchor in the funnel gap — commit or fall.
    slab(W * 0.50, 1800, W * 0.07, T,   THEME.palette.ice,   609);
    // TRAP: wide moss ledge hugs the left wall — overshoot = sidewall bounce.
    slab(W * 0.17, 1670, W * 0.22, T,   THEME.palette.moss,  613);
    // Sparse far-right pocket — hard pendulum target.
    slab(W * 0.86, 1540, W * 0.10, T,   THEME.palette.stone, 617);
    // Lone mid-air anchor column (tiny) — must detach at apex precisely.
    slab(W * 0.48, 1430, W * 0.05, 90,  THEME.palette.ice,   621);
    // Pinch overhang — drops ceiling low again.
    slab(W * 0.30, 1340, W * 0.24, T,   THEME.palette.stone, 625);
    // Final Ignition Chamber ledge — tight, on the right.
    slab(W * 0.80, 1240, W * 0.12, T,   THEME.palette.stone, 629);

    // ── ZONE: CORE (y ≈ 1200..32) — ceiling-anchor gauntlet ─────────────────
    // Signature: almost no floor platforms. Climb via ceiling-only anchors.
    // One miss here = fall all the way back down through Ignition Chamber.
    slab(W * 0.50, 1140, W * 0.05, 100, THEME.palette.stone, 701); // central hang column
    slab(W * 0.15, 1050, W * 0.10, T,   THEME.palette.moss,  705);
    slab(W * 0.86, 950,  W * 0.10, T,   THEME.palette.stone, 709);
    slab(W * 0.50, 850,  W * 0.05, 80,  THEME.palette.ice,   713); // needle anchor
    slab(W * 0.22, 730,  W * 0.08, T,   THEME.palette.stone, 717);
    slab(W * 0.80, 620,  W * 0.08, T,   THEME.palette.stone, 721);
    // Final ceiling overhangs just below the ignition socket.
    slab(W * 0.28, 470, W * 0.22, T,    THEME.palette.stone, 725);
    slab(W * 0.72, 380, W * 0.22, T,    THEME.palette.stone, 729);
    slab(W * 0.50, 250, W * 0.08, T,    THEME.palette.moss,  733);
    // Last precision catch before ignition — 29px wide, centered.
    slab(W * 0.50, 130, W * 0.06, T,    THEME.palette.ice,   737);
  }

  private paintTowerDecor(W: number, H: number): void {
    for (let y = 200; y < H; y += 320) this.fx.paintRivetRow(W * 0.5, y, W - 48, 2000 + y);
    // Pipe runs trace the zone transitions, linking the new pillar positions.
    this.fx.paintPipeRun(W * 0.1, 4540, W * 0.78, 4380, 3001); // Start → Boiler
    this.fx.paintPipeRun(W * 0.1, 4040, W * 0.88, 3930, 3003); // Boiler zig-zag
    this.fx.paintPipeRun(W * 0.18, 3600, W * 0.85, 3450, 3005); // Boiler upper
    this.fx.paintPipeRun(W * 0.25, 3100, W * 0.75, 3040, 3007); // Gauge columns bridge
    this.fx.paintPipeRun(W * 0.22, 2460, W * 0.78, 2340, 3009); // Gauge upper
    this.fx.paintPipeRun(W * 0.16, 2020, W * 0.84, 1940, 3011); // Ignition overhangs
    this.fx.paintPipeRun(W * 0.30, 1340, W * 0.80, 1240, 3013); // Ignition top pinch

    const dialY = [400, 800, 1100, 1600, 1900, 2400, 2700, 3100, 3500, 3900, 4300, 4700];
    dialY.forEach((y, i) => {
      this.fx.paintGaugeDial(i % 2 === 0 ? 44 : GAME_W - 44, y, 13 + (i % 3) * 2, 4000 + i);
    });
    this.fx.paintSteamVent(GAME_W * 0.25, 60, 5001);
    this.fx.paintSteamVent(GAME_W * 0.75, 60, 5003);
  }

  // ── Zone transition ───────────────────────────────────────────────────────

  private updateZone(playerY: number): void {
    const zone = [...ZONES].find(z => playerY <= z.maxY) ?? ZONES[ZONES.length - 1];
    if (zone.name === this.currentZoneName) return;
    this.currentZoneName = zone.name;
    const targetColor = zone.phosphor;

    // Tween phosphor color
    if (this.phosphorTween) this.phosphorTween.stop();
    const startColor = this.phosphorColor;
    const obj = { t: 0 };
    this.phosphorTween = this.tweens.add({
      targets: obj, t: 1, duration: 800, ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.phosphorColor = this.fx.lerpColor(startColor, targetColor, obj.t);
        this.player.setPhosphorColor(this.phosphorColor);
      },
      onComplete: () => { this.phosphorColor = targetColor; },
    });

    // Redraw vignette
    const intensity = zone.name === 'Start' ? 0.5
      : zone.name === 'Boiler Hall' ? 1.0
      : zone.name === 'Gauge Shafts' ? 0.8
      : zone.name === 'Ignition Chamber' ? 1.2
      : 0.6; // Core
    this.fx.paintZoneVignette(this.vignetteGfx, GAME_W, GAME_H, targetColor, intensity);
  }

  // ── Win sequence ──────────────────────────────────────────────────────────

  private playWinSequence(): void {
    this.winTriggered = true;
    this.cameras.main.shake(300, 0.012);
    this.cameras.main.flash(120, 255, 180, 80);

    this.time.delayedCall(120, () => {
      this.cameras.main.zoomTo(1.08, 400, 'Sine.easeOut');
      for (let i = 0; i < 3; i++) {
        this.time.delayedCall(i * 80, () => this.fx.emberBurst(this.player.x, this.player.y));
      }
      this.fx.playWinColorReveal(GAME_W, GAME_H);
    });

    this.time.delayedCall(300, () => { this.driftAllEmber = true; });

    this.time.delayedCall(800, () => {
      this.fx.steamPuff(GAME_W * 0.25, 60);
      this.fx.steamPuff(GAME_W * 0.75, 60);
    });

    this.time.delayedCall(1800, () => {
      const banner = this.add.text(GAME_W / 2, GAME_H / 2 - 30, THEME.labels.winBanner, {
        fontFamily: 'ui-serif, Georgia, serif', fontSize: '42px', color: '#ff7a3d',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(9998).setAlpha(0);
      this.tweens.add({ targets: banner, alpha: 1, duration: 600, ease: 'Sine.easeOut' });
    });

    this.time.delayedCall(2000, () => { this.cameras.main.zoomTo(1.0, 600); });
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;

    this.input2.sample();
    const inp = this.input2.state;

    // Zone update
    this.updateZone(this.player.y);

    // Win check
    if (this.player.y <= 32 && !this.winTriggered) this.playWinSequence();

    // ── Aim ───────────────────────────────────────────────────────────────
    if (this.rope.state === 'IDLE') {
      const grounded = this.player.isGrounded(this.time.now);
      const sliding  = this.player.isSliding();

      if (!sliding) {
        if (grounded) {
          // Grounded: left/right rotates the aim arm. No walking — rope is the only locomotion.
          if (inp.left)  this.aimAngle -= PHYSICS.aim.rotateSpeed * dt;
          if (inp.right) this.aimAngle += PHYSICS.aim.rotateSpeed * dt;
          if (!this.input2.isTouchDevice()) {
            const ptr = this.input.activePointer;
            if (ptr.worldX !== this.lastMouseX || ptr.worldY !== this.lastMouseY) {
              this.lastMouseX = ptr.worldX; this.lastMouseY = ptr.worldY;
              const dx = ptr.worldX - this.player.x, dy = ptr.worldY - this.player.y;
              if (Math.hypot(dx, dy) > 20) this.aimAngle = Math.atan2(dy, dx);
            }
          }
        } else {
          // Airborne without rope: aim auto-tracks velocity — 45° upward in
          // direction of travel (Worms behavior). Player cannot steer the aim.
          const vx = this.player.body.velocity.x;
          if (Math.abs(vx) > 0.3) {
            this.aimAngle = vx > 0 ? -Math.PI / 4 : -(3 * Math.PI) / 4;
          } else {
            this.aimAngle = -Math.PI / 2; // barely horizontal → straight up
          }
        }
      }
      // Sliding: aimAngle frozen, firePressed blocked below — all controls locked.

      inp.aimX = this.player.x + Math.cos(this.aimAngle) * PHYSICS.rope.maxLength;
      inp.aimY = this.player.y + Math.sin(this.aimAngle) * PHYSICS.rope.maxLength;
    }

    if (inp.firePressed   && this.rope.state === 'IDLE' && !this.player.isSliding()) this.rope.fireAt(inp.aimX, inp.aimY);
    if (inp.detachPressed && this.rope.state === 'SWINGING') this.rope.detach(true);

    const playerInput = this.rope.state === 'SWINGING'
      ? inp : { ...inp, left: false, right: false };
    this.player.update(playerInput, this.rope.state === 'SWINGING');
    this.rope.update(dt, inp);

    // ── Phosphor trail ────────────────────────────────────────────────────
    if (this.rope.state === 'SWINGING') {
      const spd = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y);
      if (spd > 3) {
        this.trailPositions.unshift({ x: this.player.x, y: this.player.y });
        if (this.trailPositions.length > 8) this.trailPositions.pop();
      }
    } else {
      this.trailPositions.length = 0;
    }
    this.fx.drawPhosphorTrail(this.trailGfx, this.trailPositions, this.phosphorColor);

    // ── Swing halo ────────────────────────────────────────────────────────
    this.haloGfx.clear();
    if (this.rope.state === 'SWINGING') {
      const spd = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y);
      const r = 20 + spd * 1.8;
      const a = Math.min(0.18, spd * 0.012);
      this.haloGfx.fillStyle(THEME.palette.ember, a);
      this.haloGfx.fillCircle(this.player.x, this.player.y, r);
      this.haloGfx.fillStyle(THEME.palette.ropeGlow, a * 0.5);
      this.haloGfx.fillCircle(this.player.x, this.player.y, r * 1.6);
    }

    // ── Aim guide ─────────────────────────────────────────────────────────
    this.aimGuide.clear();
    if (this.rope.state === 'IDLE' && !this.player.isSliding()) {
      this.fx.drawAimGuide(this.aimGuide, this.player.x, this.player.y, inp.aimX, inp.aimY, PHYSICS.rope.maxLength, false);
    }

    // ── Trajectory preview ────────────────────────────────────────────────
    this.trajGuide.clear();
    if (this.rope.state === 'SWINGING') {
      const v = this.player.body.velocity, g = PHYSICS.gravityY;
      this.trajGuide.fillStyle(THEME.palette.rope, 0.25);
      for (let i = 1; i <= 8; i++) {
        const t = i * 5;
        const r = 3 - i * 0.25;
        if (r > 0.5) this.trajGuide.fillCircle(
          this.player.x + v.x * t,
          this.player.y + v.y * t + 0.5 * g * t * t * 0.016, r,
        );
      }
    }

    // ── Grain ─────────────────────────────────────────────────────────────
    this.fx.paintGrain(this.grainGfx, GAME_W, GAME_H, this.phosphorColor);

    // ── Ambient drift ─────────────────────────────────────────────────────
    this.ambientDrift.update(this.player.y, dt, this.phosphorColor, this.driftAllEmber);

    // ── Ignition socket ───────────────────────────────────────────────────
    this.ignitionSocket.update(this.time.now / 1000);

    // ── Progress bar ──────────────────────────────────────────────────────
    const progress = 1 - Math.max(0, this.player.y - 32) / (TOWER_H - 32);
    this.fx.drawProgressBar(this.barGfx, progress, GAME_H, this.phosphorColor, this.currentZoneName);

    // ── HUD ───────────────────────────────────────────────────────────────
    const metersLeft = Math.max(0, Math.round((this.player.y - 32) / 10));
    this.heightText.setText(metersLeft > 0 ? `${metersLeft} m` : 'CLIMB!');
    this.heightText.setColor(this.phosphorColor > 0x888800 ? '#ff7a3d' : `#${this.phosphorColor.toString(16).padStart(6, '0')}`);

    this.hudText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}  rope ${this.rope.state}${this.player.isSliding() ? '  SLIDING' : ''}`,
    );

    this.input2.clearOneShots();
  }
}
