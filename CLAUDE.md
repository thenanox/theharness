# CLAUDE.md — The Harness: Project Conventions & Locked Decisions

This file is the single source of truth for AI assistants (and new contributors)
working on this codebase. Read it before touching any code.

---

## What this game is

**The Harness** is a one-run vertical rope-climbing platformer for Gamedev.js Jam 2026.
Theme: **MACHINES**. Narrative: you are the last maintainer climbing a colossal dead engine
to reignite its core. One run. One rope. No respawn.

Spiritual parents: **Jump King** (vertical rage-climber, one life) + **Worms Ninja Rope**
(physics-driven pendulum rope that rewards timing over button-mashing).

---

## Non-negotiable design decisions

| Decision | Rationale | Never change without explicit agreement |
|---|---|---|
| **Portrait-first layout (480×854)** | Mobile-native, Jump King-style vertical scroll | Landscape broke mobile UX entirely |
| **One run, no respawn** | Core tension. Falling is the punishment. | Adding checkpoints changes the genre |
| **Rope is the only locomotion** | No walking at all. Left/right on ground only rotates the aim arm. | Do not re-add ground movement |
| **Worms-faithful pendulum rope** | Physics drives the swing; gravity is your engine, not arrow keys | Do not add "fly with arrows" air control |
| **Ink & Ember visuals** | Procedural, no tilesets, artist-free for a jam | Palette lives in `theme.ts` — one edit changes everything |
| **Single tall world, hand-authored platforms** | Intentional level design (like Jump King), not procedural | Procedural = scope trap in a jam context |

---

## The Rope — critical mechanic, must be perfect

The rope mechanic is the game. Everything else is decoration.

### How a correct Worms rope feels
1. Fire → hook sticks → you are a pendulum driven by **gravity**
2. L/R keys add a **small angular pump** — they do NOT steer you freely
3. Pressing L/R at the **bottom of the arc** gives maximum energy transfer
4. **Reel in** at the bottom converts downswing speed to upswing height (angular momentum)
5. **Detach** at the apex of a swing to fling yourself upward
6. Gain significant height only through **timing**, not through holding a button

### What breaks the Worms feel (do NOT do this)
- Setting horizontal velocity directly while swinging (kills pendulum)
- Large air-control forces that override gravity-driven momentum
- Low constraint stiffness (bungee feel instead of rigid rope)
- Low solver iterations (constraint becomes springy)
- High `frictionAir` (kills swing momentum too fast)

### Key physics constants (in `src/config.ts`)
```
frictionAir      = 0.003   // low → swing momentum persists (correct)
stiffness        = 1.0     // rigid — Worms rod, not bungee
damping          = 0.01    // minimal → pendulum lasts
reelSpeed        = 200     // px/s — fast enough to feel responsive
swingPump        = 0.003   // per-frame nudge force during swing (intentionally tiny)
detachImpulse    = 0.010   // kick on detach, with upward bias baked into the vector
aim.rotateSpeed  = 2.6     // rad/s — ~150°/sec sweep when A/D held in IDLE
```
These are hard-won. Don't increase `swingPump` or `frictionAir` without testing.

---

## Rope tests are mandatory

`tests/rope.test.ts` covers the rope state machine. **These tests must pass before
any merge to main.** If you change `RopeStateMachine.ts`, update the tests.

Run with: `npm test` (vitest)

The tested invariants:
- State machine transitions (IDLE → FIRING → SWINGING → IDLE)
- Reel clamping (never below `minLength`, never above `maxLength`)
- Detach impulse direction (always away from anchor, upward bias)
- No double-constraint (refire cleans up before creating new)
- Miss handling (no-op, stays IDLE)

---

## Layout & orientation

- **Game canvas**: 480 × 854 (portrait 9:16)
- **World**: 480 wide × ~5000 tall (the tower)
- **Camera**: vertical-biased follow, looks ahead upward
- **Mobile**: portrait is the primary orientation. No "rotate your device" overlay.
- **Desktop**: portrait window, centered, scales via `Phaser.Scale.FIT`

Changing dimensions requires updating: `src/config.ts`, `src/main.ts` (scale config),
`src/scenes/GameScene.ts` (arena bounds and platform layout).

---

## File map

```
src/
  config.ts              — GAME_W/H, PHYSICS constants (rope tuning lives here)
  theme.ts               — all colors, strings, narrative labels
  types.ts               — RopeState, shared interfaces
  main.ts                — Phaser game config (portrait scale)
  entities/
    RopeStateMachine.ts  — pure state machine, NO Phaser deps, fully tested
    Rope.ts              — Phaser adapter: raycasting, constraint, graphics
    Player.ts            — Matter body + swing/slide (no walking)
  scenes/
    BootScene.ts         — title card → GameScene
    GameScene.ts         — owns Matter world, vertical tower arena
  systems/
    InputController.ts   — keyboard + touch events → InputState
    TouchControls.ts     — portrait on-screen buttons
    VisualFX.ts          — Ink & Ember procedural drawing helpers
    AudioBus.ts          — music start/duck

tests/
  rope.test.ts           — vitest tests for RopeStateMachine (mandatory)
```

---

## Controls (Worms-style angle aim — no mouse required)

### Desktop
- **A / D or ◄ / ►**: rotate aim arm (when IDLE **and grounded**) / pendulum pump (when SWINGING) — no walking
- **Space**: fire rope (IDLE, not sliding) / detach (SWINGING)
- **W / Up**: reel in
- **S / Down**: reel out
- **Right-click**: hard detach
- **Mouse** *(optional)*: moves the aim angle when the cursor moves — never required

No jump button. The rope is the *only* way up. Grounded contact is a recovery
perch — fire again to climb.

### Mobile (portrait) — two tap modes, `ⓘ MODE` pill toggles top-left
Mode preference persists in `localStorage` under `harness.touchMode`.

**MODE · TAP** *(default, beginner)*
- **Tap arena**: fire rope at tap point (or detach if already SWINGING)
- **◄ ►** (bottom-left): rotate aim (IDLE and grounded) / pendulum pump (SWINGING) — no walking
- **▲** (bottom-right, top): reel in (also fires rope if IDLE)
- **▼** (bottom-right, bottom): reel out / detach when SWINGING

**MODE · AIM** *(hard-to-master depth)*
- Hold on arena ≥ `HOLD_AIM_MS` (110 ms) to reveal ember aim line; drag tunes angle
  and length; release to fire at final drag point
- Quick taps (< 110 ms) still snap-fire, preserving TAP-mode muscle memory
- All four hold-buttons behave identically to TAP mode
- `▲` mid-swing smoothly reels in — the Worms pendulum-tightening move and the
  core high-level mobile skill

### Key design decisions on controls
- Mouse is optional: full game is playable keyboard-only and on mobile without mouse
- A/D rotates aim only when **grounded**; while airborne without rope, aim auto-tracks
  velocity at 45° upward in the direction of travel (Worms behavior — you cannot steer mid-air)
- `firePressed` does NOT auto-detach when swinging (that breaks the Worms flow).
  GameScene explicitly only reacts to `firePressed` when rope state is `IDLE`.
- `firePressed` is also blocked when `isSliding()` — all controls are locked during slide.
- Only `detachPressed` (SPACE, ▼, right-click, arena tap while SWINGING) detaches the rope
- `TouchControls` registers touch zones on `InputController` so tap-to-fire
  ignores taps that land on an on-screen button

## Slide punishment (Worms / Jump King mechanic)

Any contact with a surface while **not** on the rope, at speed ≥ `PHYSICS.player.slideThreshold`,
triggers a slide:
- **All controls are disabled** (including rope firing) until velocity drops below 0.5 px/frame
- Physics (friction + gravity) decelerate the player naturally — no input is processed
- The aim guide is hidden during slide (can't fire anyway)
- Visual: player body flashes red-to-charcoal on impact

**Wall hits specifically** (`label: 'sidewall'`) also apply `kickFromWall()` — an outward
horizontal impulse — so the player can never get wedged against the side walls. After the
kick, gravity carries them downward to the bottom.

This makes falling the total punishment: no escape via rope until fully stopped. Gentle
contacts (speed < slideThreshold = 3.5) do not trigger slide.

## Static body labels (GameScene)

| label | friction | restitution | purpose |
|---|---|---|---|
| `platform` | 0.4 | 0.0 | floor, ceiling, walkable ledges |
| `sidewall` | 0.0 | 0.3 | left/right tower walls — bounces player, no sticking |

## Zones (phosphor color + vignette)

`GameScene.ZONES` (top-down order): `Core` → `Ignition Chamber` → `Gauge Shafts`
→ `Boiler Hall` → `Start`. Each zone has a `maxY` boundary and a `phosphor`
color. On crossing a boundary, `updateZone()`:

1. Tweens `phosphorColor` from the old to new zone color over 800 ms
   (Sine.easeInOut), using `VisualFX.lerpColor`.
2. Pushes the new color through `Player.setPhosphorColor()` — player gfx and
   glow retint live.
3. Repaints the vignette with zone-specific intensity (Ignition Chamber gets
   the heaviest vignette, Start the lightest).

All HUD readouts (height text, progress bar, ambient drift) sample
`this.phosphorColor` each frame so a zone transition retints everything in one
sweep.

## Tunneling prevention

`PHYSICS.player.maxSpeed` (15 px/frame) **must always be less than the thinnest platform**
(24 px in GameScene). If you add thinner platforms, lower maxSpeed first.
Matter solver iterations are raised (positionIterations 14, velocityIterations 10) and
`slop: 0.01` (tight) is set in main.ts to reject penetrations aggressively.

---

## Audio

Single-slot music bus in `AudioBus.ts`. Drop a file at
`public/assets/audio/music.ogg` (optional `music.mp3`) and the game loops it
on first user input. **If the file is missing the game runs silent — never
crashes.** `BootScene.preload()` queues the asset; `GameScene` calls
`startIfLoaded()` on the first pointerdown and `duck(0.6)` during gameplay.
No per-sample SFX yet — all feedback is visual (shake, flash, particle).

---

## Visual direction: Ink & Ember (CRT Oscilloscope render)

The art direction is **Ink & Ember** — oiled iron, frosted gauge glass, ember
cable — but the current render is a **dead-oscilloscope CRT**: near-black
`screenBg` (`#080a0c`) with a single phosphor trace color that warms from
bottom to top as the player climbs.

- `screenBg` = near-black CRT backdrop; no sky, no paper white in play
- Single warm accent: ember orange (`#ff7a3d`) — rope, player belt, finish glow,
  progress bar label, height readout
- Phosphor color is **zone-based** and tweens smoothly between zones
  (see `ZONES` in `GameScene.ts`):
  - **Start** (bottom) → cold green `0x3aff6a`
  - **Boiler Hall** → lime `0x9aff60`
  - **Gauge Shafts** → amber `0xffe060`
  - **Ignition Chamber** → hot orange `0xffb030`
  - **Core** (top, ignition target) → hot white `0xfff5c0`
- Player gfx, ambient drift, halo, trail, progress bar, and vignette all
  retint with the current phosphor color — one zone transition = one palette
  sweep
- Machine decorations: rivets, pipe runs, frozen gauge dials, steam vents
  (see `VisualFX.paintRivetRow / paintPipeRun / paintGaugeDial / paintSteamVent`)
- On win: full palette re-color via `playWinColorReveal()` (machine reignites) —
  only ever happens once per run. Ambient drift flips all-ember after ignition.
- No external sprite assets. All rendering via Phaser Graphics API + `VisualFX.ts`.
- `theme.ts` keeps legacy ink-wash tokens (`background`, `sky`, `inkDeep`, etc.)
  for compatibility. Day-to-day tuning touches `palette.screenBg`, `phosphor*`,
  `rope`, `ember`.

---

## Dev workflow

```bash
npm install
npm run dev        # local dev server, http://localhost:5173
npm test           # vitest watch (rope tests must pass)
npm run test:run   # vitest one-shot (use in CI / pre-push checks)
npm run typecheck  # tsc --noEmit (no type errors allowed)
npm run build      # tsc --noEmit + vite build → ./dist
npm run preview    # serve ./dist locally
```

`npm run build` runs `tsc --noEmit` first — build fails on any type error.

### Deploy targets

The same `dist/` build ships to three places; they share build output, only the
wrapper differs.

| Target | Command / Trigger | URL |
|---|---|---|
| GitHub Pages (main) | push to `main` | `https://thenanox.github.io/theharness/` |
| GitHub Pages (branch) | push to any other branch `foo` | `https://thenanox.github.io/theharness/branch/<foo>/` (slashes become dashes) |
| GitHub Pages (PR) | open PR #N | `https://thenanox.github.io/theharness/pr/<N>/` (sticky comment posted automatically) |
| itch.io | `npm run build && cd dist && zip -r ../harness.zip .` → upload as HTML5 (viewport 480×854 portrait) | — |
| Wavedash | `npm run build && wavedash build push` (reads `wavedash.toml`, uploads `./dist`) | — |

`VITE_BASE` is set by CI per branch/PR. Default is `'./'` so itch.io and
Wavedash iframes work without tweaking.

Stale previews are cleaned by `.github/workflows/cleanup-preview.yml` on
branch delete / PR close. Gitleaks scans every push via
`.github/workflows/gitleaks.yml`.

Allow ~1–2 minutes after a push for the preview deploy to go live.

---

## Milestone state (April 2026)

Kept in sync with `docs/PLAN.md`. Source of truth for scope discussions is
that file — this is a quick pointer.

| Milestone | Status |
|---|---|
| M0 — scaffold (Phaser 4 + Vite + TS + Matter) | done |
| M1 — rope state machine + raycast + reel + detach/refire | done |
| M2.5 — Machines theme (framing, labels, decor) | done |
| M3.5 — branch/PR preview deploys + cleanup | done |
| M4 — Ink & Ember visual pass (brushstrokes, CRT phosphor, parallax, particles, mobile dual-mode) | done |
| M4.5 — Portrait pivot (480×854) + RopeStateMachine extracted + vitest suite | done |
| M2 — camera + height HUD | partial (vertical follow in; formal height meter pending) |
| M3 — full tower via Tiled map | pending (tall vertical arena stub in; Tiled authoring not started) |
| M5 — persistence + Wavedash leaderboards | pending |
| M6 — itch.io + Wavedash submissions | pending |
| M7+ — x402 cosmetic unlocks, ghost replays | stretch (post-M6 only) |

---

## Working on this repo (Git discipline)

- All work happens on a feature branch. Never push to `main` directly.
- Commit messages: short imperative mood, reference the system touched
  (`rope:`, `scene:`, `visualfx:`, `docs:`). No Claude footers in commits the
  user will read in `git log`.
- Before committing any rope or physics change, run `npm run test:run` +
  `npm run typecheck` locally. Both must pass.
- Preview URL for the branch appears within ~1–2 min of pushing; use it to
  verify mobile portrait rendering and touch controls on an actual phone when
  changing input or layout code.
- Do not commit `.env`, `.pem`, `.key`, `.wrangler/`, or `.wavedash/` files —
  `.gitignore` already excludes them and `gitleaks` will fail CI if anything
  slips through. See `SECURITY.md` for the disclosure process.

---

## What NOT to do

- Do not add respawns, checkpoints, or lives — one run only
- Do not make arrow keys control air direction freely — pump force only
- Do not change portrait orientation back to landscape
- Do not use external tileset/sprite assets (artist-free constraint)
- Do not skip the rope tests before merging
- Do not add x402 / Wavedash features before M5 is explicitly started
- Do not commit `.env`, API keys, or wallet credentials
