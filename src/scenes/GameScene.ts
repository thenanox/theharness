import * as Phaser from 'phaser';
import { GAME_W, GAME_H, PHYSICS } from '../config';
import { THEME } from '../theme';
import { InputController } from '../systems/InputController';
import { Player } from '../entities/Player';
import { Rope } from '../entities/Rope';

/**
 * M1 GameScene: a flat arena with walls and a few platforms suspended
 * above the player. Rope is the primary movement. Ship gate: can you
 * swing across a 1000-pixel gap and feel good doing it?
 *
 * The arena is intentionally wider than the viewport so we can start
 * experimenting with camera follow in M2 without rewriting this scene.
 */
export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private player!: Player;
  private rope!: Rope;
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    const ARENA_W = 2000;
    const ARENA_H = GAME_H;

    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.setBackgroundColor(THEME.palette.sky);

    this.matter.world.setGravity(0, PHYSICS.gravityY);
    this.matter.world.setBounds(0, -400, ARENA_W, ARENA_H + 400);

    this.buildArena(ARENA_W, ARENA_H);

    // Player + rope
    this.player = new Player(this, 120, ARENA_H - 120);
    this.rope = new Rope(this, this.player);

    // Input
    this.input2 = new InputController(this);

    // Camera follow (real camera work lands in M2; for M1 just a soft follow)
    this.cameras.main.startFollow(this.player.gfx, true, 0.15, 0.15);

    // Ground detection — naive collision listener: if the player contacts
    // anything while moving slowly downward, mark grounded.
    this.matter.world.on(
      'collisionactive',
      (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
        for (const pair of event.pairs) {
          const involvesPlayer =
            pair.bodyA === this.player.body || pair.bodyB === this.player.body;
          if (!involvesPlayer) continue;
          if (this.player.body.velocity.y >= -0.1) {
            this.player.markGrounded(this.time.now);
          }
        }
      },
    );

    // HUD
    this.hudText = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e0c080',
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(
        GAME_W / 2,
        16,
        'M1 — LMB to fire rope · W/S reel · space/RMB to detach · A/D walk · UP jump',
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#f5f5f5',
        },
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** Arena: floor, ceiling, side walls, some ceiling platforms for ropes. */
  private buildArena(w: number, h: number): void {
    const add = (x: number, y: number, w2: number, h2: number, color: number) => {
      const r = this.add.rectangle(x, y, w2, h2, color);
      this.matter.add.gameObject(r, { isStatic: true, friction: 0.4, label: 'wall' });
      return r;
    };

    // Floor
    add(w / 2, h - 16, w, 32, THEME.palette.stone);
    // Ceiling (rope-able surface spanning the arena)
    add(w / 2, 16, w, 32, THEME.palette.stone);
    // Side walls
    add(16, h / 2, 32, h, THEME.palette.stone);
    add(w - 16, h / 2, 32, h, THEME.palette.stone);

    // Ceiling platforms you can rope from — the ship gate is reaching
    // the rightmost one via a swing.
    add(450, 180, 160, 24, THEME.palette.moss);
    add(900, 140, 180, 24, THEME.palette.moss);
    add(1350, 200, 160, 24, THEME.palette.moss);
    add(1750, 160, 180, 24, THEME.palette.ice);

    // A mid-air anchor pillar near the middle for tricky swings
    add(1100, 320, 32, 280, THEME.palette.stone);

    // A finish-line flag on the far right floor area
    const flag = this.add.rectangle(w - 80, h - 56, 16, 48, THEME.palette.accent);
    flag.setStrokeStyle(2, 0xffffff);
    // no physics — just a visual target
    void flag;
  }

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;

    this.input2.sample();

    // Route fire / detach through the Rope state machine.
    if (this.input2.state.firePressed) {
      this.rope.fireAt(this.input2.state.aimX, this.input2.state.aimY);
    }
    if (this.input2.state.detachPressed && this.rope.state === 'SWINGING') {
      this.rope.detach(true);
    }

    this.player.update(this.input2.state, this.rope.state === 'SWINGING');
    this.rope.update(dt, this.input2.state);

    this.hudText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}   rope ${this.rope.state}   v ${this.player.body.velocity.x.toFixed(
        1,
      )},${this.player.body.velocity.y.toFixed(1)}`,
    );

    this.input2.clearOneShots();
  }
}
