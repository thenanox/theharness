import * as Phaser from 'phaser';

/**
 * Audio for The Harness.
 *
 * Two layers, both optional:
 *   1. **File-loaded music**: drop OGG/MP3 files at `public/assets/audio/`
 *      and they take precedence over the synth fallback. Filenames are
 *      `music.ogg` (gameplay) and `music_win.ogg` (victory screen).
 *   2. **WebAudio synthesis**: zero-asset fallback. Two slow drones
 *      (gameplay / win) plus three SFX (ropeFire, ropeAttach, celebrate).
 *      Always works on any browser that has AudioContext.
 *
 * The whole module no-ops cleanly when audio isn't available (SSR, blocked
 * autoplay, AudioContext absent, etc.) — never throws.
 *
 * Usage:
 *   AudioBus.queuePreload(scene)        // BootScene.preload()
 *   AudioBus.unlock()                   // first user input
 *   AudioBus.startMusic(scene, 'game')  // when gameplay starts
 *   AudioBus.startMusic(scene, 'win')   // on victory
 *   AudioBus.playSfx('ropeFire')        // one-shot
 */

export type MusicKey = 'game' | 'win';
export type SfxKey = 'ropeFire' | 'ropeAttach' | 'celebrate';

interface DroneNodes {
  oscillators: OscillatorNode[];
  gain: GainNode;
  others: AudioNode[];
}

export class AudioBus {
  private static fileMusic?: Phaser.Sound.BaseSound;
  private static fileMusicKey?: MusicKey;
  private static baseVolume = 0.55;
  private static isDucked = false;

  private static ctx: AudioContext | null = null;
  private static ctxFailed = false;
  private static masterGain: GainNode | null = null;
  private static currentDrone: DroneNodes | null = null;

  // ── File loading (optional override) ─────────────────────────────────────

  /** Call from BootScene.preload(). Fails quietly if files are absent. */
  static queuePreload(scene: Phaser.Scene): void {
    scene.load.audio('music_game', ['assets/audio/music.ogg', 'assets/audio/music.mp3']);
    scene.load.audio('music_win',  ['assets/audio/music_win.ogg', 'assets/audio/music_win.mp3']);
    scene.load.on('loaderror', (file: { key?: string }) => {
      if (file?.key === 'music_game' || file?.key === 'music_win') {
        // eslint-disable-next-line no-console
        console.info(`[AudioBus] ${file.key} asset missing — using procedural drone.`);
      }
    });
  }

  /**
   * Back-compat shim: starts gameplay music if the file is present.
   * Prefer `startMusic(scene, 'game')`.
   */
  static startIfLoaded(scene: Phaser.Scene): void {
    this.unlock();
    this.startMusic(scene, 'game');
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Resume the AudioContext. Browsers gate audio on a user gesture, so call
   * this from a pointerdown / keydown handler. Idempotent.
   */
  static unlock(): void {
    const ctx = this.getCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* silent */ });
    }
  }

  /**
   * Switch the active background loop. Tries the loaded file first; falls
   * back to a synthesized drone. Crossfades over ~600 ms.
   */
  static startMusic(scene: Phaser.Scene, key: MusicKey): void {
    const fileKey = key === 'game' ? 'music_game' : 'music_win';
    const haveFile = scene.cache.audio.exists(fileKey);

    if (haveFile) {
      this.stopSynthDrone(0.6);
      if (this.fileMusicKey === key && this.fileMusic && (this.fileMusic as { isPlaying?: boolean }).isPlaying) return;
      this.stopFileMusic();
      try {
        this.fileMusic = scene.sound.add(fileKey, { loop: true, volume: this.effectiveMusicVolume() });
        (this.fileMusic as { play: () => void }).play();
        this.fileMusicKey = key;
      } catch {
        // Autoplay lockout — caller will retry on next user gesture.
        this.startSynthDrone(key);
      }
      return;
    }

    // No file → synth drone
    this.stopFileMusic();
    this.startSynthDrone(key);
  }

  /** Lower music volume during gameplay or other foregrounded audio. */
  static duck(_scene: Phaser.Scene, factor = 0.4): void {
    this.isDucked = true;
    if (this.fileMusic) {
      (this.fileMusic as unknown as { volume: number }).volume = this.baseVolume * factor;
    }
    if (this.masterGain) {
      this.masterGain.gain.value = this.baseVolume * factor;
    }
  }

  static unduck(_scene: Phaser.Scene): void {
    this.isDucked = false;
    if (this.fileMusic) {
      (this.fileMusic as unknown as { volume: number }).volume = this.baseVolume;
    }
    if (this.masterGain) {
      this.masterGain.gain.value = this.baseVolume;
    }
  }

  static setVolume(v: number): void {
    this.baseVolume = Phaser.Math.Clamp(v, 0, 1);
    if (!this.isDucked) {
      if (this.fileMusic) {
        (this.fileMusic as unknown as { volume: number }).volume = this.baseVolume;
      }
      if (this.masterGain) {
        this.masterGain.gain.value = this.baseVolume;
      }
    }
  }

  /** Fire-and-forget SFX. Synthesized; no asset deps. Safe to call anywhere. */
  static playSfx(key: SfxKey): void {
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    switch (key) {
      case 'ropeFire':   this.synthRopeFire(ctx); break;
      case 'ropeAttach': this.synthRopeAttach(ctx); break;
      case 'celebrate':  this.synthCelebrate(ctx); break;
    }
  }

  // ── Internals: AudioContext ──────────────────────────────────────────────

  private static getCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.ctxFailed) return null;
    if (typeof window === 'undefined') return null;
    try {
      const Ctor =
        (window as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.ctxFailed = true;
        return null;
      }
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.baseVolume;
      this.masterGain.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      this.ctxFailed = true;
      return null;
    }
  }

  private static effectiveMusicVolume(): number {
    return this.isDucked ? this.baseVolume * 0.4 : this.baseVolume;
  }

  private static stopFileMusic(): void {
    if (!this.fileMusic) return;
    try { (this.fileMusic as unknown as { stop: () => void }).stop(); } catch { /* */ }
    this.fileMusic = undefined;
    this.fileMusicKey = undefined;
  }

  // ── Internals: synth drone ───────────────────────────────────────────────

  private static startSynthDrone(key: MusicKey): void {
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    this.stopSynthDrone(0.4);

    // Soft pad: two oscillators a 5th apart, lowpass, slow LFO on cutoff.
    const baseFreq = key === 'game' ? 110 : 174.61;        // A2 vs F3
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = baseFreq;
    osc2.frequency.value = baseFreq * 1.5;                   // perfect fifth

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = key === 'game' ? 360 : 700;
    filter.Q.value = 0.6;

    // LFO modulating filter cutoff for slow movement
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = key === 'game' ? 0.07 : 0.18;
    lfoGain.gain.value = key === 'game' ? 140 : 220;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const droneGain = ctx.createGain();
    const target = key === 'game' ? 0.20 : 0.30;
    droneGain.gain.setValueAtTime(0, ctx.currentTime);
    droneGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 1.4);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    lfo.start();

    this.currentDrone = {
      oscillators: [osc1, osc2, lfo],
      gain: droneGain,
      others: [filter, lfoGain],
    };
  }

  private static stopSynthDrone(fadeSeconds = 0.4): void {
    if (!this.currentDrone || !this.ctx) return;
    const { oscillators, gain, others } = this.currentDrone;
    const t = this.ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    } catch { /* */ }
    const stopAt = (t + fadeSeconds + 0.05) * 1000;
    setTimeout(() => {
      for (const o of oscillators) {
        try { o.stop(); } catch { /* */ }
        try { o.disconnect(); } catch { /* */ }
      }
      for (const n of others) {
        try { n.disconnect(); } catch { /* */ }
      }
      try { gain.disconnect(); } catch { /* */ }
    }, Math.max(0, stopAt - performance.now()));
    this.currentDrone = null;
  }

  // ── Internals: SFX ───────────────────────────────────────────────────────

  /** Cable whip: short bandpass-swept noise burst — the rope leaving your hand. */
  private static synthRopeFire(ctx: AudioContext): void {
    const t0 = ctx.currentTime;
    const dur = 0.13;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 2;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = 5;
    filt.frequency.setValueAtTime(2200, t0);
    filt.frequency.exponentialRampToValueAtTime(380, t0 + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    noise.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain!);
    noise.start(t0);
    noise.stop(t0 + dur);
  }

  /** Anchor thunk: low square swept down + lowpass body — the hook biting in. */
  private static synthRopeAttach(ctx: AudioContext): void {
    const t0 = ctx.currentTime;
    const dur = 0.20;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(58, t0 + dur);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 540;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Ignition fanfare: rising 4-note triangle arpeggio — C, G, C', E'. */
  private static synthCelebrate(ctx: AudioContext): void {
    const t0 = ctx.currentTime;
    const notes = [261.63, 392.00, 523.25, 659.25];
    notes.forEach((freq, i) => {
      const start = t0 + i * 0.11;
      const dur = 0.6;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.32, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  }
}
