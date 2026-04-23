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
   * Draws a phosphor wireframe slab with industrial plating detail.
   * Orientation-aware: wide/short slabs get horizontal plating + rivet
   * rows; tall/narrow slabs (walls, columns) get vertical segmentation.
   * Drawn in white so setTint() can recolor it when zones change.
   */
  paintPhosphorSlab(
    x: number, y: number, w: number, h: number, seed = 0,
  ): Phaser.GameObjects.Graphics {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics();
    g.setPosition(x, y).setDepth(-10);

    const hx = w / 2, hy = h / 2;
    const isWall = h > w * 1.6;     // tall narrow → wall / column
    const isFloor = w > h * 4;       // very wide low → floor / ceiling
    const r = Math.min(w, h) * 0.12;

    // ── 1. Soft glow pass (behind everything) ────────────────────────────
    g.lineStyle(6, 0xffffff, 0.10);
    g.strokeRoundedRect(-hx, -hy, w, h, r);

    // ── 2. Plating seams ─────────────────────────────────────────────────
    g.lineStyle(1, 0xffffff, 0.28);
    if (isWall) {
      // Vertical wall: horizontal seams every ~80px split it into plates
      for (let sy = -hy + 80; sy < hy - 20; sy += 80 + (this.rng() * 20 - 10)) {
        g.lineBetween(-hx + 3, sy, hx - 3, sy);
      }
    } else if (isFloor) {
      // Floor/ceiling: vertical seams every ~64px
      for (let sx = -hx + 64; sx < hx - 20; sx += 64 + (this.rng() * 14 - 7)) {
        g.lineBetween(sx, -hy + 3, sx, hy - 3);
      }
    } else if (w > 120) {
      // Wide platform: 1-2 vertical seams to suggest 2-3 plates
      const nSeams = w > 240 ? 2 : 1;
      for (let i = 0; i < nSeams; i++) {
        const sx = -hx + (w * (i + 1)) / (nSeams + 1);
        g.lineBetween(sx, -hy + 3, sx, hy - 3);
      }
    }

    // ── 3. Outer frame (bright core line) ────────────────────────────────
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.strokeRoundedRect(-hx, -hy, w, h, r);

    // ── 4. Top highlight (catching light) ────────────────────────────────
    // Only for platforms — gives a readable "walkable" edge
    if (!isWall) {
      g.lineStyle(1, 0xffffff, 0.5);
      g.lineBetween(-hx + r, -hy + 1.5, hx - r, -hy + 1.5);
    } else {
      // Walls get a left/right inner highlight instead
      g.lineStyle(1, 0xffffff, 0.35);
      g.lineBetween(-hx + 1.5, -hy + r, -hx + 1.5, hy - r);
      g.lineBetween( hx - 1.5, -hy + r,  hx - 1.5, hy - r);
    }

    // ── 5. Rivet rows (perimeter dots, spacing by size) ──────────────────
    g.fillStyle(0xffffff, 0.7);
    const rivet = (rx: number, ry: number) => g.fillCircle(rx, ry, 1.3);
    if (isWall) {
      // Column of rivets on left/right faces
      const spacing = 36;
      const pad = 10;
      for (let ry = -hy + pad; ry <= hy - pad; ry += spacing) {
        rivet(-hx + 4, ry);
        rivet( hx - 4, ry);
      }
    } else {
      // Horizontal rows on top/bottom edges
      const spacing = w > 260 ? 40 : 28;
      const pad = 10;
      for (let rx = -hx + pad; rx <= hx - pad; rx += spacing) {
        rivet(rx, -hy + 4);
        rivet(rx,  hy - 4);
      }
      // Short walls get side rivets too
      if (h >= 60) {
        const vSpacing = 40;
        for (let ry = -hy + 20; ry < hy - 10; ry += vSpacing) {
          rivet(-hx + 4, ry);
          rivet( hx - 4, ry);
        }
      }
    }

    // ── 6. Hot corner markers (signature look) ───────────────────────────
    g.fillStyle(0xffffff, 0.9);
    for (const [cx, cy] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]] as const) {
      g.fillCircle(cx, cy, 2);
    }

    // ── 7. Service marker on chunky slabs (random glyph) ─────────────────
    if (w >= 120 && h >= 40 && !isWall) {
      const mx = (this.rng() - 0.5) * (w * 0.3);
      const glyph = Math.floor(this.rng() * 3);
      g.fillStyle(THEME.palette.ember, 0.55);
      if (glyph === 0) {
        // Tiny triangle warning mark
        g.beginPath();
        g.moveTo(mx, -3);
        g.lineTo(mx - 3, 2);
        g.lineTo(mx + 3, 2);
        g.closePath();
        g.fillPath();
      } else if (glyph === 1) {
        // Two-bar ID tag
        g.fillRect(mx - 5, -1, 4, 2);
        g.fillRect(mx + 1, -1, 4, 2);
      } else {
        // Circle stamp
        g.fillCircle(mx, 0, 2);
      }
    }

    return g;
  }

  // ── Machine parallax (multi-depth, zone-aligned) ─────────────────────────
  //
  // 5 layers at distinct vertical scroll factors. Each layer's zone-specific
  // props are placed at world Y positions that keep them visually aligned
  // with the matching gameplay zone when the camera looks at it, using:
  //
  //   worldY = target_Y * scrollY + viewportH/2 * (1 - scrollY)
  //
  // This way the boiler silhouette sits behind the boiler gameplay section
  // but drifts past at a visibly slower rate than the closer layers, so you
  // feel the climb as the foreground slides up faster than the background.
  //
  // `ZONES` (authoritative) mirrored here for zone-aware painting:
  //   Core             y ≤ 1200   hot white
  //   Ignition Chamber y ≤ 2200   hot orange
  //   Gauge Shafts     y ≤ 3200   amber
  //   Boiler Hall      y ≤ 4200   lime
  //   Start            y ≤ 5000   cold green

  private parallaxChains: Array<{ gfx: Phaser.GameObjects.Graphics; x: number; y: number; len: number; color: number }> = [];
  private parallaxIndicators: Array<{ gfx: Phaser.GameObjects.Graphics; x: number; y: number; color: number; phase: number; rate: number }> = [];
  private parallaxGears: Array<{ gfx: Phaser.GameObjects.Graphics; spin: number }> = [];

  paintMachineParallax(worldW: number, worldH: number): void {
    this.reseed(5279);

    const vh = this.scene.scale.gameSize.height || 854;

    // Zone centers in world Y (matches GameScene.ZONES maxY midpoints).
    const zones = {
      core:     { yCenter:  600, color: THEME.palette.zoneCore,     phosphor: 0xfff5c0 },
      ignition: { yCenter: 1700, color: THEME.palette.zoneIgnition, phosphor: 0xffb030 },
      gauge:    { yCenter: 2700, color: THEME.palette.zoneGauge,    phosphor: 0xffe060 },
      boiler:   { yCenter: 3700, color: THEME.palette.zoneBoiler,   phosphor: 0x9aff60 },
      start:    { yCenter: 4600, color: THEME.palette.zoneStart,    phosphor: 0x3aff6a },
    };
    const zoneList = [zones.start, zones.boiler, zones.gauge, zones.ignition, zones.core];

    // Helper: world Y for a layer so content centers on target_Y when player is there.
    const alignY = (targetY: number, sy: number) => targetY * sy + (vh / 2) * (1 - sy);

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 0 — far haze (sy 0.12): soft vertical bands suggesting depth
    // ──────────────────────────────────────────────────────────────────────
    const L0 = this.scene.add.graphics().setDepth(-95).setScrollFactor(0.2, 0.12);
    for (const z of zoneList) {
      const y = alignY(z.yCenter, 0.12);
      L0.fillStyle(z.color, 0.18);
      L0.fillRect(0, y - 180, worldW, 360);
      // Soft top fade
      L0.fillStyle(z.color, 0.08);
      L0.fillRect(0, y - 260, worldW, 80);
      L0.fillRect(0, y + 180, worldW, 80);
    }

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 1 — colossal engine blocks (sy 0.25): massive silhouettes
    // ──────────────────────────────────────────────────────────────────────
    const L1 = this.scene.add.graphics().setDepth(-85).setScrollFactor(0.35, 0.25);
    for (const z of zoneList) {
      const y = alignY(z.yCenter, 0.25);
      L1.lineStyle(2, z.color, 0.35);
      L1.fillStyle(z.color, 0.05);
      // Two huge blocks flanking the tower
      L1.fillRect(-40, y - 220, 140, 440);
      L1.strokeRect(-40, y - 220, 140, 440);
      L1.fillRect(worldW - 100, y - 220, 140, 440);
      L1.strokeRect(worldW - 100, y - 220, 140, 440);
      // Rivet seams
      L1.fillStyle(z.color, 0.5);
      for (let i = 0; i < 6; i++) {
        L1.fillCircle(20, y - 180 + i * 70, 2);
        L1.fillCircle(worldW - 20, y - 180 + i * 70, 2);
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 2 — pipe towers + vertical beams (sy 0.45)
    // ──────────────────────────────────────────────────────────────────────
    const L2 = this.scene.add.graphics().setDepth(-75).setScrollFactor(0.5, 0.45);
    // Long vertical pipe runs on each side, segmented by zone color
    for (const z of zoneList) {
      const y = alignY(z.yCenter, 0.45);
      L2.lineStyle(5, z.color, 0.22);
      L2.lineBetween(60, y - 260, 60, y + 260);
      L2.lineBetween(worldW - 60, y - 260, worldW - 60, y + 260);
      L2.lineStyle(1.5, z.color, 0.55);
      L2.lineBetween(60, y - 260, 60, y + 260);
      L2.lineBetween(worldW - 60, y - 260, worldW - 60, y + 260);

      // Flanges every 80px — give a sense of structure sliding past
      L2.fillStyle(z.color, 0.45);
      for (let fy = y - 240; fy <= y + 240; fy += 80) {
        L2.fillRect(54, fy - 3, 12, 6);
        L2.fillRect(worldW - 66, fy - 3, 12, 6);
      }

      // Cross-girder at zone center
      L2.lineStyle(2, z.color, 0.35);
      L2.lineBetween(60, y, worldW - 60, y);
      L2.lineBetween(60, y - 4, worldW - 60, y - 4);
    }

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 3 — zone landmarks (sy 0.65): the biome's signature silhouette
    // ──────────────────────────────────────────────────────────────────────
    const L3 = this.scene.add.graphics().setDepth(-65).setScrollFactor(0.65, 0.65);

    // Boiler zone — rounded tanks
    {
      const y = alignY(zones.boiler.yCenter, 0.65);
      const c = zones.boiler.color;
      L3.lineStyle(2, c, 0.45);
      L3.fillStyle(c, 0.08);
      // Big boiler drum (left)
      L3.fillRoundedRect(worldW * 0.15 - 60, y - 100, 120, 200, 24);
      L3.strokeRoundedRect(worldW * 0.15 - 60, y - 100, 120, 200, 24);
      // Chimney stack (right)
      L3.fillRoundedRect(worldW * 0.85 - 30, y - 180, 60, 360, 8);
      L3.strokeRoundedRect(worldW * 0.85 - 30, y - 180, 60, 360, 8);
      // Pipe between
      L3.lineBetween(worldW * 0.15 + 60, y, worldW * 0.85 - 30, y);
      // Pressure gauge on drum
      L3.strokeCircle(worldW * 0.15, y, 18);
      L3.fillStyle(c, 0.5);
      L3.fillCircle(worldW * 0.15, y, 3);
    }

    // Gauge zone — instrument wall
    {
      const y = alignY(zones.gauge.yCenter, 0.65);
      const c = zones.gauge.color;
      L3.lineStyle(1.5, c, 0.4);
      L3.fillStyle(c, 0.05);
      // Instrument panel slab
      L3.fillRoundedRect(worldW * 0.5 - 130, y - 140, 260, 280, 6);
      L3.strokeRoundedRect(worldW * 0.5 - 130, y - 140, 260, 280, 6);
      // Grid of 6 dials
      L3.lineStyle(1.2, c, 0.55);
      for (let i = 0; i < 6; i++) {
        const dx = worldW * 0.5 - 90 + (i % 3) * 90;
        const dy = y - 70 + Math.floor(i / 3) * 140;
        L3.strokeCircle(dx, dy, 28);
        L3.strokeCircle(dx, dy, 22);
        // Tick marks
        for (let t = 0; t < 8; t++) {
          const a = (t / 8) * Math.PI * 2;
          L3.lineBetween(dx + Math.cos(a) * 22, dy + Math.sin(a) * 22,
                         dx + Math.cos(a) * 26, dy + Math.sin(a) * 26);
        }
        // Needle
        const na = -Math.PI * 0.5 + (this.rng() - 0.5) * 0.8;
        L3.lineStyle(1.5, THEME.palette.ember, 0.6);
        L3.lineBetween(dx, dy, dx + Math.cos(na) * 20, dy + Math.sin(na) * 20);
        L3.lineStyle(1.2, c, 0.55);
        L3.fillStyle(c, 0.8);
        L3.fillCircle(dx, dy, 2);
      }
    }

    // Ignition zone — furnace grill + flame licks
    {
      const y = alignY(zones.ignition.yCenter, 0.65);
      const c = zones.ignition.color;
      L3.lineStyle(2, c, 0.5);
      L3.fillStyle(c, 0.08);
      // Furnace mouth (centered)
      L3.fillRoundedRect(worldW * 0.5 - 100, y - 80, 200, 160, 12);
      L3.strokeRoundedRect(worldW * 0.5 - 100, y - 80, 200, 160, 12);
      // Grill bars
      L3.lineStyle(2, c, 0.6);
      for (let i = 0; i < 7; i++) {
        const gx = worldW * 0.5 - 80 + i * 27;
        L3.lineBetween(gx, y - 60, gx, y + 60);
      }
      // Flame hint at the bottom
      L3.fillStyle(THEME.palette.ember, 0.15);
      for (let i = 0; i < 6; i++) {
        const fx = worldW * 0.5 - 70 + i * 28;
        L3.fillCircle(fx, y + 55, 8 + this.rng() * 6);
      }
      // Cooling fins on sides
      L3.lineStyle(1.2, c, 0.4);
      for (let i = 0; i < 8; i++) {
        const fy = y - 100 + i * 30;
        L3.lineBetween(30, fy, 100, fy);
        L3.lineBetween(worldW - 100, fy, worldW - 30, fy);
      }
    }

    // Core zone — capacitor bank + resonator crystal
    {
      const y = alignY(zones.core.yCenter, 0.65);
      const c = zones.core.color;
      L3.lineStyle(2, c, 0.5);
      L3.fillStyle(c, 0.08);
      // Capacitor bank — 5 tall cylinders
      for (let i = 0; i < 5; i++) {
        const cx = worldW * 0.5 - 120 + i * 60;
        L3.fillRoundedRect(cx - 18, y - 70, 36, 140, 6);
        L3.strokeRoundedRect(cx - 18, y - 70, 36, 140, 6);
        // Terminal cap
        L3.fillStyle(THEME.palette.ember, 0.35);
        L3.fillCircle(cx, y - 70, 4);
        L3.fillStyle(c, 0.08);
      }
      // Resonator crystal above bank (diamond)
      L3.lineStyle(1.5, THEME.palette.phosphorHot, 0.7);
      L3.fillStyle(THEME.palette.phosphorHot, 0.12);
      L3.beginPath();
      L3.moveTo(worldW * 0.5, y - 200);
      L3.lineTo(worldW * 0.5 + 28, y - 140);
      L3.lineTo(worldW * 0.5, y - 80);
      L3.lineTo(worldW * 0.5 - 28, y - 140);
      L3.closePath();
      L3.strokePath();
      L3.fillPath();
    }

    // Boiler Hall gets pumping-jack pistons flanking it
    {
      const y = alignY(zones.boiler.yCenter - 250, 0.65);
      const c = zones.boiler.color;
      L3.lineStyle(1.5, c, 0.35);
      L3.strokeRect(worldW * 0.1 - 20, y, 40, 80);
      L3.strokeRect(worldW * 0.9 - 20, y, 40, 80);
    }

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 4 — near parallax, mostly animated (sy 0.85)
    // hanging chains that sway, blinking indicator lights, rotating gears
    // ──────────────────────────────────────────────────────────────────────
    const L4 = this.scene.add.graphics().setDepth(-55).setScrollFactor(0.8, 0.85);

    // Rotating gears: one per zone, drawn into its own graphics so we can spin it
    for (const z of zoneList) {
      const y = alignY(z.yCenter, 0.85);
      const side = this.rng() > 0.5 ? 1 : -1;
      const gx = side === 1 ? worldW - 50 : 50;
      const r = 38 + this.rng() * 14;
      const g = this.scene.add.graphics().setDepth(-56).setScrollFactor(0.8, 0.85);
      g.setPosition(gx, y);
      this.drawGearOutline(g, 0, 0, r, z.color, 0.38);
      this.parallaxGears.push({ gfx: g, spin: (side === 1 ? 1 : -1) * (0.1 + this.rng() * 0.2) });
    }

    // Hanging chains — spaced through the whole tower, swayed in update()
    const chainCount = 8;
    for (let i = 0; i < chainCount; i++) {
      const yLocal = alignY(500 + (i / chainCount) * (worldH - 1000), 0.85);
      const xLocal = 70 + this.rng() * (worldW - 140);
      const zMatch = zoneList.reduce((best, z) =>
        Math.abs(alignY(z.yCenter, 0.85) - yLocal) < Math.abs(alignY(best.yCenter, 0.85) - yLocal) ? z : best);
      const g = this.scene.add.graphics().setDepth(-57).setScrollFactor(0.8, 0.85);
      this.parallaxChains.push({
        gfx: g, x: xLocal, y: yLocal - 80, len: 120 + this.rng() * 80,
        color: zMatch.color,
      });
    }

    // Blinking indicator lights — cluster of 3 on each zone
    for (const z of zoneList) {
      const y = alignY(z.yCenter, 0.85);
      for (let i = 0; i < 3; i++) {
        const g = this.scene.add.graphics().setDepth(-54).setScrollFactor(0.8, 0.85);
        const lx = (worldW - 30) - i * 12;
        const ly = y + 240 + (this.rng() - 0.5) * 40;
        this.parallaxIndicators.push({
          gfx: g, x: lx, y: ly, color: i === 0 ? THEME.palette.ember : z.color,
          phase: this.rng() * Math.PI * 2,
          rate: 1.5 + this.rng() * 2,
        });
        const g2 = this.scene.add.graphics().setDepth(-54).setScrollFactor(0.8, 0.85);
        this.parallaxIndicators.push({
          gfx: g2, x: 30 + i * 12, y: ly,
          color: i === 2 ? THEME.palette.ember : z.color,
          phase: this.rng() * Math.PI * 2,
          rate: 1.5 + this.rng() * 2,
        });
      }
    }

    // static decoration: static layer ref (for L0-L3) not needed; all drawn once.
    void L4; // L4 graphics drawn per-frame via updateParallaxLive
  }

  /** Per-frame update for animated parallax elements (chains, lights, gears). */
  updateParallaxLive(time: number): void {
    // Chains: small pendulum sway
    for (const c of this.parallaxChains) {
      const sway = Math.sin(time * 0.0006 + c.y * 0.01) * 8;
      c.gfx.clear();
      c.gfx.lineStyle(1.5, c.color, 0.35);
      // Chain links: short diagonal dashes
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const t1 = i / segs, t2 = (i + 1) / segs;
        const swayT1 = sway * t1, swayT2 = sway * t2;
        c.gfx.lineBetween(
          c.x + swayT1, c.y + t1 * c.len,
          c.x + swayT2, c.y + t2 * c.len,
        );
      }
      // End weight
      c.gfx.fillStyle(c.color, 0.55);
      c.gfx.fillCircle(c.x + sway, c.y + c.len, 3);
    }

    // Indicator lights: blink with a sine-driven alpha
    for (const ind of this.parallaxIndicators) {
      const a = 0.2 + 0.6 * Math.max(0, Math.sin(time * 0.001 * ind.rate + ind.phase));
      ind.gfx.clear();
      ind.gfx.fillStyle(ind.color, a);
      ind.gfx.fillCircle(ind.x, ind.y, 2.5);
      ind.gfx.fillStyle(ind.color, a * 0.3);
      ind.gfx.fillCircle(ind.x, ind.y, 5);
    }

    // Gears: slow rotation
    for (const g of this.parallaxGears) {
      g.gfx.rotation += g.spin * 0.008;
    }
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

  // ── Per-zone foreground decor (non-colliding, near walls) ─────────────────

  /** Boiler Hall: valve wheel with spokes. */
  paintValveWheel(x: number, y: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    const c = THEME.palette.zoneBoiler;
    g.lineStyle(2, c, 0.55);
    g.strokeCircle(x, y, 12);
    g.strokeCircle(x, y, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineBetween(x + Math.cos(a) * 8, y + Math.sin(a) * 8,
                    x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    g.fillStyle(c, 0.6);
    g.fillCircle(x, y, 2);
  }

  /** Gauge Shafts: vertical graduated scale with 12 ticks. */
  paintGradScale(x: number, yTop: number, height: number, seed = 0): void {
    if (seed) this.reseed(seed);
    const g = this.scene.add.graphics().setDepth(-7);
    const c = THEME.palette.zoneGauge;
    g.lineStyle(1.5, c, 0.45);
    g.lineBetween(x, yTop, x, yTop + height);
    const ticks = 12;
    for (let i = 0; i <= ticks; i++) {
      const ty = yTop + (i / ticks) * height;
      const w = i % 3 === 0 ? 8 : 4;
      g.lineBetween(x, ty, x + w, ty);
    }
  }

  /** Ignition Chamber: spark array — a short animated sparkle cluster. */
  createSparkCluster(x: number, y: number): { update(t: number): void; destroy(): void } {
    const g = this.scene.add.graphics().setDepth(-7);
    const update = (t: number) => {
      g.clear();
      const seed = Math.floor(t * 3);
      // Pseudo-random per 333ms
      const rand = (i: number) => {
        const s = Math.sin((seed + i) * 12.9898) * 43758.5453;
        return s - Math.floor(s);
      };
      for (let i = 0; i < 5; i++) {
        if (rand(i) > 0.5) {
          const sx = x + (rand(i + 10) - 0.5) * 28;
          const sy = y + (rand(i + 20) - 0.5) * 14;
          const a = rand(i + 30);
          g.fillStyle(THEME.palette.ember, 0.4 + a * 0.5);
          g.fillCircle(sx, sy, 1.5);
          g.lineStyle(1, THEME.palette.ember, 0.6);
          g.lineBetween(sx - 3, sy, sx + 3, sy);
          g.lineBetween(sx, sy - 3, sx, sy + 3);
        }
      }
    };
    return { update, destroy: () => g.destroy() };
  }

  /** Core: small pulsing capacitor crown. */
  createCapacitorPulse(x: number, y: number): { update(t: number): void; destroy(): void } {
    const g = this.scene.add.graphics().setDepth(-7);
    const update = (t: number) => {
      g.clear();
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      const c = THEME.palette.zoneCore;
      g.lineStyle(1.5, c, 0.35 + pulse * 0.35);
      g.strokeRoundedRect(x - 14, y - 20, 28, 40, 4);
      g.fillStyle(THEME.palette.phosphorHot, 0.2 + pulse * 0.5);
      g.fillCircle(x, y - 14, 2 + pulse * 1.5);
      g.fillCircle(x, y - 6, 2 + pulse * 1.5);
      g.fillCircle(x, y + 6, 2 + pulse * 1.5);
    };
    return { update, destroy: () => g.destroy() };
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
    void zoneName;
    const barX = 6, barW = 8;
    const barTop = viewportH * 0.1, barBot = viewportH * 0.9;
    const barH = barBot - barTop;

    // Outer rail
    gfx.lineStyle(1, phosphorColor, 0.35);
    gfx.strokeRoundedRect(barX - 1, barTop - 1, barW + 2, barH + 2, 4);

    // Background
    gfx.fillStyle(phosphorColor, 0.15);
    gfx.fillRoundedRect(barX, barTop, barW, barH, 3);

    // Fill
    const fillH = barH * Math.max(0, Math.min(1, progress));
    gfx.fillStyle(phosphorColor, 0.8);
    gfx.fillRoundedRect(barX, barBot - fillH, barW, fillH, 3);
    // Fill head — bright marker
    gfx.fillStyle(THEME.palette.ember, 1);
    gfx.fillCircle(barX + barW / 2, barBot - fillH, 3);
    gfx.fillStyle(THEME.palette.ember, 0.3);
    gfx.fillCircle(barX + barW / 2, barBot - fillH, 6);

    // Zone notches with diamond markers — each zone gets its tint
    const zoneMarks = [
      { y: 4200, color: THEME.palette.zoneBoiler },
      { y: 3200, color: THEME.palette.zoneGauge },
      { y: 2200, color: THEME.palette.zoneIgnition },
      { y: 1200, color: THEME.palette.zoneCore },
    ];
    for (const m of zoneMarks) {
      const ratio = m.y / 5000;
      const ny = barBot - barH * (1 - ratio);
      gfx.fillStyle(m.color, 0.9);
      // Diamond
      gfx.beginPath();
      gfx.moveTo(barX - 3, ny);
      gfx.lineTo(barX + barW / 2, ny - 3);
      gfx.lineTo(barX + barW + 3, ny);
      gfx.lineTo(barX + barW / 2, ny + 3);
      gfx.closePath();
      gfx.fillPath();
    }
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
