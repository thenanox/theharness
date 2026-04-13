import * as Phaser from 'phaser';
import { THEME } from '../theme';

/**
 * Single-slot music loader with a graceful fallback.
 *
 * The user provides background music at runtime by dropping a file at
 *   public/assets/audio/music.ogg  (and optionally .mp3)
 * If nothing is found the game runs silent — never crashes. A single
 * music volume knob lives in `registry` so Menu/Game/End can all see it.
 *
 * Usage:
 *   AudioBus.queuePreload(scene)   // in PreloadScene.preload
 *   AudioBus.startIfLoaded(scene)  // after first user input
 *   AudioBus.duck(scene, 0.4)      // during gameplay
 *   AudioBus.unduck(scene)         // on end/menu
 */
export class AudioBus {
  private static readonly KEY = THEME.audio.ambientTrack;
  private static music?: Phaser.Sound.BaseSound;
  private static baseVolume = 0.6;
  private static isDucked = false;

  /** Call from PreloadScene.preload(). Fails quietly if the file is absent. */
  static queuePreload(scene: Phaser.Scene): void {
    // `import.meta.env.BASE_URL` is Vite-managed and matches VITE_BASE.
    // We add an onerror handler instead of a promise because Phaser's
    // loader raises a `loaderror` event and keeps going.
    scene.load.audio(this.KEY, [
      `assets/audio/music.ogg`,
      `assets/audio/music.mp3`,
    ]);
    scene.load.on('loaderror', (file: { key?: string }) => {
      if (file?.key === this.KEY) {
        // eslint-disable-next-line no-console
        console.info('[AudioBus] music asset missing — running silent.');
      }
    });
  }

  /** Start the loop if the asset loaded. Must be called after a user input. */
  static startIfLoaded(scene: Phaser.Scene): void {
    if (!scene.cache.audio.exists(this.KEY)) return;
    if (this.music && this.music.isPlaying) return;
    try {
      this.music = scene.sound.add(this.KEY, { loop: true, volume: this.baseVolume });
      (this.music as { play: () => void }).play();
    } catch (err) {
      // Autoplay lockouts throw — ignore, the next user input will retry.
      void err;
    }
  }

  static duck(_scene: Phaser.Scene, factor = 0.4): void {
    if (!this.music) return;
    this.isDucked = true;
    (this.music as unknown as { volume: number }).volume = this.baseVolume * factor;
  }

  static unduck(_scene: Phaser.Scene): void {
    if (!this.music) return;
    this.isDucked = false;
    (this.music as unknown as { volume: number }).volume = this.baseVolume;
  }

  static setVolume(v: number): void {
    this.baseVolume = Phaser.Math.Clamp(v, 0, 1);
    if (this.music && !this.isDucked) {
      (this.music as unknown as { volume: number }).volume = this.baseVolume;
    }
  }
}
