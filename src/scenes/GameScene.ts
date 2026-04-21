import * as Phaser from 'phaser';
import { GAME_W, GAME_H, WORLD_W, TOWER_H } from '../config';
import { TUNING } from '../tuning';
import { THEME } from '../theme';
import { InputController } from '../systems/InputController';
import { TouchControls } from '../systems/TouchControls';
import { TuningPanel } from '../systems/TuningPanel';
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
    const W = WORLD_W, H = TOWER_H;

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setZoom(GAME_W / WORLD_W);
    this.cameras.main.setBackgroundColor(THEME.palette.screenBg);
    this.matter.world.setGravity(0, TUNING.gravityY);
    new TuningPanel();
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
    this.cameras.main.setFollowOffset(0, GAME_H * 0.22);

    this.fx.paintScanlines(GAME_W, GAME_H);
    this.fx.paintBottomFog(GAME_W, GAME_H);

    this.ambientDrift  = this.fx.createAmbientDrift(WORLD_W);
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
            if (vx * nx <= 1.5) this.player.kickFromWall(nx);
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
            const wallX = (other as unknown as { position: { x: number } }).position.x;
            const nx = this.player.x > wallX ? 1 : -1;
            // Relax constraint so it doesn't fight the bounce on first contact.
            this.rope.relaxConstraintToFit();
            // Billiard reflection: flip vx, preserve vy (up-left → up-right).
            this.player.reflectOffWall(nx, 0.75);
            if (speed >= TUNING.slideThreshold) this.triggerShake(70, 0.004);
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
      .text(GAME_W / 2, 14, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ff7a3d' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);



    const hint = this.add
      .text(GAME_W / 2, GAME_H - 28, 'A/D aim · SPACE fire/detach · W/S reel · ◄► mobile aim',
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
    const T = 24;

    const slab = (x: number, y: number, w: number, h: number, _color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, 0, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0, frictionStatic: 0, restitution: 0, label: 'platform' });
      const gfx = this.fx.paintPhosphorSlab(x, y, w, h, seed);
      this.platformGfxList.push(gfx);
    };

    const sidewall = (x: number, y: number, w: number, h: number, _color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, 0, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0, frictionStatic: 0, restitution: 0, label: 'sidewall' });
      const gfx = this.fx.paintPhosphorSlab(x, y, w, h, seed);
      this.platformGfxList.push(gfx);
    };

    // ── Walls, floor, ceiling ───────────────────────────────────────────────
    sidewall(16,     H / 2, 32, H, THEME.palette.stone, 101);
    sidewall(W - 16, H / 2, 32, H, THEME.palette.stone, 109);
    slab(W / 2, H - T / 2, W, T + 8, THEME.palette.stone, 201);

    slab(W / 2, T / 2, W, T + 8, THEME.palette.stone, 203);
    const glow = this.add.circle(W / 2, 32, 30, THEME.palette.ropeGlow, 0.3).setDepth(-5);
    this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.4 }, duration: 1300, yoyo: true, repeat: -1 });
    this.add.text(W / 2, 52, THEME.framing.finishLabel, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff7a3d',
    }).setOrigin(0.5, 0).setAlpha(0.9);

    // ── ZONE: START (y ≈ 5000..4200) — "The Foundation" ─────────────────────
    // Extra-wide ledges teach rope basics. Generous gaps for pendulum practice.

    // Loading dock — extra-wide welcoming platform
    slab(W * 0.38, 4860, 260, T, THEME.palette.moss,  301);
    // Right practice step — first short swing target
    slab(W * 0.72, 4780, 130, T, THEME.palette.stone, 303);
    // Left practice landing — easy back-and-forth
    slab(W * 0.28, 4680, 160, T, THEME.palette.moss,  305);
    // Wide central — generous landing zone
    slab(W * 0.55, 4560, 190, T, THEME.palette.stone, 307);

    // Gateway structure (Π arch) — two pillars + wide lintel. First landmark.
    slab(W * 0.22, 4440, T,   80,  THEME.palette.stone, 309); // left pillar
    slab(W * 0.48, 4440, T,   80,  THEME.palette.stone, 311); // right pillar
    slab(W * 0.35, 4398, 190, T,   THEME.palette.stone, 313); // wide lintel

    // Wide bridge — generous landing past the gateway
    slab(W * 0.72, 4280, 160, T, THEME.palette.stone, 315);

    // Transition toward Boiler Hall
    slab(W * 0.25, 4180, 120, T, THEME.palette.moss,  317);
    slab(W * 0.60, 4080,  80, T, THEME.palette.stone, 319);

    // ── ZONE: BOILER HALL (y ≈ 4200..3200) — "The Machine Room" ─────────────
    // Two boiler tanks (thick columns capped with maintenance plates) force
    // swing-around paths. A wide steam-pipe bridge offers mid-zone reprieve.

    // Boiler Tank 1 — body + wider cap plate (T-shape silhouette)
    slab(W * 0.38, 4080, 55,  180, THEME.palette.stone, 401);
    slab(W * 0.38, 3985, 100, T,   THEME.palette.moss,  403);

    // Catwalks flanking the boiler
    slab(W * 0.10, 4030, 55, T, THEME.palette.stone, 405);
    slab(W * 0.88, 3920, 55, T, THEME.palette.stone, 407);

    // Steam-pipe bridge — wide, the safe rest spot
    slab(W * 0.52, 3770, 170, T, THEME.palette.stone, 409);

    // Boiler Tank 2 — chimney column (narrower, taller feel)
    slab(W * 0.65, 3630, 48, 160, THEME.palette.stone, 411);

    // Transition ledges — tighten toward Gauge Shafts
    slab(W * 0.15, 3560, 50, T, THEME.palette.stone, 413);
    slab(W * 0.88, 3440, 50, T, THEME.palette.ice,   415);
    slab(W * 0.38, 3320, 60, T, THEME.palette.stone, 417);
    slab(W * 0.12, 3230, 55, T, THEME.palette.moss,  419);

    // ── ZONE: GAUGE SHAFTS (y ≈ 3200..2200) — "The Instrument Bay" ─────────
    // Twin gauge columns dominate. Tiny platforms demand reel-in precision.
    // Platforms arranged in arc formations suggesting dial markings.

    // Twin gauge columns — the zone's signature
    slab(W * 0.25, 3100, 28, 240, THEME.palette.stone, 501);
    slab(W * 0.75, 3050, 28, 200, THEME.palette.stone, 503);

    // Thread-the-needle center between the gauges
    slab(W * 0.50, 3020, 36, T, THEME.palette.ice,   505);

    // Dial-face arc — three platforms descending like gauge markings
    slab(W * 0.15, 2870, 40, T, THEME.palette.stone, 507);
    slab(W * 0.85, 2740, 40, T, THEME.palette.stone, 509);

    // Bullseye — the precision target (28px landing!)
    slab(W * 0.50, 2600, 28, T, THEME.palette.ice,   511);

    // Continuing arc formation
    slab(W * 0.28, 2460, 48, T, THEME.palette.stone, 513);
    slab(W * 0.72, 2350, 48, T, THEME.palette.moss,  515);

    // Recovery ledge — only safe platform before Ignition
    slab(W * 0.45, 2240, 80, T, THEME.palette.stone, 517);

    // Needle anchor column — leads into Ignition
    slab(W * 0.50, 2130, T, 130, THEME.palette.ice,   519);

    // ── ZONE: IGNITION CHAMBER (y ≈ 2200..1200) — "The Combustion Zone" ────
    // Furnace-wall overhangs narrow the aim cone into a funnel. Sparse anchors
    // and a trap shelf that punishes overshooting. Designed to break the player.

    // Furnace walls — overhangs narrowing the passage
    slab(W * 0.18, 2020, 150, T, THEME.palette.stone, 601);
    slab(W * 0.82, 1950, 150, T, THEME.palette.stone, 603);

    // Fuel injector — the only anchor through the funnel
    slab(W * 0.50, 1810, 34, T, THEME.palette.ice,   605);

    // Trap shelf — wide but hugs left wall (overshoot = sidewall bounce)
    slab(W * 0.17, 1670, 106, T, THEME.palette.moss,  607);

    // Exhaust vent — hard right target
    slab(W * 0.84, 1540, 50,  T, THEME.palette.stone, 609);

    // Piston column — mid-air anchor, must detach at apex
    slab(W * 0.48, 1430, T,   90, THEME.palette.ice,   611);

    // Upper pinch overhang — narrows the path again
    slab(W * 0.30, 1340, 116, T, THEME.palette.stone, 613);

    // Exit ledge — tight, right side
    slab(W * 0.80, 1240, 58, T, THEME.palette.stone, 615);

    // ── ZONE: CORE (y ≈ 1200..32) — "The Heart" ────────────────────────────
    // Ceiling-anchor gauntlet. Sparse stepping stones, a paired piston shaft,
    // and a narrowing approach to the ignition socket. One miss = freefall.

    // Entry column
    slab(W * 0.50, 1140, T,  100, THEME.palette.stone, 701);

    // First catches
    slab(W * 0.17, 1050, 50, T, THEME.palette.moss,  703);
    slab(W * 0.84, 950,  50, T, THEME.palette.stone, 705);

    // Piston shaft — twin thin columns side by side, zone landmark
    slab(W * 0.42, 830, T, 80, THEME.palette.ice,   707);
    slab(W * 0.58, 830, T, 80, THEME.palette.ice,   709);

    // Stepping stones
    slab(W * 0.22, 710, 40, T, THEME.palette.stone, 711);
    slab(W * 0.80, 600, 40, T, THEME.palette.stone, 713);

    // Final approach — narrowing overheads
    slab(W * 0.30, 470, 100, T, THEME.palette.stone, 715);
    slab(W * 0.70, 370, 100, T, THEME.palette.stone, 717);

    // Almost there
    slab(W * 0.50, 250, 40, T, THEME.palette.moss,  719);

    // Final catch — 28px, dead center
    slab(W * 0.50, 130, 28, T, THEME.palette.ice,   721);
  }

  private paintTowerDecor(W: number, H: number): void {
    for (let y = 200; y < H; y += 320) this.fx.paintRivetRow(W * 0.5, y, W - 48, 2000 + y);

    // Pipe runs connecting structural landmarks
    this.fx.paintPipeRun(W * 0.22, 4720, W * 0.50, 4720, 3001); // Gateway pillars bridge
    this.fx.paintPipeRun(W * 0.35, 4210, W * 0.38, 4080, 3002); // Start exit → Boiler tank
    this.fx.paintPipeRun(W * 0.10, 4030, W * 0.38, 3985, 3003); // Left catwalk → boiler cap
    this.fx.paintPipeRun(W * 0.88, 3920, W * 0.52, 3770, 3004); // Right catwalk → steam bridge
    this.fx.paintPipeRun(W * 0.25, 3100, W * 0.75, 3050, 3005); // Gauge columns bridge
    this.fx.paintPipeRun(W * 0.28, 2460, W * 0.72, 2350, 3006); // Gauge arc markings
    this.fx.paintPipeRun(W * 0.18, 2020, W * 0.82, 1950, 3007); // Furnace wall connection
    this.fx.paintPipeRun(W * 0.30, 1340, W * 0.80, 1240, 3008); // Ignition pinch
    this.fx.paintPipeRun(W * 0.42, 830,  W * 0.58, 830,  3009); // Piston shaft bridge

    const dialY = [400, 830, 1140, 1600, 1900, 2400, 2700, 3100, 3630, 3985, 4300, 4720];
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

    this.matter.world.setGravity(0, TUNING.gravityY);

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
          // Analog joystick / keyboard rotates the aim arm.
          if (inp.joyX !== 0) this.aimAngle += inp.joyX * TUNING.aimRotateSpeed * dt;
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
            this.aimAngle = -Math.PI / 2;
          }
        }
      }

      // Desktop: fire target = angle arm. Mobile: fire target = tap coords set by pointer events.
      if (!this.input2.isTouchDevice()) {
        inp.aimX = this.player.x + Math.cos(this.aimAngle) * TUNING.maxLength;
        inp.aimY = this.player.y + Math.sin(this.aimAngle) * TUNING.maxLength;
      }
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
      // Guide direction: pointer during AIM drag; angle arm otherwise.
      const gx = this.input2.isTouchDevice() && inp.aiming
        ? inp.aimX
        : this.player.x + Math.cos(this.aimAngle) * TUNING.maxLength;
      const gy = this.input2.isTouchDevice() && inp.aiming
        ? inp.aimY
        : this.player.y + Math.sin(this.aimAngle) * TUNING.maxLength;
      this.fx.drawAimGuide(this.aimGuide, this.player.x, this.player.y, gx, gy, TUNING.maxLength, inp.aiming);
    }

    // ── Trajectory preview ────────────────────────────────────────────────
    this.trajGuide.clear();
    if (this.rope.state === 'SWINGING') {
      const v = this.player.body.velocity, g = TUNING.gravityY;
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
