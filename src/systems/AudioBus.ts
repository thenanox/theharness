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

interface SequencerHandle {
  key: MusicKey;
  /** setTimeout id, used to cancel future ticks. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Current step, monotonically increasing; modulo pattern length to index. */
  step: number;
  /** Bus gain — fades in on start, fades out on stop, ducked under SFX. */
  gain: GainNode;
}

export class AudioBus {
  private static fileMusic?: Phaser.Sound.BaseSound;
  private static fileMusicKey?: MusicKey;
  private static baseVolume = 0.55;
  private static isDucked = false;
  private static muted = false;

  private static ctx: AudioContext | null = null;
  private static ctxFailed = false;
  private static masterGain: GainNode | null = null;
  private static currentSeq: SequencerHandle | null = null;

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
      this.stopSequencer(0.6);
      if (this.fileMusicKey === key && this.fileMusic && (this.fileMusic as { isPlaying?: boolean }).isPlaying) return;
      this.stopFileMusic();
      try {
        this.fileMusic = scene.sound.add(fileKey, { loop: true, volume: this.effectiveMusicVolume() });
        (this.fileMusic as { play: () => void }).play();
        this.fileMusicKey = key;
      } catch {
        // Autoplay lockout — caller will retry on next user gesture.
        this.startSequencer(key);
      }
      return;
    }

    // No file → synthesized rhythmic loop
    this.stopFileMusic();
    this.startSequencer(key);
  }

  /** Toggle mute. Persists nothing — caller is responsible for storage. */
  static setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : (this.isDucked ? this.baseVolume * 0.4 : this.baseVolume);
    }
    if (this.fileMusic) {
      (this.fileMusic as unknown as { volume: number }).volume = muted ? 0 : this.effectiveMusicVolume();
    }
  }

  static isMuted(): boolean {
    return this.muted;
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

  // ── Internals: rhythmic sequencer ────────────────────────────────────────
  //
  // Replaces the old static "drone hum" with a soft, slow-tempo arpeggio
  // pattern. Each tick schedules a couple of short triangle/sine notes via
  // `AudioContext` time, then re-arms a setTimeout for the next 16th note.
  //
  // PATTERNS
  //   game (70 BPM, 8-step / ~3.4s loop, A minor 7):
  //     bass A2 ▍ . . . ▍ . . .          (steps 0,4)
  //     arp  A3 . C4 . E4 . G3 .          (every 2nd step)
  //     hat   .  ♪ .  ♪ .  ♪ .  ♪          (off-beats, very low volume)
  //
  //   win (96 BPM, 8-step / ~2.5s loop, C major 7):
  //     bass C3 ▍ . . . ▍ . . .
  //     arp  C4 . E4 . G4 . C5 .
  //     hat  .  ♪ .  ♪ .  ♪ .  ♪
  //
  // The sequencer uses `setTimeout` for the per-step heartbeat (jitter is
  // unnoticeable at this tempo) and `AudioContext.currentTime` for the
  // sample-accurate envelope of each note.

  private static startSequencer(key: MusicKey): void {
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    this.stopSequencer(0.4);

    const seqGain = ctx.createGain();
    seqGain.gain.setValueAtTime(0, ctx.currentTime);
    seqGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.6);
    seqGain.connect(this.masterGain);

    const handle: SequencerHandle = { key, timer: null, step: 0, gain: seqGain };
    this.currentSeq = handle;

    const bpm = key === 'game' ? 70 : 96;
    const stepMs = 60_000 / bpm / 2; // 8th-note grid

    const tick = () => {
      if (this.currentSeq !== handle) return; // we got replaced / stopped
      this.playStep(key, handle.step % 8, handle.gain);
      handle.step++;
      handle.timer = setTimeout(tick, stepMs);
    };
    tick();
  }

  private static stopSequencer(fadeSeconds = 0.4): void {
    if (!this.currentSeq || !this.ctx) return;
    const seq = this.currentSeq;
    this.currentSeq = null;
    if (seq.timer) clearTimeout(seq.timer);

    const t = this.ctx.currentTime;
    try {
      seq.gain.gain.cancelScheduledValues(t);
      seq.gain.gain.setValueAtTime(seq.gain.gain.value, t);
      seq.gain.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    } catch { /* */ }
    setTimeout(() => {
      try { seq.gain.disconnect(); } catch { /* */ }
    }, (fadeSeconds + 0.1) * 1000);
  }

  private static playStep(key: MusicKey, step: number, busGain: GainNode): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (key === 'game') {
      // A minor seven — calm, ambient
      const arp = [220.00, 261.63, 329.63, 196.00]; // A3 C4 E4 G3
      if (step === 0 || step === 4) this.playNote(110.00, 0.42, 0.18, 'sine', busGain);          // A2 bass
      if (step % 2 === 0)           this.playNote(arp[(step >> 1) % arp.length], 0.36, 0.12, 'triangle', busGain);
      if (step % 2 === 1)           this.playHat(0.05, busGain);
    } else {
      // C major seven — brighter for the victory loop
      const arp = [261.63, 329.63, 392.00, 523.25]; // C4 E4 G4 C5
      if (step === 0 || step === 4) this.playNote(130.81, 0.34, 0.22, 'sine', busGain);          // C3 bass
      if (step % 2 === 0)           this.playNote(arp[(step >> 1) % arp.length], 0.30, 0.16, 'triangle', busGain);
      if (step % 2 === 1)           this.playHat(0.07, busGain);
    }
  }

  /** Soft note: fast attack, exponential decay, lowpass-shaped. */
  private static playNote(
    freq: number, durSec: number, vol: number,
    type: OscillatorType, busGain: GainNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1400;
    filt.Q.value = 0.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);

    osc.connect(filt);
    filt.connect(g);
    g.connect(busGain);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.05);
  }

  /** Off-beat tick: very short bandpass-noise click. */
  private static playHat(vol: number, busGain: GainNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.06;

    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 5000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    noise.connect(filt);
    filt.connect(g);
    g.connect(busGain);
    noise.start(t0);
    noise.stop(t0 + dur);
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
