import * as Phaser from 'phaser';
import { GAME_W, GAME_H, PHYSICS } from '../config';
import { THEME } from '../theme';

/**
 * M0 GameScene: the bare minimum to validate Phaser 4 + Matter is wired up.
 * - A static floor
 * - A dynamic box that falls under gravity
 * - An FPS counter
 *
 * M1 will replace the falling box with a player + rope mechanic.
 */
export class GameScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(THEME.palette.sky);

    // Configure Matter world
    this.matter.world.setGravity(0, PHYSICS.gravityY);
    this.matter.world.setBounds(0, 0, GAME_W, GAME_H);

    // Floor
    const floorY = GAME_H - 24;
    const floor = this.add.rectangle(GAME_W / 2, floorY, GAME_W, 48, THEME.palette.stone);
    this.matter.add.gameObject(floor, { isStatic: true, friction: 0.4 });

    // A small dynamic body so we can see gravity ticking.
    const box = this.add.rectangle(GAME_W / 2, 100, 32, 32, THEME.palette.player);
    this.matter.add.gameObject(box, {
      mass: PHYSICS.player.mass,
      frictionAir: PHYSICS.player.frictionAir,
      friction: PHYSICS.player.friction,
      restitution: 0.2,
    });

    // Click to drop another box — quick feel check for Matter responsiveness.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const b = this.add.rectangle(p.worldX, p.worldY, 24, 24, THEME.palette.accent);
      this.matter.add.gameObject(b, {
        mass: 0.5,
        frictionAir: 0.01,
        restitution: 0.4,
      });
    });

    // FPS / status readout
    this.fpsText = this.add.text(8, 8, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e0c080',
    });

    this.add
      .text(GAME_W / 2, 32, 'M0 SMOKE TEST — click to drop boxes', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f5f5f5',
      })
      .setOrigin(0.5, 0);
  }

  update(): void {
    this.fpsText.setText(`fps ${Math.round(this.game.loop.actualFps)}`);
  }
}
