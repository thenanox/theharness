import * as Phaser from 'phaser';
import { THEME } from '../theme';

export class VisualFX {
  private readonly scene: Phaser.Scene;
  private jitterSeed = 1337;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ── RNG ──────────────────────────────────────────────────────────────────

  private rng(): number {
    let x = this.jitterSeed | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.jitterSeed = x;
    return (x >>> 0) / 0xffffffff;
  }

  reseed(seed: number): void { this.jitterSeed = seed | 0 || 1; }

  // ── Screen backdrop (oscilloscope) ────────────────────────────────────────

  paintScreenBackdrop(worldW: number, worldH: number): void {
    // Dark fill
    this.scene.add
      .rectangle(worldW / 2, worldH / 2, worldW, worldH, THEME.palette.screenBg)
      .setDepth(-100).setScrollFactor(0.15);

    // Faint oscilloscope reference grid
    const grid = this.scene.add.graphics().setDepth(-99).setScrollFactor(0.15);
    const cell = 40;
    grid.lineStyle(1, 0x3aff6a, 0.04);
    for (let x = 0; x <= worldW; x += cell) grid.lineBetween(x, 0, x, worldH);
    for (let y = 0; y <= worldH; y += cell) grid.lineBetween(0, y, worldW, y);
  }

  /** One-time CRT scanline overlay — call once in create(). */
  paintScanlines(viewportW: number, viewportH: number): void {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(9000);
    g.fillStyle(0x000000, 0.10);
    for (let y = 0; y < viewportH; y += 3) g.fillRect(0, y, viewportW, 1);
  }

  /** Per-frame film grain — call with a persistent Graphics (clear each frame). */
  paintGrain(gfx: Phaser.GameObjects.Graphics, viewportW: number, viewportH: number, phosphorColor: number): void {
    gfx.clear();
    gfx.fillStyle(phosphorColor, 0.04);
    for (let i = 0; i < 200; i++) {
      gfx.fillRect((Math.random() * viewportW) | 0, (Math.random() * viewportH) | 0, 1, 1);
    }
  }

  /** Bottom-of-viewport fade to screen bg. */
  paintBottomFog(viewportW: number, viewportH: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(50);
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * 0.6;
      g.fillStyle(THEME.palette.screenBg, a);
      g.fillRect(0, viewportH - (80 - i) * 2, viewportW, 2);
    }
    return g;
  }

  // ── Platform slab (phosphor wireframe) ───────────────────────────────────

  /**
   * Draws a phosphor wireframe slab. Draw in white so setTint() can recolor
   * it when zones change. Returns the Graphics object for tinting.
   */
  paintPhosphorSlab(
    x: number, y: number, w: number, h: number, seed = 0,
  ): Phaser.GameObjects.Graphics {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics();
    g.setPosition(x, y).setDepth(-10);
    const r = Math.min(w, h) * 0.08;

    // Glow pass
    g.lineStyle(6, 0xffffff, 0.12);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    // Core line
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    // Hot corner dots
    g.fillStyle(0xffffff, 0.55);
    const hx = w / 2, hy = h / 2;
    for (const [cx, cy] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]] as const) {
      g.fillCircle(cx, cy, 1.8);
    }
    return g;
  }

  // ── Machine parallax (oscilloscope outlines) ──────────────────────────────

  paintMachineParallax(worldW: number, worldH: number): void {
    this.reseed(5279);
    const farLayer  = this.scene.add.graphics().setDepth(-80).setScrollFactor(0.3, 0.8);
    const midLayer  = this.scene.add.graphics().setDepth(-70).setScrollFactor(0.45, 0.85);
    const nearLayer = this.scene.add.graphics().setDepth(-60).setScrollFactor(0.6, 0.9);

    // Far: smokestack outlines
    farLayer.lineStyle(1.5, THEME.palette.phosphorBase, 0.22);
    const stackCount = Math.ceil(worldW / 160);
    for (let i = 0; i < stackCount; i++) {
      const cx = i * 160 + this.rng() * 60;
      const w = 44 + this.rng() * 22;
      const h = 200 + this.rng() * 240;
      this.drawStackOutline(farLayer, cx, worldH - 40, w, h);
    }

    // Mid: horizontal pipe conduits + vertical columns
    midLayer.lineStyle(1, THEME.palette.inkMid, 0.25);
    for (let i = 0; i < 7; i++) {
      const y = (worldH / 7) * i + 120 + this.rng() * 80;
      midLayer.lineBetween(0, y, worldW, y);
      midLayer.lineBetween(0, y + 6, worldW, y + 6);
    }
    for (let i = 0; i < 4; i++) {
      const x = (worldW / 4) * i + 40 + this.rng() * 30;
      midLayer.lineBetween(x, 0, x, worldH);
    }

    // Near: dead gear outlines
    const cogCount = Math.ceil(worldW / 380);
    for (let i = 0; i < cogCount; i++) {
      const cx = i * 380 + 140 + this.rng() * 90;
      const cy = worldH - 120 - this.rng() * 220;
      const r  = 70 + this.rng() * 60;
      this.drawGearOutline(nearLayer, cx, cy, r, THEME.palette.phosphorBase, 0.28);
    }
  }

  private drawStackOutline(g: Phaser.GameObjects.Graphics, cx: number, baseY: number, w: number, h: number): void {
    const body = w * 0.75;
    g.strokeRoundedRect(cx - body / 2, baseY - h, body, h, body * 0.18);
    g.strokeRoundedRect(cx - w / 2,    baseY - h - 8, w, 10, 3);
  }

  private drawGearOutline(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, color: number, alpha: number): void {
    g.lineStyle(1.5, color, alpha);
    const teeth = 10, outer = radius, inner = radius * 0.78;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      g.strokeCircle(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer, radius * 0.11);
    }
    g.strokeCircle(cx, cy, inner);
    g.strokeCircle(cx, cy, radius * 0.22);
    g.lineBetween(cx - inner * 0.9, cy, cx + inner * 0.9, cy);
  }

  // ── Gear silhouette (standalone, centerable for rotation) ─────────────────

  paintGearSilhouette(
    cx: number, cy: number, radius: number,
    into?: Phaser.GameObjects.Graphics,
    color = THEME.palette.phosphorBase,
    alpha = 0.5,
    centered = false,
  ): Phaser.GameObjects.Graphics {
    const g = into ?? this.scene.add.graphics().setDepth(-8);
    const ox = centered ? 0 : cx;
    const oy = centered ? 0 : cy;
    if (centered) g.setPosition(cx, cy);
    this.drawGearOutline(g, ox, oy, radius, color, alpha);
    return g;
  }

  // ── Decorations ───────────────────────────────────────────────────────────

  paintRivetRow(x: number, y: number, w: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-9);
    g.fillStyle(THEME.palette.phosphorBase, 0.35);
    const count = Math.max(3, Math.round(w / 40));
    const pad = 8;
    for (let i = 0; i < count; i++) {
      const rx = x - w / 2 + pad + ((w - pad * 2) * i) / Math.max(1, count - 1);
      g.fillCircle(rx, y, 1.5);
    }
  }

  paintPipeRun(x1: number, y1: number, x2: number, y2: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    g.lineStyle(5, THEME.palette.phosphorBase, 0.18);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(1.5, THEME.palette.phosphorBase, 0.55);
    g.lineBetween(x1, y1, x2, y2);
    g.fillStyle(THEME.palette.phosphorBase, 0.6);
    g.fillCircle(x1, y1, 3.5);
    g.fillCircle(x2, y2, 3.5);
  }

  paintGaugeDial(x: number, y: number, r: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    g.lineStyle(1.5, THEME.palette.phosphorBase, 0.6);
    g.strokeCircle(x, y, r + 2);
    g.strokeCircle(x, y, r);
    g.lineStyle(1, THEME.palette.phosphorBase, 0.4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.lineBetween(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4),
                    x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1));
    }
    const na = Math.PI * (0.85 + this.rng() * 0.25);
    g.lineStyle(1.5, THEME.palette.ember, 0.7);
    g.lineBetween(x, y, x + Math.cos(na) * (r - 3), y + Math.sin(na) * (r - 3));
    g.fillStyle(THEME.palette.phosphorBase, 1);
    g.fillCircle(x, y, 1.5);
  }

  paintSteamVent(x: number, y: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    g.lineStyle(1.5, THEME.palette.phosphorBase, 0.5);
    g.strokeRoundedRect(x - 10, y - 4, 20, 8, 2);
    g.lineStyle(1, THEME.palette.phosphorBase, 0.3);
    g.lineBetween(x - 8, y, x + 8, y);
  }

  // ── Zone vignette ─────────────────────────────────────────────────────────

  paintZoneVignette(gfx: Phaser.GameObjects.Graphics, viewportW: number, viewportH: number, phosphorColor: number, intensity: number): void {
    gfx.clear();
    if (intensity <= 0) return;
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * intensity;
      const inset = i * 4;
      gfx.fillStyle(phosphorColor, a * 0.08);
      gfx.fillRect(0, inset, viewportW, 4);
      gfx.fillRect(0, viewportH - inset - 4, viewportW, 4);
      gfx.fillRect(inset, 0, 4, viewportH);
      gfx.fillRect(viewportW - inset - 4, 0, 4, viewportH);
    }
  }

  // ── Ignition socket (live, call update each frame) ─────────────────────────

  createIgnitionSocket(x: number, y: number): { update(t: number): void; destroy(): void } {
    const g = this.scene.add.graphics().setDepth(0);
    const update = (t: number) => {
      g.clear();
      // Orbiting dots
      g.fillStyle(THEME.palette.phosphorHot, 0.8);
      for (let i = 0; i < 8; i++) {
        const a = t * 0.8 + (i / 8) * Math.PI * 2;
        g.fillCircle(x + Math.cos(a) * 18, y + Math.sin(a) * 18, 2);
      }
      // Heat shimmer columns
      g.fillStyle(THEME.palette.phosphorHot, 0.04);
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 8 + Math.sin(t * 3.1 + i) * 2;
        g.fillRect(x + ox - 1, y - 40, 2, 40);
      }
    };
    return { update, destroy: () => g.destroy() };
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  inkSplash(x: number, y: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (this.rng() - 0.5) * 0.6;
      const speed = 40 + this.rng() * 60;
      const dot = this.scene.add.circle(x, y, 1.2 + this.rng() * 2, THEME.palette.phosphorBase, 0.8);
      dot.setDepth(7);
      this.scene.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed + 40,
        alpha: 0, duration: 420 + this.rng() * 200,
        ease: 'Cubic.easeIn', onComplete: () => dot.destroy(),
      });
    }
  }

  emberFlicker(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const dot = this.scene.add.circle(
        x + (this.rng() - 0.5) * 10, y - this.rng() * 14,
        2 + this.rng() * 2, THEME.palette.ember, 0.9,
      );
      dot.setDepth(7);
      this.scene.tweens.add({
        targets: dot, y: dot.y - 18 - this.rng() * 10, alpha: 0,
        duration: 260 + this.rng() * 160, ease: 'Sine.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  dustPuff(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const dot = this.scene.add.circle(x + (this.rng() - 0.5) * 20, y, 2 + this.rng() * 2, THEME.palette.inkSoft, 0.5);
      dot.setDepth(6);
      this.scene.tweens.add({
        targets: dot, y: y - 10 - this.rng() * 8, alpha: 0, duration: 340,
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Additive ember burst at attach point. */
  emberBurst(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const dot = this.scene.add.circle(x, y, 4 + i * 3, THEME.palette.ember, 0.6 - i * 0.1);
      dot.setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: dot, scaleX: 3 + i, scaleY: 3 + i, alpha: 0,
        duration: 120 + i * 30, ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  steamPuff(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const dot = this.scene.add.circle(x + (this.rng() - 0.5) * 12, y, 4 + i * 2, THEME.palette.inkSoft, 0.5 - i * 0.07);
      dot.setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: dot, scaleX: 2 + i, scaleY: 2 + i, y: y - 30 - i * 10, alpha: 0,
        duration: 600 + i * 80, ease: 'Sine.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ── Ambient drift particle system ─────────────────────────────────────────

  createAmbientDrift(worldW: number): {
    update(playerY: number, dt: number, phosphorColor: number, allEmber?: boolean): void;
    destroy(): void;
  } {
    interface Dot { x: number; y: number; vx: number; vy: number; size: number; isEmber: boolean; phase: number }
    const gfx = this.scene.add.graphics().setDepth(15);
    const pool: Dot[] = [];
    for (let i = 0; i < 35; i++) {
      pool.push({
        x: Math.random() * worldW,
        y: Math.random() * 1200,
        vx: (Math.random() - 0.5) * 10,
        vy: -(8 + Math.random() * 14),
        size: 0.8 + Math.random() * 1.4,
        isEmber: false,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const update = (playerY: number, dt: number, phosphorColor: number, allEmber = false) => {
      const cam = this.scene.cameras.main;
      const visH = cam.height / cam.zoom;
      const wTop = cam.scrollY - 100;
      const wBot = cam.scrollY + visH + 100;

      gfx.clear();
      pool.forEach((p) => {
        p.x += (p.vx + Math.sin(p.phase + playerY * 0.002) * 0.4) * dt;
        p.y += p.vy * dt;
        p.phase += dt * 1.2;
        if (p.y < wTop) {
          p.y = wBot;
          p.x = Math.random() * worldW;
          p.isEmber = allEmber || (playerY < 1200 && Math.random() < 0.08);
        }
        if (p.x < 0) p.x = worldW;
        if (p.x > worldW) p.x = 0;

        const alpha = 0.3 + Math.sin(p.phase) * 0.15;
        const color = p.isEmber ? THEME.palette.ember : phosphorColor;
        gfx.fillStyle(color, alpha * 0.55);
        gfx.fillCircle(p.x, p.y, p.size);
      });
    };
    return { update, destroy: () => gfx.destroy() };
  }

  // ── Aim guide ─────────────────────────────────────────────────────────────

  drawAimGuide(
    gfx: Phaser.GameObjects.Graphics,
    sx: number, sy: number, tx: number, ty: number,
    maxLen: number, active: boolean,
  ): void {
    gfx.clear();
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const nx = dx / dist, ny = dy / dist;
    const len = Math.min(maxLen, dist);
    const color = active ? THEME.palette.rope : THEME.palette.phosphorBase;
    const alpha = active ? 0.8 : 0.3;
    gfx.lineStyle(active ? 2 : 1, color, alpha);
    const dash = 8, gap = 6;
    let d = 0;
    while (d < len) {
      const d2 = Math.min(d + dash, len);
      gfx.lineBetween(sx + nx * d, sy + ny * d, sx + nx * d2, sy + ny * d2);
      d = d2 + gap;
    }
    gfx.fillStyle(color, alpha);
    gfx.fillCircle(sx + nx * len, sy + ny * len, active ? 3 : 2);
  }

  // ── Rope drawing (catenary + ember glow) ──────────────────────────────────

  private quadBezierPts(sx: number, sy: number, cx: number, cy: number, ex: number, ey: number, steps: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push({ x: u * u * sx + 2 * u * t * cx + t * t * ex, y: u * u * sy + 2 * u * t * cy + t * t * ey });
    }
    return pts;
  }

  drawEmberRope(
    glowGfx: Phaser.GameObjects.Graphics,
    coreGfx: Phaser.GameObjects.Graphics,
    sx: number, sy: number, ex: number, ey: number,
    nominalLength?: number,
  ): void {
    glowGfx.clear();
    coreGfx.clear();

    const dist = Math.hypot(ex - sx, ey - sy);
    const slack = nominalLength ? Math.max(0, nominalLength - dist) : 0;
    const sagAmt = Math.min(28, slack * 0.55);
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2 + sagAmt;

    const pts = this.quadBezierPts(sx, sy, mx, my, ex, ey, 12);

    glowGfx.lineStyle(8, THEME.palette.ropeGlow, 0.22);
    for (let i = 1; i < pts.length; i++) glowGfx.lineBetween(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y);
    glowGfx.lineStyle(4, THEME.palette.rope, 0.5);
    for (let i = 1; i < pts.length; i++) glowGfx.lineBetween(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y);

    coreGfx.lineStyle(1.5, 0xffffff, 1);
    for (let i = 1; i < pts.length; i++) coreGfx.lineBetween(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y);
  }

  // ── Phosphor persistence trail ────────────────────────────────────────────

  drawPhosphorTrail(gfx: Phaser.GameObjects.Graphics, positions: { x: number; y: number }[], phosphorColor: number): void {
    gfx.clear();
    if (positions.length < 2) return;
    for (let i = 0; i < positions.length; i++) {
      const a = (1 - i / positions.length) * 0.22;
      gfx.fillStyle(phosphorColor, a);
      gfx.fillRect(positions[i].x - 10, positions[i].y - 14, 20, 28);
    }
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  drawProgressBar(gfx: Phaser.GameObjects.Graphics, progress: number, viewportH: number, phosphorColor: number, zoneName: string): void {
    gfx.clear();
    const barX = 6, barW = 6;
    const barTop = viewportH * 0.1, barBot = viewportH * 0.9;
    const barH = barBot - barTop;

    // Background
    gfx.fillStyle(phosphorColor, 0.15);
    gfx.fillRoundedRect(barX, barTop, barW, barH, 3);

    // Fill
    const fillH = barH * Math.max(0, Math.min(1, progress));
    gfx.fillStyle(phosphorColor, 0.75);
    gfx.fillRoundedRect(barX, barBot - fillH, barW, fillH, 3);

    // Zone notches at y ratios: 4200/5000, 3200/5000, 2200/5000, 1200/5000
    const notches = [4200, 3200, 2200, 1200].map(y => y / 5000);
    gfx.fillStyle(phosphorColor, 0.4);
    for (const n of notches) {
      const ny = barBot - barH * (1 - n);
      gfx.fillRect(barX - 2, ny - 0.5, barW + 4, 1);
    }
    void zoneName;
  }

  // ── Win color reveal (gradient veil) ──────────────────────────────────────

  playWinColorReveal(viewportW: number, viewportH: number, onDone?: () => void): void {
    const veil = this.scene.add.graphics().setScrollFactor(0).setDepth(9999);
    veil.setAlpha(0);

    // Draw a vertical gradient: winSkyBot at bottom, winSkyTop at top
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.round(((THEME.palette.winSkyTop >> 16) & 0xff) * (1 - t) + ((THEME.palette.winSkyBot >> 16) & 0xff) * t);
      const g = Math.round(((THEME.palette.winSkyTop >> 8) & 0xff) * (1 - t) + ((THEME.palette.winSkyBot >> 8) & 0xff) * t);
      const b = Math.round(((THEME.palette.winSkyTop) & 0xff) * (1 - t) + ((THEME.palette.winSkyBot) & 0xff) * t);
      const color = (r << 16) | (g << 8) | b;
      veil.fillStyle(color, 1);
      veil.fillRect(0, (i / steps) * viewportH, viewportW, viewportH / steps + 1);
    }

    this.scene.tweens.add({
      targets: veil, alpha: { from: 0, to: 1 }, duration: 1800,
      ease: 'Cubic.easeInOut', onComplete: () => { if (onDone) onDone(); },
    });
  }

  // ── Color math ────────────────────────────────────────────────────────────

  lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  }
}
