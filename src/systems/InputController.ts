import * as Phaser from 'phaser';

/**
 * Frame-stable input snapshot. Consumers read the `state` each update;
 * the controller clears one-shot flags (pressed/released) after reads.
 *
 * Mobile supports two control modes:
 *   - 'tap' : a single tap fires the rope at the tap point. Ultra-easy.
 *   - 'aim' : hold (>= HOLD_AIM_MS) to reveal an aim preview, drag to
 *             tune, release to fire at the final drag point. Quick taps
 *             still snap-fire — so Tap-mode muscle memory is preserved.
 *
 * Desktop always uses cursor-aim fire-on-click. The mode only matters on
 * touch devices where there's no persistent pointer position.
 */
export type TouchMode = 'tap' | 'aim';

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
  // Preview: true when the player is currently holding a pre-aim drag
  // (mobile Aim mode only). The scene uses this to draw the aim guide.
  aiming: boolean;
}

interface TouchZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HOLD_AIM_MS = 110;
const TOUCH_MODE_KEY = 'harness.touchMode';

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

  private touchZones: TouchZone[] = [];

  /** Mobile-only aim state for pre-aim drag. */
  private dragStartAt = 0;
  private dragPointerId: number | null = null;
  private dragResolvedAsAim = false;
  touchMode: TouchMode = 'tap';

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
    aiming: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadTouchMode();

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

      // Desktop right-click: always hard detach.
      if (p.rightButtonDown()) {
        this.state.detachPressed = true;
        return;
      }

      if (this.isTouchDevice() && this.touchMode === 'aim') {
        // Start a pre-aim drag; fire is resolved on pointerup.
        this.dragStartAt = scene.time.now;
        this.dragPointerId = p.id;
        this.dragResolvedAsAim = false;
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
        return;
      }

      // Default (desktop click or mobile tap mode): fire at pointer.
      if (p.leftButtonDown()) {
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
        this.state.firePressed = true;
      }
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== null && p.id === this.dragPointerId) {
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
        if (!this.dragResolvedAsAim && scene.time.now - this.dragStartAt >= HOLD_AIM_MS) {
          this.dragResolvedAsAim = true;
          this.state.aiming = true;
        }
      }
    });

    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== null && p.id === this.dragPointerId) {
        this.state.aimX = p.worldX;
        this.state.aimY = p.worldY;
        // Release is a fire regardless of aim/quick-tap — the scene decides
        // whether it's a fire or a detach based on rope state.
        this.state.firePressed = true;
        this.state.aiming = false;
        this.dragPointerId = null;
        this.dragResolvedAsAim = false;
      }
    });

    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      if (this.dragPointerId !== null && p.id === this.dragPointerId) {
        this.dragPointerId = null;
        this.dragResolvedAsAim = false;
        this.state.aiming = false;
      }
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

  /** Called by TouchControls so tap-to-fire ignores taps on buttons. */
  registerTouchZone(x: number, y: number, w: number, h: number): void {
    this.touchZones.push({ x, y, w, h });
  }

  setTouchMode(mode: TouchMode): void {
    this.touchMode = mode;
    try {
      localStorage.setItem(TOUCH_MODE_KEY, mode);
    } catch {
      // localStorage may be unavailable (private browsing, itch iframe). ignore.
    }
  }

  toggleTouchMode(): TouchMode {
    this.setTouchMode(this.touchMode === 'tap' ? 'aim' : 'tap');
    return this.touchMode;
  }

  private loadTouchMode(): void {
    try {
      const saved = localStorage.getItem(TOUCH_MODE_KEY);
      if (saved === 'tap' || saved === 'aim') this.touchMode = saved;
    } catch {
      // ignore
    }
  }

  isTouchDevice(): boolean {
    return (
      this.scene.sys.game.device.input.touch ||
      new URLSearchParams(window.location.search).has('touch')
    );
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
    // Only desktop uses the live pointer as the aim. Mobile tracks
    // aimX/Y via pointerdown/move/up so a finger that left the screen
    // doesn't instantly snap the aim.
    if (!this.isTouchDevice() || this.dragPointerId === null) {
      const ptr = this.scene.input.activePointer;
      if (!this.isTouchDevice()) {
        this.state.aimX = ptr.worldX;
        this.state.aimY = ptr.worldY;
      }
    }

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
