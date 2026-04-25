import * as Phaser from 'phaser';

/**
 * Frame-stable input snapshot. Consumers read the `state` each update;
 * the controller clears one-shot flags (pressed/released) after reads.
 *
 * Desktop: mouse position = aim. Click/Space fires. Right-click detaches.
 * Mobile: touch position = aim. Touch starts aiming (guide visible),
 *   release fires. Quick taps snap-fire. Detach on touch when swinging.
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
  detachPressed: boolean;
  // Preview: true when the player is currently touching the screen
  // (mobile only). The scene uses this to draw the aim guide.
  aiming: boolean;
  // Analog joystick axes — range [-1, 1].
  // Set by the virtual joystick on touch; derived from keyboard (±1) on desktop.
  joyX: number;
  joyY: number;
}

interface TouchZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class InputController {
  private scene: Phaser.Scene;
  private readonly touchDevice: boolean;
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

  private touchZones: TouchZone[] = [];

  /** Touch-button hold state. Kept separate so sample() can OR it with the
   *  keyboard — otherwise the per-frame keyboard read would overwrite flags
   *  that TouchControls sets on pointerdown.
   */
  private touchHold = { left: false, right: false, reelUp: false, reelDown: false };

  /** Mobile-only: tracks which pointer is doing the aim drag. */
  private dragPointerId: number | null = null;

  readonly state: InputState = {
    aimX: 0,
    aimY: 0,
    left: false,
    right: false,
    reelUp: false,
    reelDown: false,
    firePressed: false,
    detachPressed: false,
    aiming: false,
    joyX: 0,
    joyY: 0,
  };

  // True while the touch joystick has active analog input.
  // Prevents sample() from overwriting the analog values with keyboard ±1.
  private joySourceTouch = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.touchDevice =
      scene.sys.game.device.input.touch ||
      new URLSearchParams(window.location.search).has('touch');

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
      if (this.isOverTouchZone(p.x, p.y)) return;

      if (p.rightButtonDown()) {
        this.state.detachPressed = true;
        return;
      }

      if (this.isTouchDevice()) {
        // Mobile: start aim tracking, detach immediately if swinging.
        this.dragPointerId = p.id;
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
        this.state.aiming = true;
        this.state.detachPressed = true;
        return;
      }

      // Desktop: click fires at mouse position.
      if (p.leftButtonDown()) {
        this.state.firePressed = true;
        this.state.detachPressed = true;
      }
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== null && p.id === this.dragPointerId) {
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
      }
    });

    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== null && p.id === this.dragPointerId) {
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
        this.state.firePressed = true;
        this.state.detachPressed = true;
        this.state.aiming = false;
        this.dragPointerId = null;
      }
    });

    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== null && p.id === this.dragPointerId) {
        this.dragPointerId = null;
        this.state.aiming = false;
      }
    });

    scene.input.mouse?.disableContextMenu();

    kb.on('keydown-SPACE', () => {
      this.state.firePressed = true;
      this.state.detachPressed = true;
    });
  }

  /** Called by TouchControls on pointer down/up on a hold button. */
  setTouchHold(key: 'left' | 'right' | 'reelUp' | 'reelDown', held: boolean): void {
    this.touchHold[key] = held;
  }

  /** Called by the touch joystick with normalized [-1,1] values. */
  setJoyAnalog(x: number, y: number): void {
    this.joySourceTouch = true;
    this.state.joyX = x;
    this.state.joyY = y;
  }

  /** Called when the joystick is released. */
  clearJoyAnalog(): void {
    this.joySourceTouch = false;
    this.state.joyX = 0;
    this.state.joyY = 0;
  }

  /** Called by TouchControls so tap-to-fire ignores taps on buttons. */
  registerTouchZone(x: number, y: number, w: number, h: number): void {
    this.touchZones.push({ x, y, w, h });
  }

  /** True when any fire/detach input is physically held (mouse, Space, touch). */
  isAnyFireInputActive(): boolean {
    return this.keys.SPACE.isDown ||
      this.scene.input.activePointer.isDown ||
      this.dragPointerId !== null;
  }

  isTouchDevice(): boolean {
    return this.touchDevice;
  }

  private isOverTouchZone(screenX: number, screenY: number): boolean {
    for (const z of this.touchZones) {
      if (screenX >= z.x && screenX <= z.x + z.w && screenY >= z.y && screenY <= z.y + z.h) {
        return true;
      }
    }
    return false;
  }

  /** Read per-frame. Call once per update, before consumers. */
  sample(): void {
    if (!this.isTouchDevice()) {
      const ptr = this.scene.input.activePointer;
      this.state.aimX = ptr.worldX;
      this.state.aimY = ptr.worldY;
    }

    this.state.left     = this.touchHold.left     || this.keys.A.isDown || this.keys.LEFT.isDown;
    this.state.right    = this.touchHold.right    || this.keys.D.isDown || this.keys.RIGHT.isDown;
    this.state.reelUp   = this.touchHold.reelUp   || this.keys.W.isDown || this.keys.UP.isDown;
    this.state.reelDown = this.touchHold.reelDown || this.keys.S.isDown || this.keys.DOWN.isDown;

    if (!this.joySourceTouch) {
      this.state.joyX = this.state.left ? -1 : this.state.right ? 1 : 0;
      this.state.joyY = this.state.reelUp ? -1 : this.state.reelDown ? 1 : 0;
    }
  }

  /** Call at end of update after consumers have read one-shots. */
  clearOneShots(): void {
    this.state.firePressed = false;
    this.state.detachPressed = false;
  }
}
