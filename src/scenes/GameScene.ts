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
 * GameScene — vertical tower arena.
 *
 * World: GAME_W × TOWER_H (480 × 5000). The viewport (480 × 854) scrolls
 * vertically as the player climbs. Camera has an upward look-ahead bias so
 * you can see the next anchor before you reach it.
 *
 * Platform layout (bottom → top):
 *   Zone 1  y 4200–4968  Start / tutorial   basic rope hooks
 *   Zone 2  y 3200–4200  Boiler Hall        wider gaps, momentum swings
 *   Zone 3  y 2200–3200  Gauge Shafts       tight passages, reel control
 *   Zone 4  y 1200–2200  Ignition Chamber   hardest — long swings, narrow ledges
 *   Zone 5  y    0–1200  Core               final push, ignition socket at top
 */
export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private player!: Player;
  private rope!: Rope;
  private fx!: VisualFX;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private heightText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    const W = GAME_W;
    const H = TOWER_H;

    // World bounds — narrow (portrait width) and very tall.
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(THEME.palette.background);

    this.matter.world.setGravity(0, PHYSICS.gravityY);
    // Give some breathing room above and below the tower.
    this.matter.world.setBounds(0, -200, W, H + 200);

    // VisualFX layer.
    this.fx = new VisualFX(this);
    this.fx.paintPaperBackdrop(W, H);
    this.fx.paintMachineParallax(W, H);

    this.buildTower(W, H);
    this.paintTowerDecor(W, H);

    // Player spawns near the bottom.
    const spawnY = H - 100;
    this.player = new Player(this, W / 2, spawnY);
    this.rope = new Rope(this, this.player, this.fx);

    this.aimGuide = this.add.graphics().setDepth(4);

    this.input2 = new InputController(this);
    new TouchControls(this, this.input2);

    // Camera: follow with vertical bias — look upward so the player can see
    // anchors above them before committing to a swing.
    this.cameras.main.startFollow(this.player.gfx, true, 0.08, 0.08);
    this.cameras.main.setFollowOffset(0, GAME_H * 0.15); // look-ahead: player sits in lower 40%

    // Fog veil pinned to viewport bottom.
    this.fx.paintBottomFog(GAME_W, GAME_H);

    // Ground detection.
    this.matter.world.on(
      'collisionactive',
      (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
        for (const pair of event.pairs) {
          const involvesPlayer =
            pair.bodyA === this.player.body || pair.bodyB === this.player.body;
          if (!involvesPlayer) continue;
          if (this.player.body.velocity.y >= -0.1) {
            const vyBefore = this.player.body.velocity.y;
            this.player.markGrounded(this.time.now);
            if (vyBefore > 6) {
              this.fx.dustPuff(this.player.x, this.player.y + 14);
            }
          }
        }
      },
    );

    // HUD — pinned to viewport, scrollFactor 0.
    this.hudText = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#1b1c21',
      })
      .setScrollFactor(0)
      .setDepth(200)
      .setAlpha(0.7);

    this.heightText = this.add
      .text(W / 2, 14, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ff7a3d',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(200);

    // Instruction hint — fades after 10s.
    this.add
      .text(W / 2, GAME_H - 28, 'tap / click to fire cable · W/▲ reel · space to detach', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#1b1c21',
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.55)
      .setScrollFactor(0)
      .setDepth(200);

    // Start music on first touch.
    this.input.once('pointerdown', () => {
      AudioBus.startIfLoaded(this);
      AudioBus.duck(this, 0.6);
    });
  }

  /**
   * Build the vertical tower's collision geometry.
   *
   * Structure: two side walls spanning the full height, floor at the very
   * bottom, ceiling (ignition socket) at the very top, plus a series of
   * platforms and ledges to climb through.
   *
   * Platforms are intentionally sparse — you MUST use the rope to advance.
   */
  private buildTower(W: number, H: number): void {
    const slab = (x: number, y: number, w: number, h: number, color: number, seed: number) => {
      const r = this.add.rectangle(x, y, w, h, color, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0.4, label: 'wall' });
      this.fx.paintBrushSlab(x, y, w, h, color, seed);
    };

    const wallThick = 24;
    const half = wallThick / 2;

    // Side walls — full height.
    slab(half,     H / 2, wallThick, H, THEME.palette.stone, 101);
    slab(W - half, H / 2, wallThick, H, THEME.palette.stone, 109);

    // Floor.
    slab(W / 2, H - half, W, wallThick, THEME.palette.stone, 201);

    // Ignition socket at the top — reach here to win.
    slab(W / 2, half, W, wallThick, THEME.palette.stone, 203);
    const glow = this.add.circle(W / 2, 32, 30, THEME.palette.ropeGlow, 0.3).setDepth(-5);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.4 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
    });
    this.add
      .text(W / 2, 52, THEME.framing.finishLabel, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ff7a3d',
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.9);

    // ── Zone 1: Start area (y 4200–4968) ─────────────────────────────────
    // A small starting ledge and low ceiling hooks to ease players in.
    slab(W * 0.5,  4820, W * 0.55, 20, THEME.palette.moss,  301); // wide starting ledge
    slab(W * 0.2,  4660, W * 0.30, 18, THEME.palette.stone, 305); // left wall protrusion
    slab(W * 0.8,  4600, W * 0.25, 18, THEME.palette.stone, 307); // right wall protrusion
    slab(W * 0.5,  4450, W * 0.40, 18, THEME.palette.moss,  311); // mid platform — first rope target

    // ── Zone 2: Boiler Hall (y 3200–4200) ────────────────────────────────
    slab(W * 0.15, 4100, W * 0.22, 18, THEME.palette.stone, 401);
    slab(W * 0.85, 4000, W * 0.22, 18, THEME.palette.stone, 403);
    slab(W * 0.5,  3870, W * 0.35, 18, THEME.palette.moss,  407);
    slab(W * 0.2,  3720, W * 0.28, 18, THEME.palette.stone, 411);
    slab(W * 0.8,  3600, W * 0.28, 18, THEME.palette.stone, 413);
    slab(W * 0.5,  3440, W * 0.35, 18, THEME.palette.ice,   417); // ice — slippery landing
    slab(W * 0.15, 3300, W * 0.22, 18, THEME.palette.stone, 421);

    // ── Zone 3: Gauge Shafts (y 2200–3200) ───────────────────────────────
    // Tight passage — center column forces you to rope around it.
    slab(W * 0.5,  3150, W * 0.18, 200, THEME.palette.stone, 501); // center pillar (ropeable sides)
    slab(W * 0.15, 3000, W * 0.22, 18,  THEME.palette.moss,  505);
    slab(W * 0.85, 2870, W * 0.22, 18,  THEME.palette.stone, 507);
    slab(W * 0.5,  2720, W * 0.30, 18,  THEME.palette.stone, 511);
    slab(W * 0.15, 2580, W * 0.22, 18,  THEME.palette.ice,   513);
    slab(W * 0.8,  2450, W * 0.28, 18,  THEME.palette.stone, 517);
    slab(W * 0.4,  2300, W * 0.35, 18,  THEME.palette.moss,  521);

    // ── Zone 4: Ignition Chamber approach (y 1200–2200) ──────────────────
    // Long gaps; reel timing becomes critical here.
    slab(W * 0.85, 2150, W * 0.22, 18,  THEME.palette.stone, 601);
    slab(W * 0.15, 2000, W * 0.22, 18,  THEME.palette.stone, 603);
    slab(W * 0.6,  1850, W * 0.25, 18,  THEME.palette.ice,   607);
    slab(W * 0.5,  1700, W * 0.16, 150, THEME.palette.stone, 611); // narrow pillar
    slab(W * 0.15, 1580, W * 0.22, 18,  THEME.palette.moss,  615);
    slab(W * 0.85, 1450, W * 0.22, 18,  THEME.palette.stone, 619);
    slab(W * 0.4,  1300, W * 0.28, 18,  THEME.palette.stone, 623);

    // ── Zone 5: Core (y 0–1200) ───────────────────────────────────────────
    slab(W * 0.8,  1150, W * 0.30, 18,  THEME.palette.stone, 701);
    slab(W * 0.2,  1000, W * 0.30, 18,  THEME.palette.stone, 703);
    slab(W * 0.55, 860,  W * 0.22, 18,  THEME.palette.moss,  707);
    slab(W * 0.5,  700,  W * 0.18, 140, THEME.palette.stone, 711); // final pillar
    slab(W * 0.15, 580,  W * 0.22, 18,  THEME.palette.stone, 715);
    slab(W * 0.85, 440,  W * 0.22, 18,  THEME.palette.ice,   719);
    slab(W * 0.5,  300,  W * 0.35, 18,  THEME.palette.moss,  723); // last platform before top
  }

  /**
   * Scatter machine decorations: rivets, pipes, gauge dials, steam vents.
   * All purely visual — no physics bodies.
   */
  private paintTowerDecor(W: number, H: number): void {
    // Rivet rows along both side walls every ~300px of height.
    for (let y = 200; y < H; y += 320) {
      this.fx.paintRivetRow(W * 0.5, y, W - 48, 2000 + y);
    }

    // Pipe runs between facing platforms.
    this.fx.paintPipeRun(W * 0.2, 4660, W * 0.8, 4600, 3001);
    this.fx.paintPipeRun(W * 0.2, 3720, W * 0.8, 3600, 3003);
    this.fx.paintPipeRun(W * 0.2, 3000, W * 0.8, 2870, 3005);
    this.fx.paintPipeRun(W * 0.8, 2150, W * 0.2, 2000, 3007);
    this.fx.paintPipeRun(W * 0.8, 1450, W * 0.2, 1580, 3009);

    // Gauge dials scattered on both walls.
    const dialPositions = [400, 800, 1100, 1600, 1900, 2400, 2700, 3100, 3500, 3900, 4300, 4700];
    dialPositions.forEach((y, i) => {
      const onLeft = i % 2 === 0;
      this.fx.paintGaugeDial(onLeft ? 44 : W - 44, y, 13 + (i % 3) * 2, 4000 + i);
    });

    // Gear silhouettes on mid-parallax layer (via machine parallax already handled).

    // Steam vents near ignition socket.
    this.fx.paintSteamVent(W * 0.25, 60, 5001);
    this.fx.paintSteamVent(W * 0.75, 60, 5003);
  }

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;

    this.input2.sample();

    // Context-sensitive fire: tap while swinging = detach, else fire.
    if (this.input2.state.firePressed) {
      if (this.rope.state === 'SWINGING') {
        this.rope.detach(true);
      } else if (this.rope.state === 'IDLE') {
        this.rope.fireAt(this.input2.state.aimX, this.input2.state.aimY);
      }
    }
    if (this.input2.state.detachPressed && this.rope.state === 'SWINGING') {
      this.rope.detach(true);
    }

    this.player.update(this.input2.state, this.rope.state === 'SWINGING');
    this.rope.update(dt, this.input2.state);

    // Aim guide.
    const showGuide =
      (this.rope.state === 'IDLE' && !this.input2.isTouchDevice()) ||
      this.input2.state.aiming;
    if (showGuide) {
      this.fx.drawAimGuide(
        this.aimGuide,
        this.player.x,
        this.player.y,
        this.input2.state.aimX,
        this.input2.state.aimY,
        PHYSICS.rope.maxLength,
        this.input2.state.aiming,
      );
    } else {
      this.aimGuide.clear();
    }

    // Height HUD — distance remaining to the top.
    const metersLeft = Math.max(0, Math.round((this.player.y - 32) / 10));
    this.heightText.setText(metersLeft > 0 ? `${metersLeft} m` : 'CLIMB!');

    this.hudText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}  rope ${this.rope.state}  ${this.input2.touchMode}`,
    );

    this.input2.clearOneShots();
  }
}
