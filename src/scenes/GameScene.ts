import * as Phaser from 'phaser';
import { GAME_W, GAME_H, WORLD_W, TOWER_H } from '../config';
import { TUNING } from '../tuning';
import { THEME } from '../theme';
import { InputController } from '../systems/InputController';
import { TouchControls } from '../systems/TouchControls';
import { TuningPanel } from '../systems/TuningPanel';
import { VisualFX } from '../systems/VisualFX';
import { AudioBus } from '../systems/AudioBus';
import { SaveStore } from '../systems/SaveStore';
import { Wavedash } from '../systems/WavedashAdapter';
import { IS_DEBUG } from '../flags';
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
  // Index into ZONES (0 = Core, 4 = Start). Climbing = index decreases.
  private currentZoneIndex: number = ZONES.length - 1;
  private phosphorTween?: Phaser.Tweens.Tween;

  // Trail ring buffer
  private trailPositions: { x: number; y: number }[] = [];

  // Ambient drift
  private ambientDrift!: ReturnType<VisualFX['createAmbientDrift']>;
  private driftAllEmber = false;

  // Ignition socket
  private ignitionSocket!: ReturnType<VisualFX['createIgnitionSocket']>;

  // Per-zone animated decor
  private sparkClusters: ReturnType<VisualFX['createSparkCluster']>[] = [];
  private capacitorPulses: ReturnType<VisualFX['createCapacitorPulse']>[] = [];

  // Zone-entry flash banner
  private zoneBanner?: Phaser.GameObjects.Text;
  private zoneBannerTween?: Phaser.Tweens.Tween;

  // Core pulse intensity (0 → 1 as player approaches top)
  private coreProximity = 0;
  private coreGlow?: Phaser.GameObjects.Arc;

  // Win state
  private winTriggered = false;

  // Run timer (frozen on win so the final panel shows the winning time)
  private runStartTime = 0;
  private runElapsedMs = 0;
  private runFrozen = false;
  private timerText!: Phaser.GameObjects.Text;

  // After detach, block fire until all fire/detach inputs are fully released.
  private awaitingFireRelease = false;

  // Debug free-cam (toggled with ` alongside the tuning panel)
  private debugCam = false;
  private debugCamKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private debugToggleHandler?: (e: KeyboardEvent) => void;

  constructor() { super('Game'); }

  create(): void {
    const W = WORLD_W, H = TOWER_H;

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setZoom(GAME_W / WORLD_W);
    this.cameras.main.setBackgroundColor(THEME.palette.screenBg);
    this.matter.world.setGravity(0, TUNING.gravityY);
    if (IS_DEBUG) new TuningPanel();
    this.matter.world.setBounds(0, -200, W, H + 200);

    this.fx = new VisualFX(this);
    this.fx.paintScreenBackdrop(W, H);
    this.fx.paintMachineParallax(W, H);
    this.buildTower(W, H);
    this.paintTowerDecor(W, H);

    const spawnY = H - 42; // floor top (H-28) minus player half-height (14)
    this.player = new Player(this, W / 2, spawnY);
    this.rope   = new Rope(this, this.player, this.fx);

    // Rope events → camera shake + zoom + SFX
    this.events.on('rope-fire', () => { AudioBus.playSfx('ropeFire'); });
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
      AudioBus.playSfx('ropeAttach');
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

    // Debug free-cam: ` toggles; arrow keys scroll; physics pauses.
    this.debugCamKeys = this.input.keyboard!.createCursorKeys();
    const matterEngine = (this.matter.world as unknown as {
      engine: { timing: { timeScale: number } };
    }).engine;
    if (IS_DEBUG) {
      this.debugToggleHandler = (e: KeyboardEvent) => {
        if (e.key !== '`') return;
        this.debugCam = !this.debugCam;
        if (this.debugCam) {
          this.cameras.main.stopFollow();
          matterEngine.timing.timeScale = 0;
        } else {
          this.cameras.main.startFollow(this.player.gfx, true, 0.12, 0.12);
          this.cameras.main.setFollowOffset(0, GAME_H * 0.22);
          matterEngine.timing.timeScale = 1;
        }
      };
      window.addEventListener('keydown', this.debugToggleHandler);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onSceneShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onSceneShutdown, this);

    this.fx.paintScanlines(GAME_W, GAME_H);
    this.fx.paintBottomFog(GAME_W, GAME_H);

    this.ambientDrift  = this.fx.createAmbientDrift(WORLD_W);
    this.ignitionSocket = this.fx.createIgnitionSocket(W / 2, 12);

    // Initial vignette
    this.fx.paintZoneVignette(this.vignetteGfx, GAME_W, GAME_H, this.phosphorColor, 1.0);

    // ── Per-step velocity cap + hard sidewall clamp ───────────────────────
    // The rope constraint (stiffness 1.0) can apply position corrections
    // that create implicit velocity exceeding maxSpeed. Capping after every
    // Matter step (not just once per frame in Player.update) prevents the
    // next step from tunneling through geometry.
    const mBody = (this.matter as unknown as {
      body: {
        setVelocity: (b: MatterJS.BodyType, v: { x: number; y: number }) => void;
        setPosition: (b: MatterJS.BodyType, p: { x: number; y: number }) => void;
      };
    }).body;

    this.matter.world.on('afterupdate', () => {
      const body = this.player.body;
      const v = body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed > TUNING.maxSpeed) {
        const s = TUNING.maxSpeed / speed;
        mBody.setVelocity(body, { x: v.x * s, y: v.y * s });
      }

      // Hard clamp: player center must stay inside sidewalls.
      // Left wall spans x 0–32, right wall x (W-32)–W. Player half-width = 10.
      const pos = body.position;
      const minX = 42;
      const maxX = W - 42;
      if (pos.x < minX) {
        mBody.setPosition(body, { x: minX, y: pos.y });
        if (body.velocity.x < 0) mBody.setVelocity(body, { x: 0, y: body.velocity.y });
      } else if (pos.x > maxX) {
        mBody.setPosition(body, { x: maxX, y: pos.y });
        if (body.velocity.x > 0) mBody.setVelocity(body, { x: 0, y: body.velocity.y });
      }
    });

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
            // Mark wall contact — used by the stun release logic so the player
            // can exit stun once they've peeled off the wall.
            this.player.markWallContact(this.time.now);
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
            this.rope.relaxConstraintToFit();
            this.player.reflectOffWall(nx, 0.75);
            if (speed >= TUNING.slideThreshold) {
              this.triggerShake(70, 0.004);
              if (this.rope.state !== 'SWINGING') {
                this.fx.emberBurst(this.player.x, this.player.y);
              }
            }
            if (this.rope.state !== 'SWINGING') {
              this.player.triggerSlide(speed);
              // Any surface contact after detach locks fire until fully stopped.
              this.player.lockFireUntilStill();
            }
          } else if (this.rope.state !== 'SWINGING') {
            if (speed >= TUNING.slideThreshold) {
              this.fx.dustPuff(this.player.x, this.player.y + 14);
              this.triggerShake(60, 0.003);
            }
            this.player.triggerSlide(speed);
            // Any surface contact after detach locks fire until fully stopped.
            this.player.lockFireUntilStill();
          }
        }
      },
    );

    // ── HUD ───────────────────────────────────────────────────────────────
    // FPS / rope-state readout: debug only.
    this.hudText = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '11px', color: '#3aff6a' })
      .setScrollFactor(0).setDepth(200).setAlpha(0.5)
      .setVisible(IS_DEBUG);

    // Mute toggle — top-left corner. Driven by SaveStore so it sticks.
    this.buildMuteButton();

    this.heightText = this.add
      .text(GAME_W / 2, 14, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ff7a3d' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);

    this.timerText = this.add
      .text(GAME_W - 8, 14, '00:00.00', { fontFamily: 'monospace', fontSize: '13px', color: '#3aff6a' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(200).setAlpha(0.85);

    // Wavedash player name (only visible when the SDK is around — itch /
    // Pages stay quiet). Anchored under the timer.
    void Wavedash.getUserName().then((name) => {
      if (!name) return;
      this.add
        .text(GAME_W - 8, 30, name, { fontFamily: 'monospace', fontSize: '10px', color: '#9aff60' })
        .setOrigin(1, 0).setScrollFactor(0).setDepth(200).setAlpha(0.7);
    });

    // Start run timer — ticks until win freezes it
    this.runStartTime = this.time.now;

    const hint = this.add
      .text(GAME_W / 2, GAME_H - 28, 'Click to fire · SPACE fire/detach · W/S reel · tap to fire on mobile',
        { fontFamily: 'monospace', fontSize: '10px', color: '#3aff6a' })
      .setOrigin(0.5, 1).setAlpha(0.45).setScrollFactor(0).setDepth(200);
    this.tweens.add({ targets: hint, alpha: 0, duration: 900, delay: 12000, onComplete: () => hint.destroy() });

    this.input.once('pointerdown', () => {
      AudioBus.unlock();
      AudioBus.startMusic(this, 'game');
      AudioBus.duck(this, 0.6);
    });
  }

  private onSceneShutdown(): void {
    if (this.debugToggleHandler) {
      window.removeEventListener('keydown', this.debugToggleHandler);
      this.debugToggleHandler = undefined;
    }
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
    // Core glow — amplified by proximity in update().
    this.coreGlow = this.add.circle(W / 2, 32, 70, THEME.palette.phosphorHot, 0.0).setDepth(-6).setBlendMode(Phaser.BlendModes.ADD);
    this.add.text(W / 2, 52, THEME.framing.finishLabel, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff7a3d',
    }).setOrigin(0.5, 0).setAlpha(0.9);

    // ── ZONE: START (y ≈ 5000..4200) — "The Foundation" ─────────────────────
    // Tutorial staircase: 140-160px gaps give real pendulum room, wide
    // platforms (350-240px) make landings forgiving. Alternates sides so
    // each step teaches firing left vs right. Rope can always reach the
    // next platform directly (offsets kept within maxLength=200).

    // Step 1 — wide center, just fire up + reel
    slab(W * 0.50, 4820, 360, T, THEME.palette.moss,  301);
    // Step 2 — lean right, learn rightward swing
    slab(W * 0.58, 4670, 320, T, THEME.palette.stone, 302);
    // Step 3 — lean left, learn leftward swing
    slab(W * 0.42, 4520, 300, T, THEME.palette.moss,  303);
    // Step 4 — center, introduce detach timing
    slab(W * 0.52, 4370, 280, T, THEME.palette.stone, 304);
    // Step 5 — right, slightly narrower
    slab(W * 0.60, 4225, 260, T, THEME.palette.moss,  305);
    // Step 6 — left, transition into Boiler Hall
    slab(W * 0.42, 4090, 240, T, THEME.palette.stone, 306);

    // ── ZONE: BOILER HALL (y ≈ 4200..3200) — "The Machine Room" ─────────────
    // Step up from tutorial. Still wide platforms but tighter gaps (80-100px).
    // Boiler tanks add visual structure; catwalks + bridges for recovery.

    // Boiler Tank 1 — body + wider cap plate
    slab(W * 0.38, 4060, 55,  160, THEME.palette.stone, 401);
    slab(W * 0.38, 3975, 160, T,   THEME.palette.moss,  403);

    // Catwalks flanking the boiler
    slab(W * 0.85, 4070, 100, T, THEME.palette.stone, 405);
    slab(W * 0.12, 3900, 100, T, THEME.palette.stone, 407);

    // Steam-pipe bridge — wide rest spot
    slab(W * 0.55, 3810, 220, T, THEME.palette.stone, 409);

    // Stepping stone to Boiler Tank 2
    slab(W * 0.25, 3720, 120, T, THEME.palette.moss,  410);

    // Boiler Tank 2 — chimney column
    slab(W * 0.65, 3630, 48, 140, THEME.palette.stone, 411);

    // Transition ledges — wider, tighter vertical gaps
    slab(W * 0.80, 3550, 100, T, THEME.palette.stone, 413);
    slab(W * 0.20, 3460, 100, T, THEME.palette.ice,   415);
    slab(W * 0.60, 3370, 100, T, THEME.palette.stone, 417);
    slab(W * 0.15, 3280, 100, T, THEME.palette.moss,  419);
    slab(W * 0.50, 3210, 120, T, THEME.palette.stone, 420);

    // ── ZONE: GAUGE SHAFTS (y ≈ 3200..2200) — "The Instrument Bay" ─────────
    // Twin gauge columns dominate. Tiny platforms demand reel-in precision.
    // Platforms arranged in arc formations suggesting dial markings.

    // Twin gauge columns — the zone's signature
    slab(W * 0.25, 3100, 28, 240, THEME.palette.stone, 501);
    slab(W * 0.75, 3050, 28, 200, THEME.palette.stone, 503);

    // Thread-the-needle center between the gauges
    slab(W * 0.50, 3020, 36, T, THEME.palette.ice,   505);

    // Dial-face arc — three platforms descending like gauge markings
    slab(W * 0.25, 2870, 40, T, THEME.palette.stone, 507);
    slab(W * 0.75, 2740, 40, T, THEME.palette.stone, 509);

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

    // Center relay — 60×24, sits in the 78px gap between the piston tops
    // (W*0.42 inner edge ≈ 281, W*0.58 inner edge ≈ 359) and 60px above
    // them. Breaks up the diagonal piston → far-side stepping-stone swing
    // that was the meanest jump in Core.
    slab(W * 0.50, 730, 60, T, THEME.palette.moss,  706);

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
    this.fx.paintPipeRun(W * 0.42, 4090, W * 0.38, 4060, 3002); // Start exit → Boiler tank
    this.fx.paintPipeRun(W * 0.12, 3900, W * 0.38, 3975, 3003); // Left catwalk → boiler cap
    this.fx.paintPipeRun(W * 0.85, 4070, W * 0.55, 3810, 3004); // Right catwalk → steam bridge
    this.fx.paintPipeRun(W * 0.25, 3100, W * 0.75, 3050, 3005); // Gauge columns bridge
    this.fx.paintPipeRun(W * 0.28, 2460, W * 0.72, 2350, 3006); // Gauge arc markings
    this.fx.paintPipeRun(W * 0.18, 2020, W * 0.82, 1950, 3007); // Furnace wall connection
    this.fx.paintPipeRun(W * 0.30, 1340, W * 0.80, 1240, 3008); // Ignition pinch
    this.fx.paintPipeRun(W * 0.42, 830,  W * 0.58, 830,  3009); // Piston shaft bridge

    const dialY = [400, 830, 1140, 1600, 1900, 2400, 2700, 3100, 3630, 3975, 4350, 4690];
    dialY.forEach((y, i) => {
      this.fx.paintGaugeDial(i % 2 === 0 ? 44 : GAME_W - 44, y, 13 + (i % 3) * 2, 4000 + i);
    });
    this.fx.paintSteamVent(GAME_W * 0.25, 60, 5001);
    this.fx.paintSteamVent(GAME_W * 0.75, 60, 5003);

    // ── Per-zone foreground decor (non-colliding, near walls) ──────────────
    // Boiler Hall (y 3200–4200): valve wheels on both walls
    this.fx.paintValveWheel(42, 3800, 6001);
    this.fx.paintValveWheel(W - 42, 3600, 6002);
    this.fx.paintValveWheel(42, 3350, 6003);

    // Gauge Shafts (y 2200–3200): graduated scales on walls
    this.fx.paintGradScale(40, 2300, 800, 6101);
    this.fx.paintGradScale(W - 40, 2300, 800, 6102);

    // Ignition Chamber (y 1200–2200): spark clusters near walls
    this.sparkClusters.push(this.fx.createSparkCluster(42, 1500));
    this.sparkClusters.push(this.fx.createSparkCluster(W - 42, 1800));
    this.sparkClusters.push(this.fx.createSparkCluster(42, 2000));

    // Core (y 32–1200): capacitor pulses flanking the approach
    this.capacitorPulses.push(this.fx.createCapacitorPulse(42, 800));
    this.capacitorPulses.push(this.fx.createCapacitorPulse(W - 42, 800));
    this.capacitorPulses.push(this.fx.createCapacitorPulse(42, 400));
    this.capacitorPulses.push(this.fx.createCapacitorPulse(W - 42, 400));
  }

  // ── Zone transition ───────────────────────────────────────────────────────

  private updateZone(playerY: number): void {
    const newIndex = ZONES.findIndex(z => playerY <= z.maxY);
    const zone = newIndex >= 0 ? ZONES[newIndex] : ZONES[ZONES.length - 1];
    if (zone.name === this.currentZoneName) return;
    const climbing = newIndex < this.currentZoneIndex;  // index decreases going up
    this.currentZoneName = zone.name;
    this.currentZoneIndex = newIndex;
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

    // Zone entry banner — only when climbing into a new zone, never when falling back
    if (climbing) this.showZoneBanner(zone.name, targetColor);
  }

  private showZoneBanner(name: string, color: number): void {
    this.zoneBannerTween?.stop();
    this.zoneBanner?.destroy();
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const b = this.add
      .text(GAME_W / 2, GAME_H * 0.38, name.toUpperCase(), {
        fontFamily: 'ui-serif, Georgia, serif',
        fontSize: '26px',
        color: hex,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201)
      .setAlpha(0);
    this.zoneBanner = b;
    this.zoneBannerTween = this.tweens.add({
      targets: b,
      alpha: { from: 0, to: 0.95 },
      y: { from: GAME_H * 0.42, to: GAME_H * 0.38 },
      duration: 220,
      ease: 'Sine.easeOut',
      yoyo: true,
      hold: 700,
      onComplete: () => b.destroy(),
    });
  }

  // ── Win sequence ──────────────────────────────────────────────────────────

  private playWinSequence(): void {
    this.winTriggered = true;
    this.runFrozen = true;
    const elapsedMs = this.runElapsedMs;
    const { wasBest: isNewBest, prev: prevBest } = SaveStore.recordBestTime(elapsedMs);

    // Fire-and-forget leaderboard upload — no-ops on itch / Pages.
    void Wavedash.uploadTimeScore(isNewBest ? elapsedMs : (prevBest ?? elapsedMs));

    this.cameras.main.shake(300, 0.012);
    this.cameras.main.flash(120, 255, 180, 80);

    // Audio: lift the gameplay duck first so the new track starts at full
    // volume, then ring out the celebrate fanfare and start the win loop.
    AudioBus.unduck(this);
    AudioBus.playSfx('celebrate');
    AudioBus.startMusic(this, 'win');

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

    // Ignition gauge dial sweep — machine-themed finale
    this.time.delayedCall(1400, () => {
      this.fx.playIgnitionFinale(GAME_W / 2, GAME_H * 0.42, GAME_W, GAME_H, () => {
        this.showVictoryPanel(elapsedMs, prevBest, isNewBest);
      });
    });

    this.time.delayedCall(2000, () => { this.cameras.main.zoomTo(1.0, 600); });
  }

  private showVictoryPanel(elapsedMs: number, prevBest: number | null, isNewBest: boolean): void {
    const cx = GAME_W / 2;
    const panelY = GAME_H * 0.68;

    const banner = this.add.text(cx, GAME_H * 0.22, THEME.labels.winBanner, {
      fontFamily: 'ui-serif, Georgia, serif', fontSize: '34px', color: '#ff7a3d',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9998).setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, y: GAME_H * 0.2, duration: 500, ease: 'Sine.easeOut' });

    // Stat panel: RUN + BEST, gauge-panel styling
    const timeStr = GameScene.formatTime(elapsedMs);
    const bestMs = isNewBest ? elapsedMs : prevBest ?? elapsedMs;
    const bestStr = GameScene.formatTime(bestMs);

    const panel = this.add.graphics().setScrollFactor(0).setDepth(9998).setAlpha(0);
    panel.fillStyle(0x15171c, 0.92);
    panel.fillRoundedRect(cx - 110, panelY - 44, 220, 94, 6);
    panel.lineStyle(1.5, THEME.palette.ember, 0.9);
    panel.strokeRoundedRect(cx - 110, panelY - 44, 220, 94, 6);
    panel.lineStyle(1, 0xffffff, 0.2);
    panel.lineBetween(cx - 100, panelY + 2, cx + 100, panelY + 2);

    const runLabel = this.add.text(cx - 96, panelY - 32, 'RUN',
      { fontFamily: 'monospace', fontSize: '10px', color: '#9aff60' })
      .setScrollFactor(0).setDepth(9999).setAlpha(0);
    const runTime = this.add.text(cx + 96, panelY - 32, timeStr,
      { fontFamily: 'monospace', fontSize: '20px', color: '#fff5c0' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(9999).setAlpha(0);

    const bestLabel = this.add.text(cx - 96, panelY + 10, isNewBest ? 'NEW BEST' : 'BEST',
      { fontFamily: 'monospace', fontSize: '10px', color: isNewBest ? '#ff7a3d' : '#9aff60' })
      .setScrollFactor(0).setDepth(9999).setAlpha(0);
    const bestTime = this.add.text(cx + 96, panelY + 10, bestStr,
      { fontFamily: 'monospace', fontSize: '18px', color: isNewBest ? '#ff7a3d' : '#ffe060' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(9999).setAlpha(0);

    this.tweens.add({
      targets: [panel, runLabel, runTime, bestLabel, bestTime],
      alpha: 1, duration: 450, ease: 'Sine.easeOut',
    });

    // New best gets a little pulse on the value
    if (isNewBest) {
      this.tweens.add({
        targets: bestTime, scale: { from: 1, to: 1.08 },
        duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // Restart hint
    const hint = this.add.text(cx, GAME_H - 36,
      'press  R  to climb again',
      { fontFamily: 'monospace', fontSize: '12px', color: '#ff7a3d' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9999).setAlpha(0);
    this.tweens.add({
      targets: hint, alpha: { from: 0, to: 0.9 },
      duration: 600, delay: 500, ease: 'Sine.easeOut',
    });

    // Enable restart. Keyboard R or *any* pointerdown anywhere on screen
    // restarts — the hint text is too small to be a reliable mobile target,
    // and TouchControls / aim taps are blocked because winTriggered=true.
    // We delay the global listener by 700 ms so the touch that triggered the
    // win itself doesn't immediately restart, and only attach it once the
    // hint has had time to fade in.
    const restart = () => this.scene.restart();
    this.input.keyboard?.once('keydown-R', restart);
    this.time.delayedCall(700, () => {
      this.input.once('pointerdown', restart);
    });
    hint.setInteractive({ useHandCursor: true });
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;

    // Debug free-cam: arrow keys or touch joystick scroll vertically through the level.
    if (this.debugCam) {
      this.input2.sample();
      const spd = 1200 * dt;
      let dy = 0;
      if (this.debugCamKeys.up.isDown)        dy = -1;
      else if (this.debugCamKeys.down.isDown) dy =  1;
      else if (this.input2.state.joyY !== 0)  dy = this.input2.state.joyY; // mobile
      this.cameras.main.scrollY += dy * spd;
      this.cameras.main.scrollY = Phaser.Math.Clamp(
        this.cameras.main.scrollY, 0, TOWER_H - GAME_H,
      );
      this.hudText.setText(`[DEBUG CAM]  y=${Math.round(this.cameras.main.scrollY)}`);
      this.input2.clearOneShots();
      return;
    }

    this.matter.world.setGravity(0, TUNING.gravityY);

    this.input2.sample();
    const inp = this.input2.state;

    // Zone update
    this.updateZone(this.player.y);

    // Win check — the ceiling blocks the player at roughly y=42 (half-height
    // 14 + ceiling bottom at 28), so the old threshold y<=32 was unreachable.
    if (this.player.y <= 50 && !this.winTriggered) this.playWinSequence();

    // ── Detach / Fire ──────────────────────────────────────────────────
    // Detach is processed first. After a detach, fire is blocked until all
    // fire/detach inputs are fully released to prevent accidental re-fire.
    if (inp.detachPressed && this.rope.state === 'SWINGING') {
      this.rope.detach();
      this.awaitingFireRelease = true;
    }

    if (this.awaitingFireRelease) {
      if (!this.input2.isAnyFireInputActive()) this.awaitingFireRelease = false;
    } else if (inp.firePressed && this.rope.state === 'IDLE' && this.player.canFire()) {
      this.rope.fireAt(inp.aimX, inp.aimY);
    }

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
    if (this.rope.state === 'IDLE' && this.player.canFire()) {
      const showGuide = !this.input2.isTouchDevice() || inp.aiming;
      if (showGuide) {
        this.fx.drawAimGuide(this.aimGuide, this.player.x, this.player.y, inp.aimX, inp.aimY, TUNING.maxLength, inp.aiming);
      }
    } else if (this.rope.state === 'IDLE') {
      // Blocked indicator — red X means: either stunned, or still moving.
      // Fire requires velocity ≈ 0 on both axes.
      const px = this.player.x, py = this.player.y;
      this.aimGuide.lineStyle(2, 0xff2200, 0.5);
      this.aimGuide.lineBetween(px - 8, py - 8, px + 8, py + 8);
      this.aimGuide.lineBetween(px - 8, py + 8, px + 8, py - 8);
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

    // ── Animated parallax + per-zone decor ────────────────────────────────
    this.fx.updateParallaxLive(this.time.now);
    for (const s of this.sparkClusters) s.update(this.time.now / 1000);
    for (const c of this.capacitorPulses) c.update(this.time.now / 1000);

    // ── Core proximity pulse ──────────────────────────────────────────────
    // Grows as player climbs past Ignition (y<2200) toward the core (y=32).
    const prox = Phaser.Math.Clamp(1 - (this.player.y - 32) / 2200, 0, 1);
    this.coreProximity = this.coreProximity + (prox - this.coreProximity) * 0.08;
    if (this.coreGlow) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now * 0.004);
      this.coreGlow.setAlpha(this.coreProximity * (0.18 + pulse * 0.22));
      this.coreGlow.setScale(1 + this.coreProximity * (0.2 + pulse * 0.4));
    }
    // Ambient shake builds near the core (very low amplitude).
    if (this.coreProximity > 0.4 && !this.winTriggered) {
      const amp = (this.coreProximity - 0.4) * 0.001;
      this.cameras.main.scrollX += (Math.random() - 0.5) * amp * GAME_W;
    }

    // ── Progress bar ──────────────────────────────────────────────────────
    const progress = 1 - Math.max(0, this.player.y - 32) / (TOWER_H - 32);
    this.fx.drawProgressBar(this.barGfx, progress, GAME_H, this.phosphorColor, this.currentZoneName);

    // ── HUD ───────────────────────────────────────────────────────────────
    const metersLeft = Math.max(0, Math.round((this.player.y - 32) / 10));
    this.heightText.setText(metersLeft > 0 ? `${metersLeft} m` : 'CLIMB!');
    this.heightText.setColor(this.phosphorColor > 0x888800 ? '#ff7a3d' : `#${this.phosphorColor.toString(16).padStart(6, '0')}`);

    if (IS_DEBUG) {
      this.hudText.setText(
        `fps ${Math.round(this.game.loop.actualFps)}  rope ${this.rope.state}${this.player.isSliding() ? '  SLIDING' : ''}`,
      );
    }

    // ── Run timer ─────────────────────────────────────────────────────────
    if (!this.runFrozen) {
      this.runElapsedMs = this.time.now - this.runStartTime;
    }
    this.timerText.setText(GameScene.formatTime(this.runElapsedMs));
    // Tint with current phosphor, ember once the Core is near
    const hex = `#${this.phosphorColor.toString(16).padStart(6, '0')}`;
    this.timerText.setColor(this.coreProximity > 0.5 ? '#ff7a3d' : hex);

    this.input2.clearOneShots();
  }

  // ── Mute button ────────────────────────────────────────────────────────

  /**
   * Top-left mute toggle. The button lives in HUD space (scroll-locked,
   * depth 200) and reads/writes its state through SaveStore so the
   * preference sticks across runs and across scene restarts.
   *
   * The icon is a tiny speaker drawn programmatically — no glyph fonts /
   * emoji to fail on. When muted, the speaker is dimmed and a diagonal
   * line crosses it.
   */
  private buildMuteButton(): void {
    // Sync AudioBus to the persisted preference *before* anything plays.
    AudioBus.setMuted(SaveStore.isMuted());

    const cx = 18, cy = 18;       // button center, top-left corner
    const size = 32;              // hit area edge

    // Register with InputController so taps here don't fire the rope.
    this.input2.registerTouchZone(cx - size / 2, cy - size / 2, size, size);

    const hit = this.add
      .rectangle(cx, cy, size, size, 0x000000, 0.0)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(199)
      .setInteractive({ useHandCursor: true });

    const icon = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(200);

    const draw = () => {
      const muted = SaveStore.isMuted();
      const color = muted ? 0x636572 : 0x3aff6a;
      const alpha = muted ? 0.6 : 0.9;
      icon.clear();
      // Backplate
      icon.fillStyle(0x15171c, 0.55);
      icon.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 4);
      icon.lineStyle(1, color, alpha * 0.5);
      icon.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 4);

      // Speaker box (left rectangle)
      icon.fillStyle(color, alpha);
      icon.fillRect(cx - 8, cy - 3, 4, 6);
      // Speaker horn (trapezoid)
      icon.beginPath();
      icon.moveTo(cx - 4, cy - 3);
      icon.lineTo(cx + 1, cy - 7);
      icon.lineTo(cx + 1, cy + 7);
      icon.lineTo(cx - 4, cy + 3);
      icon.closePath();
      icon.fillPath();

      if (!muted) {
        // Sound waves
        icon.lineStyle(1.2, color, alpha);
        icon.beginPath();
        icon.arc(cx + 3, cy, 3, -Math.PI / 3, Math.PI / 3, false);
        icon.strokePath();
        icon.beginPath();
        icon.arc(cx + 3, cy, 6, -Math.PI / 3, Math.PI / 3, false);
        icon.strokePath();
      } else {
        // Diagonal strike
        icon.lineStyle(1.5, 0xff5040, 0.9);
        icon.lineBetween(cx - 8, cy - 8, cx + 8, cy + 8);
      }
    };
    draw();

    hit.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, evt: Phaser.Types.Input.EventData) => {
      const muted = !SaveStore.isMuted();
      SaveStore.setMuted(muted);
      AudioBus.unlock();          // first click also unlocks the audio context
      AudioBus.setMuted(muted);
      draw();
      // Don't let this tap also trigger rope fire / restart on the win screen.
      evt.stopPropagation();
      void pointer;
    });
  }

  // ── Time helpers / persistence ────────────────────────────────────────────

  private static formatTime(ms: number): string {
    const clamped = Math.max(0, ms);
    const totalSec = Math.floor(clamped / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const cs = Math.floor((clamped % 1000) / 10);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(m)}:${pad(s)}.${pad(cs)}`;
  }

}
