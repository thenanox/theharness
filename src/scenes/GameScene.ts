import * as Phaser from 'phaser';
import { GAME_H, PHYSICS } from '../config';
import { THEME } from '../theme';
import { InputController } from '../systems/InputController';
import { TouchControls } from '../systems/TouchControls';
import { VisualFX } from '../systems/VisualFX';
import { AudioBus } from '../systems/AudioBus';
import { Player } from '../entities/Player';
import { Rope } from '../entities/Rope';

/**
 * M1 GameScene — an Ink & Ember arena wide enough to experiment with
 * rope swings. The world is ~2000 px wide so camera follow has room
 * to breathe ahead of M2's vertical climb.
 *
 * Ship gate for M1: the player can swing across a 1000 px gap and feel
 * like a Worms player. Visual pass (brush-stroke tiles, ember rope glow,
 * paper backdrop, parallax silhouettes, ink splash on stick) is already
 * wired so every push looks like a game, not a debug stage.
 */
export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private player!: Player;
  private rope!: Rope;
  private fx!: VisualFX;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    const ARENA_W = 2000;
    const ARENA_H = GAME_H;

    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.setBackgroundColor(THEME.palette.background);

    this.matter.world.setGravity(0, PHYSICS.gravityY);
    this.matter.world.setBounds(0, -400, ARENA_W, ARENA_H + 400);

    // Visual FX first — paper backdrop, machine parallax, then geometry.
    // Parallax is the "Machines → Derelict Engine" variant: dead cogs +
    // cold smokestacks behind the arena instead of abstract ink columns.
    this.fx = new VisualFX(this);
    this.fx.paintPaperBackdrop(ARENA_W, ARENA_H);
    this.fx.paintMachineParallax(ARENA_W, ARENA_H);

    this.buildArena(ARENA_W, ARENA_H);
    this.paintArenaDecor(ARENA_W, ARENA_H);

    // Player + rope (with VisualFX wired for ember glow + ink splashes).
    this.player = new Player(this, 120, ARENA_H - 120);
    this.rope = new Rope(this, this.player, this.fx);

    // Aim guide graphics — a thin dashed hint of where the rope will go.
    this.aimGuide = this.add.graphics().setDepth(4);

    // Input + on-screen touch controls (mobile).
    this.input2 = new InputController(this);
    new TouchControls(this, this.input2);

    // Camera follow (real camera work lands in M2; for M1 just a soft follow).
    this.cameras.main.startFollow(this.player.gfx, true, 0.15, 0.15);

    // Fog veil pinned to the viewport so depths fade to bone-white paper.
    this.fx.paintBottomFog(this.scale.width, this.scale.height);

    // Ground detection — naive collision listener: if the player contacts
    // anything while moving slowly downward, mark grounded. Hard landings
    // kick off a grey dust puff.
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

    // HUD
    this.hudText = this.add
      .text(8, 54, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#1b1c21',
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(
        this.scale.width / 2,
        14,
        'M2.5 · DERELICT ENGINE — click/tap to cast cable · W/S or ▲▼ reel · space to detach · A/D walk',
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#1b1c21',
        },
      )
      .setOrigin(0.5, 0)
      .setAlpha(0.75)
      .setScrollFactor(0)
      .setDepth(100);

    // Start music on first user input (autoplay lockouts).
    this.input.once('pointerdown', () => {
      AudioBus.startIfLoaded(this);
      AudioBus.duck(this, 0.6);
    });
  }

  /**
   * Arena: floor, ceiling, side walls, some ceiling platforms for ropes.
   * Each physical rectangle is paired with a brushstroke slab drawn on
   * top via VisualFX so collision shapes match what the player sees.
   */
  private buildArena(w: number, h: number): void {
    const add = (x: number, y: number, w2: number, h2: number, color: number, seed: number) => {
      // Invisible static Matter rect — the physical truth.
      const r = this.add.rectangle(x, y, w2, h2, color, 0);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0.4, label: 'wall' });
      // Visible brushstroke slab painted on top.
      this.fx.paintBrushSlab(x, y, w2, h2, color, seed);
      return r;
    };

    // Floor
    add(w / 2, h - 16, w, 32, THEME.palette.stone, 101);
    // Ceiling (rope-able surface spanning the arena)
    add(w / 2, 16, w, 32, THEME.palette.stone, 203);
    // Side walls
    add(16, h / 2, 32, h, THEME.palette.stone, 307);
    add(w - 16, h / 2, 32, h, THEME.palette.stone, 409);

    // Ceiling platforms you can rope from — the ship gate is reaching
    // the rightmost one via a swing.
    add(450, 180, 160, 24, THEME.palette.moss, 503);
    add(900, 140, 180, 24, THEME.palette.moss, 601);
    add(1350, 200, 160, 24, THEME.palette.moss, 709);
    add(1750, 160, 180, 24, THEME.palette.ice, 811);

    // A mid-air anchor pillar near the middle for tricky swings
    add(1100, 320, 32, 280, THEME.palette.stone, 907);

    // Ignition trigger on the far right — the "finish line" narratively
    // becomes the dead core socket where the player plugs in the ember
    // cable to reignite the machine. Same rectangle + warm glow; an
    // IGNITION gauge sits above it so the goal reads as machinery.
    const flag = this.add.rectangle(w - 80, h - 56, 16, 48, THEME.palette.accent);
    flag.setStrokeStyle(2, THEME.palette.inkDeep);
    void flag;
    // Soft ember glow behind the socket so the eye lands on it.
    const glow = this.add.circle(w - 80, h - 56, 26, THEME.palette.ropeGlow, 0.25).setDepth(-5);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.35 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });
    // IGNITION label above the socket, ember tone.
    this.add
      .text(w - 80, h - 108, THEME.framing.finishLabel, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ff7a3d',
      })
      .setOrigin(0.5)
      .setAlpha(0.9);
  }

  /**
   * Scatter dead-machine decoration over the arena: rivets on the iron
   * slabs, a couple of pipe runs between platforms, frozen gauge dials
   * on the walls, and a steam vent near the ignition socket. All purely
   * visual — no Matter bodies, no collision, no input cost.
   */
  private paintArenaDecor(w: number, h: number): void {
    // Rivet rows along the top edge of the floor and along the ceiling.
    this.fx.paintRivetRow(w / 2, h - 30, w - 120, 1103);
    this.fx.paintRivetRow(w / 2, 30, w - 120, 1207);

    // Pipe runs connecting the ceiling platforms — feels like the machine
    // once carried steam from boiler to ignition chamber.
    this.fx.paintPipeRun(530, 168, 810, 128, 1301);
    this.fx.paintPipeRun(990, 128, 1270, 188, 1303);
    this.fx.paintPipeRun(1430, 188, 1660, 148, 1307);

    // Frozen gauge dials on the side walls — small, subtle.
    this.fx.paintGaugeDial(56, 120, 14, 1409);
    this.fx.paintGaugeDial(56, 260, 12, 1411);
    this.fx.paintGaugeDial(56, 400, 16, 1413);
    this.fx.paintGaugeDial(w - 56, 240, 14, 1415);
    this.fx.paintGaugeDial(w - 56, 420, 12, 1417);

    // Dead steam vent near the ignition socket.
    this.fx.paintSteamVent(w - 120, h - 60, 1503);
    this.fx.paintSteamVent(w - 48, h - 80, 1507);
  }

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;

    this.input2.sample();

    // Context-sensitive fire: tap/click while swinging detaches, otherwise
    // fires a new rope. One input for both keeps mobile tap mode simple.
    if (this.input2.state.firePressed) {
      if (this.rope.state === 'SWINGING') {
        this.rope.detach(true);
      } else if (this.rope.state === 'IDLE') {
        this.rope.fireAt(this.input2.state.aimX, this.input2.state.aimY);
      }
    }
    // Explicit detach (right-click / ▼) still works as a hard release.
    if (this.input2.state.detachPressed && this.rope.state === 'SWINGING') {
      this.rope.detach(true);
    }

    this.player.update(this.input2.state, this.rope.state === 'SWINGING');
    this.rope.update(dt, this.input2.state);

    // Aim guide — visible when:
    //   - desktop + rope IDLE: ghosted dashed line following cursor
    //   - mobile + Aim-mode pre-aim drag: bright ember dashed line
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

    this.hudText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}  rope ${this.rope.state}  mode ${this.input2.touchMode}`,
    );

    this.input2.clearOneShots();
  }
}
