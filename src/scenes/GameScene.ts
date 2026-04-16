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
  private slideText!:  Phaser.GameObjects.Text;

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

    const spawnY = H - 100;
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

    // ── Collision: grounded ───────────────────────────────────────────────
    this.matter.world.on(
      'collisionactive',
      (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
        for (const pair of event.pairs) {
          const isA = pair.bodyA === this.player.body;
          const isB = pair.bodyB === this.player.body;
          if (!isA && !isB) continue;
          const other = isA ? pair.bodyB : pair.bodyA;
          if (other.label === 'sidewall') continue;
          if (this.player.body.velocity.y >= -0.1) {
            const vy = this.player.body.velocity.y;
            this.player.markGrounded(this.time.now);
            if (vy > 6) {
              this.fx.dustPuff(this.player.x, this.player.y + 14);
              this.triggerShake(90, 0.006);
            }
          }
        }
      },
    );

    // ── Collision: slide + wall rebound ──────────────────────────────────
    this.matter.world.on(
      'collisionstart',
      (event: {
        pairs: Array<{
          bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType;
          collision: { normal: { x: number; y: number } };
        }>;
      }) => {
        for (const pair of event.pairs) {
          const isA = pair.bodyA === this.player.body;
          const isB = pair.bodyB === this.player.body;
          if (!isA && !isB) continue;
          if (this.rope.state === 'SWINGING') continue;
          const v = this.player.body.velocity;
          const speed = Math.hypot(v.x, v.y);
          this.player.triggerSlide(speed);
          const other = isA ? pair.bodyB : pair.bodyA;
          if (other.label === 'sidewall' && speed >= PHYSICS.player.slideThreshold) {
            const n = pair.collision?.normal ?? { x: 0, y: 0 };
            this.player.kickFromWall(isA ? -n.x : n.x, speed);
            this.triggerShake(70, 0.004);
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

    this.slideText = this.add
      .text(W / 2, GAME_H / 2 - 60, 'SLIDING — fire rope to recover', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ff4400',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0).setVisible(false);

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
      this.matter.add.gameObject(r, { isStatic: true, friction: 0.4, restitution: 0, label: 'platform' });
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

    slab(W * 0.5,  4820, W * 0.55, T, THEME.palette.moss,  301);
    slab(W * 0.2,  4660, W * 0.30, T, THEME.palette.stone, 305);
    slab(W * 0.8,  4600, W * 0.25, T, THEME.palette.stone, 307);
    slab(W * 0.5,  4450, W * 0.40, T, THEME.palette.moss,  311);

    slab(W * 0.15, 4100, W * 0.22, T, THEME.palette.stone, 401);
    slab(W * 0.85, 4000, W * 0.22, T, THEME.palette.stone, 403);
    slab(W * 0.5,  3870, W * 0.35, T, THEME.palette.moss,  407);
    slab(W * 0.2,  3720, W * 0.28, T, THEME.palette.stone, 411);
    slab(W * 0.8,  3600, W * 0.28, T, THEME.palette.stone, 413);
    slab(W * 0.5,  3440, W * 0.35, T, THEME.palette.ice,   417);
    slab(W * 0.15, 3300, W * 0.22, T, THEME.palette.stone, 421);

    slab(W * 0.5,  3150, W * 0.18, 200, THEME.palette.stone, 501);
    slab(W * 0.15, 3000, W * 0.22, T,   THEME.palette.moss,  505);
    slab(W * 0.85, 2870, W * 0.22, T,   THEME.palette.stone, 507);
    slab(W * 0.5,  2720, W * 0.30, T,   THEME.palette.stone, 511);
    slab(W * 0.15, 2580, W * 0.22, T,   THEME.palette.ice,   513);
    slab(W * 0.8,  2450, W * 0.28, T,   THEME.palette.stone, 517);
    slab(W * 0.4,  2300, W * 0.35, T,   THEME.palette.moss,  521);

    slab(W * 0.85, 2150, W * 0.22, T,   THEME.palette.stone, 601);
    slab(W * 0.15, 2000, W * 0.22, T,   THEME.palette.stone, 603);
    slab(W * 0.6,  1850, W * 0.25, T,   THEME.palette.ice,   607);
    slab(W * 0.5,  1700, W * 0.16, 150, THEME.palette.stone, 611);
    slab(W * 0.15, 1580, W * 0.22, T,   THEME.palette.moss,  615);
    slab(W * 0.85, 1450, W * 0.22, T,   THEME.palette.stone, 619);
    slab(W * 0.4,  1300, W * 0.28, T,   THEME.palette.stone, 623);

    slab(W * 0.8,  1150, W * 0.30, T,   THEME.palette.stone, 701);
    slab(W * 0.2,  1000, W * 0.30, T,   THEME.palette.stone, 703);
    slab(W * 0.55, 860,  W * 0.22, T,   THEME.palette.moss,  707);
    slab(W * 0.5,  700,  W * 0.18, 140, THEME.palette.stone, 711);
    slab(W * 0.15, 580,  W * 0.22, T,   THEME.palette.stone, 715);
    slab(W * 0.85, 440,  W * 0.22, T,   THEME.palette.ice,   719);
    slab(W * 0.5,  300,  W * 0.35, T,   THEME.palette.moss,  723);
  }

  private paintTowerDecor(W: number, H: number): void {
    for (let y = 200; y < H; y += 320) this.fx.paintRivetRow(W * 0.5, y, W - 48, 2000 + y);
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
      inp.aimX = this.player.x + Math.cos(this.aimAngle) * PHYSICS.rope.maxLength;
      inp.aimY = this.player.y + Math.sin(this.aimAngle) * PHYSICS.rope.maxLength;
    }

    if (inp.firePressed   && this.rope.state === 'IDLE')     this.rope.fireAt(inp.aimX, inp.aimY);
    if (inp.detachPressed && this.rope.state === 'SWINGING') this.rope.detach(true);

    const playerInput = this.rope.state === 'IDLE'
      ? { ...inp, left: false, right: false } : inp;
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
    if (this.rope.state === 'IDLE') {
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

    const sliding = this.player.isSliding();
    this.slideText.setVisible(sliding).setAlpha(sliding ? 0.9 : 0);

    this.hudText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}  rope ${this.rope.state}${sliding ? '  SLIDING' : ''}`,
    );

    this.input2.clearOneShots();
  }
}
