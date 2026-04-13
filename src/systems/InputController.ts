import * as Phaser from 'phaser';

/**
 * Frame-stable input snapshot. Consumers read the `state` each update;
 * the controller clears one-shot flags (pressed/released) after reads.
 */
export interface InputState {
  // Aim
  aimX: number;
  aimY: number;
  // Held
  left: boolean;
  right: boolean;
  reelUp: boolean;
  reelDown: boolean;
  // One-shot
  firePressed: boolean;
  jumpPressed: boolean;
  detachPressed: boolean;
}

export class InputController {
  private scene: Phaser.Scene;
  private keys: {
    A: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    W: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

  readonly state: InputState = {
    aimX: 0,
    aimY: 0,
    left: false,
    right: false,
    reelUp: false,
    reelDown: false,
    firePressed: false,
    jumpPressed: false,
    detachPressed: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.keys = {
      A: kb.addKey('A'),
      D: kb.addKey('D'),
      W: kb.addKey('W'),
      S: kb.addKey('S'),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.state.firePressed = true;
      if (p.rightButtonDown()) this.state.detachPressed = true;
    });
    // Prevent right-click context menu stealing the detach input.
    scene.input.mouse?.disableContextMenu();

    // Space can either fire or detach depending on player state;
    // we raise both one-shot flags and let the game decide.
    kb.on('keydown-SPACE', () => {
      this.state.firePressed = true;
      this.state.detachPressed = true;
    });
    kb.on('keydown-UP', () => {
      this.state.jumpPressed = true;
    });
    kb.on('keydown-W', () => {
      this.state.jumpPressed = true;
    });
  }

  /** Read per-frame. Call once per update, before consumers. */
  sample(): void {
    const ptr = this.scene.input.activePointer;
    this.state.aimX = ptr.worldX;
    this.state.aimY = ptr.worldY;

    this.state.left = this.keys.A.isDown || this.keys.LEFT.isDown;
    this.state.right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    this.state.reelUp = this.keys.W.isDown || this.keys.UP.isDown;
    this.state.reelDown = this.keys.S.isDown || this.keys.DOWN.isDown;
  }

  /** Call at end of update after consumers have read one-shots. */
  clearOneShots(): void {
    this.state.firePressed = false;
    this.state.jumpPressed = false;
    this.state.detachPressed = false;
  }
}
