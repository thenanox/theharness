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
| **Rope is the primary locomotion** | Walking is rare. Rope swings carry you up. | Don't over-power ground movement |
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
frictionAir   = 0.003   // low → swing momentum persists (correct)
stiffness     = 1.0     // rigid — Worms rod, not bungee
damping       = 0.01    // minimal → pendulum lasts
reelSpeed     = 200     // px/s — fast enough to feel responsive
swingPump     = 0.003   // per-frame nudge force during swing (intentionally tiny)
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
    Player.ts            — Matter body + walk/jump/swing
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
- **A / D or ◄ / ►**: rotate aim arm (when IDLE) / pendulum pump (when SWINGING) / walk (grounded)
- **Space**: fire rope (IDLE) / detach (SWINGING)
- **W / Up**: reel in (jump when grounded)
- **S / Down**: reel out
- **Right-click**: hard detach
- **Mouse** *(optional)*: moves the aim angle when the cursor moves — never required

### Mobile (portrait)
- **◄ ►**: rotate aim angle (IDLE) / swing pump (SWINGING)
- **▲**: fire rope (IDLE) / reel in (SWINGING) / jump (grounded)
- **▼**: reel out / detach (SWINGING)
- **Tap arena**: quick-fire at tap point (overrides angle aim for that shot)

### Key design decisions on controls
- Mouse is optional: full game is playable keyboard-only and on mobile without mouse
- A/D rotates aim, SPACE fires — just like Worms bazooka aiming
- `firePressed` does NOT auto-detach when swinging (that breaks the Worms flow)
- Only `detachPressed` (SPACE, ▼, right-click) detaches the rope

## Slide punishment (Worms / Jump King mechanic)

Any contact with a surface while **not** on the rope, at speed ≥ `PHYSICS.player.slideThreshold`,
triggers a slide:
- Player **loses all walk/jump/pump control** until velocity drops below 0.5 px/frame
- Physics (friction + gravity) decelerate them naturally — no input processed
- **The rope can still be fired** — that's the intended escape
- Visual: player body flashes red-to-charcoal on impact

**Wall hits specifically** (`label: 'sidewall'`) also apply `kickFromWall()` — an outward
horizontal impulse — so the player can never get wedged against the side walls. After the
kick, gravity carries them downward to the bottom.

This forces the player to stay on the rope. Ground contact is punishing; only re-firing the
rope can save the run. Gentle contacts (speed < slideThreshold = 3.5) do not trigger slide.

## Static body labels (GameScene)

| label | friction | restitution | purpose |
|---|---|---|---|
| `platform` | 0.4 | 0.0 | floor, ceiling, walkable ledges |
| `sidewall` | 0.0 | 0.3 | left/right tower walls — bounces player, no sticking |

## Tunneling prevention

`PHYSICS.player.maxSpeed` (15 px/frame) **must always be less than the thinnest platform**
(24 px in GameScene). If you add thinner platforms, lower maxSpeed first.
Matter solver iterations are raised (positionIterations 14, velocityIterations 10) and
`slop: 0.01` (tight) is set in main.ts to reject penetrations aggressively.

---

## Visual direction: Ink & Ember

- 4-step cool grey ink-wash world (bone-white paper → charcoal)
- Single warm accent: ember orange (`#ff7a3d`) — rope only, player belt, finish glow
- Machine decorations: rivets, pipe runs, frozen gauge dials, gear silhouettes
- On win: full palette re-color (machine reignites) — only ever happens once per run
- No external sprite assets. All rendering via Phaser Graphics API + `VisualFX.ts`.

---

## Dev workflow

```bash
npm run dev       # local dev server, localhost:5173
npm test          # vitest (rope tests must pass)
npm run typecheck # tsc --noEmit (no type errors allowed)
npm run build     # production build → ./dist
```

Every push to any branch auto-deploys to GitHub Pages preview:
`https://thenanox.github.io/theharness/branch/<branch-name>/`

---

## What NOT to do

- Do not add respawns, checkpoints, or lives — one run only
- Do not make arrow keys control air direction freely — pump force only
- Do not change portrait orientation back to landscape
- Do not use external tileset/sprite assets (artist-free constraint)
- Do not skip the rope tests before merging
- Do not add x402 / Wavedash features before M5 is explicitly started
- Do not commit `.env`, API keys, or wallet credentials
