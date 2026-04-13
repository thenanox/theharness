import * as Phaser from 'phaser';
import { THEME } from '../theme';

/**
 * "Ink & Ember" — procedural visual helpers.
 *
 * Everything the player sees that isn't a tilemap or a game entity is
 * drawn here: brushstroke tile slabs, parallax tower silhouettes,
 * paper-grain overlay, ink-splash particles, ember glow, and the
 * win-moment colour reveal. Nothing requires an artist.
 *
 * All methods accept a Phaser.Scene so this class owns no long-lived
 * state the scene doesn't also own. Destroys clean up automatically
 * when the scene shuts down.
 */
export class VisualFX {
  private readonly scene: Phaser.Scene;

  /** Seed used for consistent brushstroke jitter per slab. */
  private jitterSeed = 1337;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ----- deterministic jitter -----

  private rng(): number {
    // xorshift32 — cheap and stable so slabs don't shimmer between frames.
    let x = this.jitterSeed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.jitterSeed = x;
    return ((x >>> 0) / 0xffffffff);
  }

  /** Reset RNG so brush jitter is stable across rebuilds. */
  reseed(seed: number): void {
    this.jitterSeed = seed | 0 || 1;
  }

  // ----- paper backdrop -----

  /**
   * Full-screen gradient fill for the ink-wash sky, painted once into
   * a TileSprite so it scrolls with the camera. Call once on scene create.
   */
  paintPaperBackdrop(worldW: number, worldH: number): Phaser.GameObjects.Rectangle {
    const bg = this.scene.add
      .rectangle(worldW / 2, worldH / 2, worldW, worldH, THEME.palette.background)
      .setDepth(-100)
      .setScrollFactor(0.15);
    return bg;
  }

  /**
   * A soft fog fade at the bottom of the viewport so depths disappear
   * into bone-white paper. Pinned to the camera, not the world.
   */
  paintBottomFog(viewportW: number, viewportH: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(50);
    const grad = 80;
    for (let i = 0; i < grad; i++) {
      const a = (i / grad) * 0.35;
      g.fillStyle(THEME.palette.fogLow, a);
      g.fillRect(0, viewportH - (grad - i) * 2, viewportW, 2);
    }
    return g;
  }

  // ----- parallax tower silhouettes -----

  /**
   * Two layers of distant brushstroke columns. Drawn into Graphics
   * objects with scrollFactor < 1 so they parallax behind the arena.
   */
  paintParallaxSilhouettes(worldW: number, worldH: number): void {
    this.reseed(7919);
    const farLayer = this.scene.add.graphics().setDepth(-80).setScrollFactor(0.3, 0.8);
    const nearLayer = this.scene.add.graphics().setDepth(-60).setScrollFactor(0.6, 0.9);

    // Far columns — soft, pale grey
    farLayer.fillStyle(THEME.palette.inkGhost, 0.45);
    const farCount = Math.ceil(worldW / 120);
    for (let i = 0; i < farCount; i++) {
      const cx = i * 120 + this.rng() * 40;
      const w = 70 + this.rng() * 60;
      const h = 180 + this.rng() * 260;
      this.drawBrushColumn(farLayer, cx, worldH - 40, w, h);
    }

    // Near columns — darker, thinner, more jitter
    nearLayer.fillStyle(THEME.palette.inkSoft, 0.7);
    const nearCount = Math.ceil(worldW / 80);
    for (let i = 0; i < nearCount; i++) {
      const cx = i * 80 + this.rng() * 30;
      const w = 40 + this.rng() * 30;
      const h = 120 + this.rng() * 180;
      this.drawBrushColumn(nearLayer, cx, worldH - 30, w, h);
    }
  }

  /** Draws a single brushstroke column — three overlapping rounded rects. */
  private drawBrushColumn(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    baseY: number,
    width: number,
    height: number,
  ): void {
    // main body
    g.fillRoundedRect(cx - width / 2, baseY - height, width, height, width * 0.25);
    // thin accent stroke on the left edge
    g.fillRoundedRect(cx - width / 2, baseY - height, width * 0.2, height, width * 0.08);
    // a "wet" drip at the top
    const dripW = width * 0.35;
    const dripH = 18 + this.rng() * 12;
    g.fillRoundedRect(cx - dripW / 2, baseY - height - dripH + 4, dripW, dripH, dripW * 0.4);
  }

  // ----- machine decoration (theme: MACHINES / Derelict Engine) -----

  /**
   * Parallax replacement for the Machines build — two layers of giant
   * dead gears and smokestacks rendered as brushstroke silhouettes.
   * Same scroll factors as paintParallaxSilhouettes; both can coexist.
   */
  paintMachineParallax(worldW: number, worldH: number): void {
    this.reseed(5279);
    const farLayer = this.scene.add.graphics().setDepth(-80).setScrollFactor(0.3, 0.8);
    const nearLayer = this.scene.add.graphics().setDepth(-60).setScrollFactor(0.6, 0.9);

    // Far: tall smokestacks in pale ink. Cold — no smoke.
    farLayer.fillStyle(THEME.palette.inkGhost, 0.42);
    const stackCount = Math.ceil(worldW / 160);
    for (let i = 0; i < stackCount; i++) {
      const cx = i * 160 + this.rng() * 60;
      const w = 44 + this.rng() * 22;
      const h = 200 + this.rng() * 240;
      this.drawSmokestack(farLayer, cx, worldH - 40, w, h);
    }

    // Near: a handful of huge dead cog silhouettes behind the arena.
    const cogCount = Math.ceil(worldW / 380);
    for (let i = 0; i < cogCount; i++) {
      const cx = i * 380 + 140 + this.rng() * 90;
      const cy = worldH - 120 - this.rng() * 220;
      const r = 70 + this.rng() * 60;
      this.paintGearSilhouette(cx, cy, r, nearLayer, THEME.palette.inkSoft, 0.55);
    }
  }

  /**
   * A single smokestack — wider base, narrow neck, little cap.
   * Used by paintMachineParallax for the far layer.
   */
  private drawSmokestack(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    baseY: number,
    width: number,
    height: number,
  ): void {
    const body = width * 0.75;
    g.fillRoundedRect(cx - body / 2, baseY - height, body, height, body * 0.18);
    // flared cap
    const cap = width;
    g.fillRoundedRect(cx - cap / 2, baseY - height - 8, cap, 10, 3);
    // faint soot drip on one side
    const dripH = 10 + this.rng() * 8;
    g.fillRoundedRect(cx + body / 2 - 2, baseY - height + 12, 2, dripH, 1);
  }

  /**
   * Brushstroke cog outline — 8–12 teeth, a hub, an axle hole.
   * Paints into the given Graphics (so it can go in a parallax layer)
   * or creates its own if none is passed. Deterministic per-seed.
   */
  paintGearSilhouette(
    cx: number,
    cy: number,
    radius: number,
    into?: Phaser.GameObjects.Graphics,
    color: number = THEME.palette.inkSoft,
    alpha: number = 0.7,
  ): Phaser.GameObjects.Graphics {
    const g = into ?? this.scene.add.graphics().setDepth(-8);
    g.fillStyle(color, alpha);

    const teeth = 10;
    const inner = radius * 0.78;
    const outer = radius;
    // Draw teeth as a stacked ring of small rects rotated around the center.
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tx = cx + Math.cos(a) * outer;
      const ty = cy + Math.sin(a) * outer;
      g.fillCircle(tx, ty, radius * 0.13);
    }
    // Main disk
    g.fillCircle(cx, cy, inner);
    // Axle hole punched as background paint
    g.fillStyle(THEME.palette.background, alpha * 0.9);
    g.fillCircle(cx, cy, radius * 0.22);
    // Single arm across the hub for detail
    g.fillStyle(color, alpha);
    g.fillRect(cx - inner * 0.9, cy - 1.5, inner * 1.8, 3);

    return g;
  }

  /**
   * A horizontal row of rivets — 4-7 small dark dots evenly spaced across
   * the top or bottom edge of an iron slab. Call after paintBrushSlab.
   */
  paintRivetRow(x: number, y: number, w: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-9);
    g.fillStyle(THEME.palette.inkDeep, 0.85);
    const count = Math.max(3, Math.round(w / 40));
    const pad = 8;
    for (let i = 0; i < count; i++) {
      const rx = x - w / 2 + pad + ((w - pad * 2) * i) / Math.max(1, count - 1);
      g.fillCircle(rx, y, 1.8);
      // thin highlight dot
      g.fillStyle(THEME.palette.inkGhost, 0.5);
      g.fillCircle(rx - 0.6, y - 0.6, 0.7);
      g.fillStyle(THEME.palette.inkDeep, 0.85);
    }
  }

  /**
   * A dead pipe run between two anchor points. Two parallel ink strokes
   * plus a single hot-white highlight streak. Purely decorative.
   */
  paintPipeRun(x1: number, y1: number, x2: number, y2: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    // outer stroke
    g.lineStyle(6, THEME.palette.inkMid, 0.85);
    g.lineBetween(x1, y1, x2, y2);
    // inner stroke (creates the "pipe" double-line feel)
    g.lineStyle(3, THEME.palette.inkSoft, 0.9);
    g.lineBetween(x1, y1, x2, y2);
    // hot-white highlight along one side
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    g.lineStyle(1, 0xf4efe6, 0.9);
    g.lineBetween(x1 + nx * 0.8, y1 + ny * 0.8, x2 + nx * 0.8, y2 + ny * 0.8);
    // joint caps
    g.fillStyle(THEME.palette.inkDeep, 0.9);
    g.fillCircle(x1, y1, 4);
    g.fillCircle(x2, y2, 4);
  }

  /**
   * Frozen gauge dial — an ink circle with tick marks and a single
   * dead ember needle. Decoration only; no interaction.
   */
  paintGaugeDial(x: number, y: number, r: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    // bezel
    g.fillStyle(THEME.palette.inkDeep, 0.9);
    g.fillCircle(x, y, r + 2);
    // face
    g.fillStyle(THEME.palette.background, 0.95);
    g.fillCircle(x, y, r);
    // tick marks
    g.lineStyle(1, THEME.palette.inkMid, 0.85);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const ix = x + Math.cos(a) * (r - 4);
      const iy = y + Math.sin(a) * (r - 4);
      const ox = x + Math.cos(a) * (r - 1);
      const oy = y + Math.sin(a) * (r - 1);
      g.lineBetween(ix, iy, ox, oy);
    }
    // frozen needle — points down-left, dead
    const na = Math.PI * (0.85 + this.rng() * 0.25);
    const nxp = x + Math.cos(na) * (r - 3);
    const nyp = y + Math.sin(na) * (r - 3);
    g.lineStyle(1.5, THEME.palette.ember, 0.7);
    g.lineBetween(x, y, nxp, nyp);
    g.fillStyle(THEME.palette.inkDeep, 1);
    g.fillCircle(x, y, 1.5);
  }

  /**
   * A small wall-mounted steam vent — a dead slit in the ink.
   * On the win-color-reveal this could optionally emit a warm puff
   * but for now it's static decoration.
   */
  paintSteamVent(x: number, y: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    g.fillStyle(THEME.palette.inkDeep, 0.9);
    g.fillRoundedRect(x - 10, y - 4, 20, 8, 2);
    // internal slit
    g.fillStyle(THEME.palette.background, 0.85);
    g.fillRect(x - 8, y - 1, 16, 2);
    // two faint ember traces suggesting this vent was once hot
    g.fillStyle(THEME.palette.ember, 0.45);
    g.fillCircle(x - 4, y - 6 - this.rng() * 2, 1);
    g.fillCircle(x + 3, y - 9 - this.rng() * 2, 1);
  }

  // ----- brushstroke tile / slab -----

  /**
   * Paints an ink-wash slab at (x,y) with the given dimensions and color.
   * Use this instead of a plain rectangle to get the hand-drawn feel.
   * Returns the owning Graphics so the caller can add physics if needed.
   */
  paintBrushSlab(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    seed = 0,
  ): Phaser.GameObjects.Graphics {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics();
    g.setPosition(x, y).setDepth(-10);

    // Main slab body
    g.fillStyle(color, 0.92);
    const r = Math.min(w, h) * 0.08;
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    // Ink-edge darken — a slightly darker offset slab underneath
    const darker = this.darken(color, 0.25);
    g.fillStyle(darker, 0.35);
    g.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);

    // Streak highlights — thin brush strokes
    g.fillStyle(this.lighten(color, 0.15), 0.4);
    const streakCount = Math.max(2, Math.floor(w / 60));
    for (let i = 0; i < streakCount; i++) {
      const sx = -w / 2 + (i + 0.5) * (w / streakCount) + (this.rng() - 0.5) * 8;
      const sy = -h / 2 + 3 + this.rng() * (h - 6);
      const sw = 20 + this.rng() * 30;
      g.fillRect(sx, sy, sw, 1);
    }

    // A couple of random ink dots (wet-brush feel)
    g.fillStyle(darker, 0.6);
    for (let i = 0; i < 3; i++) {
      const dx = (this.rng() - 0.5) * w;
      const dy = (this.rng() - 0.5) * h;
      g.fillCircle(dx, dy, 0.8 + this.rng() * 1.2);
    }

    return g;
  }

  // ----- particles -----

  /** Tiny black ink droplets on hook stick. Gravity-driven, auto-destruct. */
  inkSplash(x: number, y: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (this.rng() - 0.5) * 0.6;
      const speed = 40 + this.rng() * 60;
      const size = 1.2 + this.rng() * 2;
      const dot = this.scene.add.circle(x, y, size, THEME.palette.inkDeep, 0.9);
      dot.setDepth(7);

      const tx = x + Math.cos(angle) * speed;
      const ty = y + Math.sin(angle) * speed - 10;
      this.scene.tweens.add({
        targets: dot,
        x: tx,
        y: ty + 40, // a touch of gravity
        alpha: 0,
        duration: 420 + this.rng() * 200,
        ease: 'Cubic.easeIn',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Warm ember flicker on the player on detach. */
  emberFlicker(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const dx = (this.rng() - 0.5) * 10;
      const dy = -this.rng() * 14;
      const dot = this.scene.add.circle(x + dx, y + dy, 2 + this.rng() * 2, THEME.palette.ember, 0.9);
      dot.setDepth(7);
      this.scene.tweens.add({
        targets: dot,
        y: dot.y - 18 - this.rng() * 10,
        alpha: 0,
        duration: 260 + this.rng() * 160,
        ease: 'Sine.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Grey dust puff on hard landings. */
  dustPuff(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const dx = (this.rng() - 0.5) * 20;
      const dot = this.scene.add.circle(x + dx, y, 2 + this.rng() * 2, THEME.palette.inkSoft, 0.6);
      dot.setDepth(6);
      this.scene.tweens.add({
        targets: dot,
        y: y - 10 - this.rng() * 8,
        alpha: 0,
        duration: 340,
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ----- aim guide -----

  /**
   * Thin dashed guide from player → aim point. Redrawn every frame the
   * rope is idle or the player is pre-aiming on mobile.
   */
  drawAimGuide(
    gfx: Phaser.GameObjects.Graphics,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    maxLen: number,
    active: boolean,
  ): void {
    gfx.clear();
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const len = Math.min(maxLen, dist);
    const color = active ? THEME.palette.rope : THEME.palette.inkGhost;
    const alpha = active ? 0.8 : 0.25;
    const dash = 8;
    const gap = 6;
    gfx.lineStyle(active ? 2 : 1, color, alpha);
    let d = 0;
    while (d < len) {
      const x1 = sx + nx * d;
      const y1 = sy + ny * d;
      const d2 = Math.min(d + dash, len);
      const x2 = sx + nx * d2;
      const y2 = sy + ny * d2;
      gfx.lineBetween(x1, y1, x2, y2);
      d = d2 + gap;
    }

    // target reticle at the end of the dashed line
    const ex = sx + nx * len;
    const ey = sy + ny * len;
    gfx.fillStyle(color, alpha);
    gfx.fillCircle(ex, ey, active ? 3 : 2);
  }

  // ----- rope drawing (ember glow + hot core) -----

  /** Draws the rope line with a two-pass additive ember glow. */
  drawEmberRope(
    glowGfx: Phaser.GameObjects.Graphics,
    coreGfx: Phaser.GameObjects.Graphics,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
  ): void {
    glowGfx.clear();
    coreGfx.clear();
    // Soft outer glow
    glowGfx.lineStyle(8, THEME.palette.ropeGlow, 0.22);
    glowGfx.lineBetween(sx, sy, ex, ey);
    glowGfx.lineStyle(4, THEME.palette.rope, 0.5);
    glowGfx.lineBetween(sx, sy, ex, ey);
    // Hot core
    coreGfx.lineStyle(1.5, 0xffffff, 1);
    coreGfx.lineBetween(sx, sy, ex, ey);
  }

  // ----- win color reveal -----

  /**
   * Fades the whole screen from ink-grey to full warm colour over ~2s.
   * Caller should pause input while this plays.
   */
  playWinColorReveal(viewportW: number, viewportH: number, onDone?: () => void): void {
    const veil = this.scene.add.graphics().setScrollFactor(0).setDepth(9999);
    veil.fillStyle(THEME.palette.winSkyTop, 0);
    veil.fillRect(0, 0, viewportW, viewportH);

    this.scene.tweens.add({
      targets: veil,
      alpha: { from: 0, to: 1 },
      duration: 1800,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        if (onDone) onDone();
      },
    });
  }

  // ----- color math helpers -----

  private darken(hex: number, amt: number): number {
    const r = Math.max(0, ((hex >> 16) & 0xff) * (1 - amt));
    const g = Math.max(0, ((hex >> 8) & 0xff) * (1 - amt));
    const b = Math.max(0, (hex & 0xff) * (1 - amt));
    return (r << 16) | (g << 8) | b;
  }

  private lighten(hex: number, amt: number): number {
    const r = Math.min(255, ((hex >> 16) & 0xff) + 255 * amt);
    const g = Math.min(255, ((hex >> 8) & 0xff) + 255 * amt);
    const b = Math.min(255, (hex & 0xff) + 255 * amt);
    return (r << 16) | (g << 8) | b;
  }
}
