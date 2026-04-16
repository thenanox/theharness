# Visual Overhaul Plan — The Harness
## Style: Dead Oscilloscope

## Context

The game needs a distinctive visual identity. The chosen direction: **Dead Oscilloscope** — the
colossal machine renders its own internal state through dead vector-display monitors. You see the
world through a phosphor CRT. As you climb and reignite the core, the display warms from cold
green phosphor → amber → white-hot. The rope is always the hottest, most alive element on screen.

Layered on top: **film grain** (analog texture) and **zone identity shifts** (phosphor color
temperature changes as you ascend).

Thematic payoff: the visual style is the narrative. A dead machine. A dead display.
You warm it up by climbing.

---

## Style Foundation — what changes globally

| Element | Before | After |
|---|---|---|
| Background | bone-white `0xf4efe6` | near-black `0x080a0c` |
| Platforms | filled brushstroke slabs | phosphor wireframe outlines (strokeRoundedRect, 2-pass glow) |
| Player | filled charcoal rectangle | bright phosphor-filled block (stands out against wireframe world) |
| Rope | additive ember glow on light bg | same additive glow — now pops far harder against dark |
| Parallax | low-alpha grey silhouettes | low-alpha phosphor-colored ghost outlines |
| Machine decor | filled shapes | outline/stroke only, phosphor color |
| Scanlines | none | viewport-pinned horizontal lines, α=0.08, every 3px |
| Grain | none | ~300 random 1×1 dots per frame, α=0.03–0.05 |
| BG grid | none | faint oscilloscope reference grid, α=0.04 |

### Phosphor color per zone (warms as you climb)

| Zone | Y range | Phosphor hex | Feel |
|---|---|---|---|
| Start | 4200–5000 | `0x3aff6a` | cold green — machine stone dead |
| Boiler Hall | 3200–4200 | `0x9aff60` | yellow-green, first flicker |
| Gauge Shafts | 2200–3200 | `0xffe060` | amber, warming up |
| Ignition Chamber | 1200–2200 | `0xffb030` | hot amber-orange |
| Core | 0–1200 | `0xfff5c0` | near-white hot, blending into win palette |

The phosphor color is stored in `GameScene` as `this.phosphorColor` (a number), updated when
zone changes. All VisualFX drawing methods accept it as a parameter.

---

## Phase A — Core Style Shift (implement first, everything else builds on this)

### A0. Background, palette, scanlines, grain, grid
**Files:** `src/theme.ts`, `src/main.ts`, `src/scenes/GameScene.ts`, `src/systems/VisualFX.ts`

1. `theme.ts`: add `phosphorBase: 0x3aff6a`, `screenBg: 0x080a0c` to palette
2. `main.ts`: change `backgroundColor` to `0x080a0c`
3. `GameScene`: set `this.cameras.main.setBackgroundColor(0x080a0c)`
4. `VisualFX.paintPaperBackdrop`: replace with `paintScreenBackdrop(gfx)` — draw bg fill + faint
   oscilloscope grid (16×16 cell dotted lines, `inkMid` at α=0.04), depth -100
5. New `VisualFX.paintScanlines(gfx, W, H)`: horizontal lines every 3px, `0x000000` α=0.10.
   Called ONCE into a static Graphics, depth 9000, scrollFactor 0.
6. New `VisualFX.paintGrain(gfx, W, H, rng)`: ~300 random 1×1 fillRect calls, phosphor color
   α=0.03–0.05, depth 8999, scrollFactor 0. Called every frame (gfx.clear + redraw).

### A1. Platform wireframe rendering
**Files:** `src/systems/VisualFX.ts` (`paintBrushSlab` → `paintPhosphorSlab`)

Replace the 5-layer filled brushstroke slab with a 2-pass phosphor outline:
- Pass 1 (glow): `lineStyle(6, phosphorColor, 0.15)` + `strokeRoundedRect`
- Pass 2 (core): `lineStyle(1.5, phosphorColor, 0.9)` + `strokeRoundedRect`
- Corner artifacts: 4 small `fillCircle(r=2)` at corners at α=0.6 (hot corners, classic phosphor)
- No fill — world is wireframe, player reads clearly against it

Update all `paintBrushSlab` call sites in `GameScene.buildTower` to pass `phosphorColor`.

### A2. Player — phosphor-filled block (stands apart from wireframe world)
**Files:** `src/entities/Player.ts`

- Main body: filled `phosphorColor` at α=0.9 (bright, solid — contrasts with outline world)
- Belt: ember orange stays (warm accent)
- Head dot: `0xffffff` α=0.8 (hot white — hottest point on the player)
- Add a subtle additive glow pass behind the body: `BlendModes.ADD`, same color, r=16, α=0.12
- Player color updates when zone changes: `player.setPhosphorColor(color)` called from GameScene

### A3. Screen shake on every impact
**Files:** `src/scenes/GameScene.ts`, `src/entities/Rope.ts`

Add `private triggerShake(ms, intensity)` helper. Four call sites:
- Hard landing (vy > 6): `shake(90, 0.006)`
- Wall hit: `shake(70, 0.004)`
- Rope attach (via `'rope-attach'` event from Rope): `shake(45, 0.003)`
- Rope detach (via `'rope-detach'` event): `shake(55, 0.0035)`

`Rope.ts` emits `this.scene.events.emit('rope-attach')` and `'rope-detach'` — GameScene subscribes.

### A4. Player squash & stretch
**Files:** `src/entities/Player.ts`, `src/entities/Rope.ts`

Add `squashStretch(sx, sy, duration)` — tweens `this.gfx` + `this.dressing` via `Back.easeOut`:
- Land: `scaleY:0.72, scaleX:1.32`, 180ms
- Rope attach: `scaleY:1.28, scaleX:0.82`, 120ms
- Jump: `scaleY:1.22, scaleX:0.84`, 100ms

### A5. Phosphor persistence trail (replaces generic motion trail)
**Files:** `src/systems/VisualFX.ts` (new `drawPhosphorTrail`), `src/scenes/GameScene.ts`

Ring buffer of 8 positions, populated when rope.state === 'SWINGING' and speed > 3.
Draw as fading phosphor-colored rectangles: `alpha = (1 - i/len) * 0.25`.
At depth 9 (below player 10). `trailGfx.clear()` + fillRect loop — no tween allocations.
Phosphor persistence is the defining visual metaphor of this style.

### A6. Rope catenary sag
**Files:** `src/systems/VisualFX.ts` (modify `drawEmberRope`), `src/entities/Rope.ts`

Add `nominalLength?: number` param. Add `quadBezierPts(sx,sy,cx,cy,ex,ey,steps)` helper.
Control point: midpoint pulled down by `min(30, max(0, nominalLength - dist) * 0.6)`.
Render both passes as 12-segment polyline. Pass `this.sm.length` from `Rope.draw()`.

### A7. Camera zoom pulse on rope attach
**Files:** `src/entities/Rope.ts`, `src/scenes/GameScene.ts`

On `'rope-attach'` event: tween `cameras.main.zoom` 1.0 → 1.04 (80ms easeOut), yoyo, 40ms hold.

---

## Phase B — Zone Identity & Atmosphere

### B1. Zone system + phosphor color transitions
**Files:** `src/scenes/GameScene.ts`

```typescript
const ZONES = [
  { name: 'Core',             maxY: 1200, phosphor: 0xfff5c0 },
  { name: 'Ignition Chamber', maxY: 2200, phosphor: 0xffb030 },
  { name: 'Gauge Shafts',     maxY: 3200, phosphor: 0xffe060 },
  { name: 'Boiler Hall',      maxY: 4200, phosphor: 0x9aff60 },
  { name: 'Start',            maxY: 5000, phosphor: 0x3aff6a },
] as const;
```

Track `this.currentZone`. On zone change:
- Tween `this.phosphorColor` toward new zone color over 800ms
- Update `player.setPhosphorColor(color)`
- Redraw zone vignette

### B2. Zone vignette
**Files:** `src/systems/VisualFX.ts` (new `paintZoneVignette`), `src/scenes/GameScene.ts`

Viewport-pinned Graphics at depth 100, redrawn only on zone change.
12 concentric edge rectangles, color = phosphor at low alpha (0.06–0.12).
Ignition Chamber is darkest/most oppressive. Core has faint warm bleed.

### B3. Ambient drift — phosphor motes
**Files:** `src/systems/VisualFX.ts` (new `createAmbientDrift`), `src/scenes/GameScene.ts`

Fixed pool of 35 particles drifting upward. Color = current phosphor color.
Wrap within ±500px window around playerY. Manual clear+draw per frame, no tweens.
In Core zone: 8% chance per particle to be ember-orange instead (warm bleed preview).

### B4. Parallax layer update
**Files:** `src/systems/VisualFX.ts` (modify `paintMachineParallax`)

Change all parallax drawing from filled shapes to **stroked outlines** in current phosphor color
at low alpha. Add third mid-layer (depth -70, scrollFactor 0.45): 6 thin horizontal conduits
+ 4 vertical columns, `inkMid` at α=0.25.

### B5. Animated ignition socket
**Files:** `src/systems/VisualFX.ts` (new `createIgnitionSocket`), `src/scenes/GameScene.ts`

Returns `{update(t:number): void}`. Live Graphics at depth 0.
8 small phosphor dots orbiting at r=18px, speed 0.8 rad/s.
Heat shimmer: 3 faint vertical rects offset by sine each frame.
Color matches Core zone phosphor (near-white hot).

### B6. Ember burst on rope attach
**Files:** `src/systems/VisualFX.ts` (new `emberBurst`), `src/entities/Rope.ts`

4 expanding additive circles (ember color) at attach point, bloom outward × (3+i),
fade 120–150ms. Called alongside existing `inkSplash` in `Rope.attach()`.

---

## Phase C — Polish & Narrative

### C1. Win sequence choreography
**Files:** `src/scenes/GameScene.ts`, `src/systems/VisualFX.ts`

Win trigger: `player.y <= 32 && !this.winTriggered`.

Staged sequence:
- `t=0`: `camera.shake(300, 0.012)` + `camera.flash(120, 255, 180, 80)`
- `t=120`: `camera.zoomTo(1.08, 400)` + `emberBurst` ×3 staggered
- `t=120`: begin `playWinColorReveal` (expand to two-stop gradient: bottom→top)
- `t=300`: ambient drift → 100% ember particles
- `t=800`: `steamPuff()` on ceiling vents (6 expanding grey additive circles, 800ms)
- `t=1800`: WIN banner fades in (large serif, ember orange, scrollFactor 0)
- `t=2000`: `camera.zoomTo(1.0, 600)`
- `t=2600`: restart prompt

Also: phosphor color instantly overrides to white-hot on win trigger, then the warm palette
reveal takes over. The dead display reignites.

### C2. BootScene — CRT cold-boot
**Files:** `src/scenes/BootScene.ts`

Replace 700ms flat transition with:
1. Start completely dark (screen off)
2. Single horizontal scan line sweeps top→bottom over 600ms (CRT power-on)
3. Title text appears with brief horizontal glitch (offset +8px → snaps to center) 
4. Tagline fades in (phosphor green, not orange — it's the dead display before warmth)
5. A small phosphor-colored dot falls slowly from top, leaving a fading trace — rope preview
6. Start prompt pulses α 0.3→0.7→0.3 on 1400ms yoyo
7. On input or 4s: scanline sweep up (power-off), then `scene.start('Game')`

### C3. HUD progress bar
**Files:** `src/systems/VisualFX.ts` (new `drawProgressBar`), `src/scenes/GameScene.ts`

8px wide vertical bar on left edge, viewport-pinned, depth 195.
Background: current phosphor at α=0.15. Fill: current phosphor at α=0.7.
5 notch marks at zone boundaries. Zone letter (`S/B/G/I/C`) beside each notch.
Color transitions with zone (same phosphor tween).

### C4. Gear slow-rotation
**Files:** `src/systems/VisualFX.ts`, `src/scenes/GameScene.ts`

Refactor `paintGearSilhouette` to draw centered at (0,0) when `centered: true`.
Store gear handles as `{gfx, cx, cy, angle, speed}[]`.
`GameScene.update`: `gfx.setAngle(angle += speed * dt)`. 0.3–1.2 deg/frame.
Gears are now outline-only (matching phosphor wireframe world).

---

## Critical files

| File | Key changes |
|---|---|
| `src/theme.ts` | Add `screenBg`, `phosphorBase` to palette |
| `src/main.ts` | Background color → `0x080a0c` |
| `src/systems/VisualFX.ts` | New: `paintScreenBackdrop`, `paintScanlines`, `paintGrain`, `paintPhosphorSlab`, `drawPhosphorTrail`, `drawSwingHalo`, `emberBurst`, `createAmbientDrift`, `createIgnitionSocket`, `drawProgressBar`, `steamPuff`, `paintZoneVignette`. Modified: `drawEmberRope` (catenary), `paintMachineParallax` (outlines + mid-layer), `paintGearSilhouette` (origin-centered + outline) |
| `src/scenes/GameScene.ts` | Zone system + phosphor tween, all Graphics objects, win trigger + choreography, update loop additions |
| `src/entities/Rope.ts` | Emit events, catenary length, `emberBurst` call, enhanced miss flash |
| `src/entities/Player.ts` | Phosphor fill + glow, `squashStretch`, `setPhosphorColor` |
| `src/scenes/BootScene.ts` | CRT cold-boot sequence |

## Verification

1. `npm run typecheck` — zero errors after each phase
2. `npm test` — rope tests pass (no physics touched)
3. `npm run dev` — visual checks:
   - Dark background, scanlines visible, grain texture present
   - Platforms render as glowing wireframes, not fills
   - Player is bright phosphor block, clearly readable against wireframe world
   - Rope pops hard against dark bg (higher contrast than before)
   - Climb from Start → Core: phosphor color visibly warms (green → amber → white)
   - Swing: phosphor trail appears, fades with persistence
   - Rope attach: shake + zoom pulse + ember burst
   - Win: shake + flash + zoom + color reveal + steam vents
   - Boot: CRT cold-boot sweep, not instant fade
4. Mobile portrait: all effects hold above 50fps
5. `npm test` final pass before push
