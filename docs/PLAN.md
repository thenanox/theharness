# The Harness — Gamedev.js Jam 2026

## Context

We are building an HTML5 game for **Gamedev.js Jam 2026** (Apr 13–26, judged on Innovation, Theme, Gameplay, Graphics, Audio). Jam is live — see **Current State** below for shipped milestones.

The core design hook: a **one-run Jump King-style vertical climber** where the only real locomotion is a **Worms-faithful Ninja Rope**. The rope mechanic in Worms rewards skill expression beautifully and nobody has made a pure rope-climbing "one life" game around it. Fall physics + no respawn + skill ceiling = the same addictive rage-climb loop Jump King / Getting Over It pioneered, but with visually stunning rope flow.

**Theme status:** **ANNOUNCED — "MACHINES"** (Gamedev.js Jam 2026, Apr 13–26, 5 PM CET). Official guidance is wide-open: _"operating a specific machinery like an assembly line, a mechanic fixing whatever is broken, or YOU are the sentient machine or a robot."_ Our rope-climber core needs **zero mechanical change** — we adopt the **"Derelict Engine"** framing (see Theme Adaptation section below). All existing physics, controls, and "Ink & Ember" visual systems carry over; the brushstroke language becomes the oil-grease-and-blueprint ink of a shut-down machine. Framing touches only `src/theme.ts`, BootScene title card, HUD labels, the arena decoration pass in `VisualFX.ts`, and the README tagline.

**Challenges targeted:**
- **Build it with Phaser** — **Phaser 4** (released Apr 10, 2026) + Matter.js is our engine.
- **Open Source (GitHub)** — repo public, MIT licensed, GitHub Pages build.
- **Deploy to Wavedash** — ship the same build to Wavedash via `wavedash.toml` + `wavedash build push`, integrate `WavedashJS` for leaderboards. Targets the $2.5k Wavedash cash prize pool.
- **Ethereum (stretch / nice-to-have)** — via **x402** (Coinbase HTTP-402 spec on Base). Optional cosmetic unlocks. Demoted from core to stretch: only pursued after M5.

---

## Current State — April 2026

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 — scaffold | **done** | Phaser 4 + Vite + TS, Matter world ticking |
| M1 — rope | **done** | State machine, raycast attach, reel, detach, refire |
| M2.5 — Machines theme | **done** | `theme.ts` labels, VisualFX machine props, README tagline |
| M3.5 — branch/PR previews | **done** | `pages.yml` + cleanup workflow + sticky PR comment |
| M4 — Ink & Ember visual pass | **done** | Brushstroke tiles, ember glow, parallax, particles, mobile dual-mode controls |
| M2 — camera + height HUD | partial | Camera follow in, formal height meter pending |
| M3 — full tower (Tiled map) | **pending** | Flat arena only; hand-authored map not started |
| M5 — persistence + Wavedash | **pending** | SaveStore, WavedashAdapter not yet built |
| M6 — multi-target deploy | **pending** | itch.io and Wavedash submissions pending |
| M7+ — x402 / ghosts | stretch | Post-M6 only |

**Current branch:** `main` (all merged). Next: build the full tower (M3).

---

**Locked decisions** (confirmed with user):
- Genre: one-run Jump King-style climber
- Stack: TypeScript + Vite + **Phaser 4**
- Physics: Matter.js distance constraint (Worms-style rigid rope)
- Deployment: itch.io + GitHub Pages + Wavedash
- Ethereum: x402 is nice-to-have only

---

## Project Scaffold

Mirror the official `phaserjs/template-vite-ts` structure, adapted for Phaser 4, created manually so we control every file.

```
theharness/
├── index.html                  # Vite entry, #game-container
├── package.json                # phaser ^4.0, vite ^5.4, typescript ^5.5
├── tsconfig.json               # strict, ES2022, moduleResolution: bundler
├── vite.config.ts              # base './' for itch/Wavedash, '/theharness/' for Pages via env
├── wavedash.toml               # game_id, upload_dir=./dist, custom HTML5 entrypoint
├── LICENSE                     # MIT
├── README.md                   # title, gif, play links (itch+Pages+Wavedash), build, challenges
├── .github/workflows/pages.yml # deploy dist to GitHub Pages
├── public/assets/
│   ├── tilesets/climb.png
│   ├── maps/tower.json         # Tiled export
│   ├── sprites/{player,rope_hook}.png (+ atlas .json)
│   ├── ui/                     # buttons, fonts
│   └── audio/                  # ogg + mp3 pairs
├── src/
│   ├── main.ts                 # Phaser.Game config (Matter on, scene list, roundPixels: true)
│   ├── config.ts               # GAME_W/H, physics tuning constants, theme tokens
│   ├── types.ts                # RopeState, Cosmetic, GhostFrame
│   ├── theme.ts                # palette/labels/story strings — swap after theme drops
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── PreloadScene.ts
│   │   ├── MenuScene.ts
│   │   ├── GameScene.ts        # owns Matter world, Player, Rope, Level
│   │   ├── HUDScene.ts         # parallel scene, reads registry
│   │   ├── ShopScene.ts        # cosmetic UI (wired to x402 only if stretch reached)
│   │   └── EndScene.ts         # win / give-up, submits score to Wavedash
│   ├── entities/
│   │   ├── Player.ts           # Matter body + walk/jump
│   │   ├── Rope.ts             # state machine + Matter constraint + Graphics
│   │   └── GhostPlayer.ts      # replays a recorded run
│   ├── systems/
│   │   ├── InputController.ts  # mouse aim + WASD + touch
│   │   ├── CameraRig.ts        # follow with vertical bias
│   │   ├── RunRecorder.ts      # samples pose 30Hz
│   │   ├── CosmeticManager.ts  # applies skins/trails
│   │   ├── SaveStore.ts        # localStorage: unlocks, receipts, bestHeight
│   │   └── WavedashAdapter.ts  # thin wrapper over WavedashJS, no-op when missing
│   ├── x402/                   # STRETCH — only implemented post-M5
│   │   ├── client.ts
│   │   ├── wallet.ts
│   │   └── catalog.ts
│   └── ui/{Button,HeightMeter}.ts
└── server/                     # STRETCH — Cloudflare Worker for x402
    ├── wrangler.toml
    ├── package.json
    └── src/index.ts
```

**Core deps** (M1): `phaser ^4.0.0`, `vite ^5.4`, `typescript ^5.5`, `@types/node`. Phaser 4 ships its own Matter types.
**Wavedash deps** (M5): `WavedashJS` via the Wavedash SDK docs (script tag or npm — confirm at integration time from `https://docs.wavedash.com/`).
**Stretch deps** (post-M5 only): `viem` + `@x402/fetch` + `@x402/hono` for the optional Ethereum challenge.

---

## Game Architecture

**Scene flow:** Boot → Preload → Menu → (Game + HUD in parallel) → End → Menu. Shop is launched as overlay from Menu.

**State ownership:**
- `GameScene` owns the Matter world and tears everything down on shutdown.
- `HUDScene` runs in parallel (`scene.launch('HUD')`), reads shared state via `registry`.
- `SaveStore` singleton wraps `localStorage` with versioned schema `{ v:1, bestHeightM, unlocks: string[], receipts: {sku, txHash, sig}[] }`.
- `CosmeticManager` reads `SaveStore` at scene create, tints/swaps textures.

**Rope state machine** (lives on `Rope`, not Player):
```
IDLE → FIRING → ATTACHED → SWINGING → DETACHED → IDLE
```
Refire mid-air just cleans up the old constraint before re-firing.

---

## Controls — "easy to learn, hard to master"

The skill ceiling should come from **timing and physics intuition**, not from input complexity. Both desktop and mobile must be approachable in 10 seconds and deep enough to reward 10 hours.

### Desktop (already implemented, small additions)
- **Mouse position = aim**, always visible (thin 2-dot dashed line from player → cursor up to `MAX_ROPE` in IDLE state, ghosted out of combat).
- **Left click / space:** context-sensitive — fire rope when IDLE, detach when SWINGING.
- **W / Up:** reel in (also jumps when grounded).
- **S / Down:** reel out.
- **A / D / Left / Right:** walk on ground, air-nudge while swinging.
- **Right click:** hard detach (redundant with space, kept for muscle memory).

### Mobile — one core gesture, one optional gesture for masters

The mobile layout has TWO modes, selectable from the title screen and remembered in `localStorage`:

**Mode 1 — "Tap" (default, easy to learn):**
- Tap anywhere on the arena → fire rope at the tap point (or detach if already swinging). Single input for both keeps learning cost near zero.
- Bottom-left `◄ ►` pad: walk / air-nudge. Large (72px) thumb zone, 30% transparent.
- Bottom-right stacked `▲` / `▼`: reel in (jump when grounded) / reel out (detach when swinging).
- Hint overlay on first load: "tap to fire · hold buttons to reel".

**Mode 2 — "Aim" (unlocks after 3 completed swings, or toggle in settings):**
- **Hold & drag to aim before release**: press-and-hold anywhere on the arena ≥100ms to reveal a targeting line from the player; drag your finger to tune angle/length; release to fire. Quick taps (<100ms) still snap-fire at the tap point — so the Tap-mode muscle memory is preserved.
- This is the "hard to master" depth for mobile: feathering the aim line lets experts set up pendulum swings with the same precision as mouse players. Masters can pre-aim, wait for the exact pendulum beat, and release.
- `▲` / `▼` also double as a **"reel-assist"** — during a swing, hold `▲` to smoothly tighten the rope and convert downswing momentum into upswing height (the core skill of Worms rope-climbing). This is the only mobile-exclusive help and it matches what desktop players do by tapping W at the bottom of the arc.

**Touch tuning details:**
- Buttons register screen-space rects on `InputController` so tap-to-fire never triggers under a button (already implemented).
- On-screen buttons fade to 15% opacity when not being held, to keep the ink-&-ember aesthetic clean.
- One-finger rule: the arena tap/drag and the button zones never conflict. Two-finger chording (walk + swing simultaneously) works because buttons and arena taps are independent pointer IDs.
- Haptic feedback (`navigator.vibrate(8)`) on rope stick + on detach. 8ms is subtle. Guarded for browsers without the API.
- Portrait users see a "rotate device" overlay — game is landscape 16:9 only.

**Why this satisfies "easy to learn, hard to master":**
- **Learn curve:** first swing happens within 5 seconds of touching the screen regardless of mode. Tap mode needs literally one input.
- **Mastery curve:** pre-aim + reel-assist timing + trajectory prediction give the same skill ceiling as PC. A master mobile player should be able to finish the tower without ever touching the walk buttons — all momentum from swings.
- **No tutorial screen required.** Mechanics reveal themselves through the first arena layout (M1 has a gap you can only cross with a rope; you figure it out by trying).

---

## Rope Implementation (the critical risk)

Reference (Phaser 3 articles — API still applies for Matter in Phaser 4, confirm at M1): https://phaser.io/news/2019/07/make-a-rope-or-swing-using-matter-physics and https://phaser.io/news/2019/08/flinging-hooks-with-matter-physics. If Matter constraint API has shifted in Phaser 4, consult the v4 `matter` skill file in `phaserjs/phaser` repo skill docs.

Core APIs:
- `this.matter.add.constraint(bodyA, bodyB, length, stiffness)`
- `Phaser.Physics.Matter.Matter.Query.ray(bodies, start, end)` for hook hit test
- `this.matter.world.convertTilemapLayer(layer)` to create Matter bodies from Tiled collisions

**Algorithm (in `src/entities/Rope.ts`):**
1. On fire: raycast from player position in aim direction up to `MAX_ROPE`. Find first solid hit.
2. Tween hook sprite to `hit.point` (~120ms), then `attach()`.
3. `attach()`: create a `matter.add.constraint` between `player.body` and the hit body with `pointB` in the hit body's **local** frame. Stiffness 0.9 (rigid Worms feel).
4. Each frame in `SWINGING`: up/down keys mutate `constraint.length` at `REEL_SPD`, clamped to `[MIN_LEN, MAX_LEN]`. Jump key calls `detachWithImpulse()`.
5. `drawLine()`: simple `Graphics.lineBetween(player, anchor)` tinted by active cosmetic.

**Tuning knobs** (put in `src/config.ts`):
```
player.mass        = 1.0
player.frictionAir = 0.005   // higher kills swings, lower = slidey
stiffness          = 0.9     // Worms rigid rope
damping            = 0.05
REEL_SPD           = 250     // px/s
MAX_ROPE           = 400     // px
MIN_LEN            = 24
gravity.y          = 1.0
positionIterations = 8
velocityIterations = 6
```

**Static anchor gotcha:** `matter.add.constraint` needs a `bodyB` — for tile anchors, pass the tile's Matter body (from `convertTilemapLayer`) with `pointB` as the local-space hit point. Never pass only a world point without a `bodyB` or it anchors to `(0,0)`.

---

## Level Design

Single tall **hand-authored Tiled map**, ~2048 × 16384, one collision layer + one decoration layer, exported to `public/assets/maps/tower.json`. Loaded via `this.load.tilemapTiledJSON` and `convertTilemapLayer` for collisions. Procedural is a scope trap — Jump King needs intentional puzzles.

Tileset (~16 tiles): stone, ice (low friction), moss (high friction), decorative. 3 biomes stacked vertically.

**Respawn: there is none.** Jump King rule — one body, one run. Falling is the punishment. Run ends only on reaching the top trigger or pressing Give Up.

---

## Wavedash Integration (challenge target)

**Packaging:** ship the same Vite `dist/` that goes to itch. Wavedash supports "Any web-based game with a custom entrypoint."

- `wavedash.toml` at repo root:
  ```
  game_id   = "the-harness"
  upload_dir = "./dist"
  ```
- Install CLI: `brew install wvdsh/tap/wavedash` (or platform equivalent). Auth once with `wavedash login`.
- Deploy: `npm run build && wavedash build push`.
- SDK: `WavedashJS` (loaded via script tag or npm per docs at https://docs.wavedash.com/). Used in `src/systems/WavedashAdapter.ts`:
  - `WavedashJS.getUser()` → show player name in HUD
  - `WavedashJS.uploadLeaderboardScore({ score: bestHeightCm, keepBest: true })` called from `EndScene` on win
- **Graceful degradation:** `WavedashAdapter` checks `typeof WavedashJS !== 'undefined'`. When absent (itch/Pages build), it no-ops. Same build runs everywhere.

## Theme Adaptation Strategy — "Machines → Derelict Engine"

Theme announced: **MACHINES**. Rope climbing is a natural fit — the harness itself is a mechanical climbing rig, and a "one rope / one run" story sits perfectly inside a piece of machinery. We adopt this framing:

### The Derelict Engine framing

> _The colossal engine at the heart of the city stopped turning a hundred years ago. You are the last maintainer. The ignition chamber sits at the top of the stalled core, and you're carrying the last live ember on a winch cable — climb the machine's internal shafts, thread the cable through dead gear shafts and frozen boiler halls, and reignite the core before the ember burns out._

This framing:
- Uses the **existing ember rope** as a narrative object — it's literally a live ember cable being carried up to restart the machine. The "rope is the only warm element" design now has an in-world reason (the rest of the machine is cold and dead).
- Uses the **existing win-color-reveal** as the ignition moment — the grey-to-molten-orange palette shift narratively reads as the machine firing back up. This was designed before we knew the theme and happens to land perfectly.
- Uses the **existing 3 biomes** as vertical machine sections — the tile set's stone/ice/moss slots become **Iron Plate / Frosted Gauge Glass / Oxidized Copper**, no new rendering required.
- Keeps the **title "The Harness"** — it already reads as mechanical. The harness IS a machine (a winch + climbing rig). Bonus: fits the theme without renaming the repo.
- Fits multiple jam challenges at once: Theme (Machines) + Innovation (nobody else is making a rope-climber inside a dead machine) + Graphics (brushstroke-on-blueprint is rare).

### Concrete file changes (M2.5 — complete)

**`src/theme.ts`** — palette keys stay, labels swap:
```ts
title:   'THE HARNESS'
tagline: 'one ember. one cable. reignite the core.'
biomes:  { iron: 'Boiler Hall', glass: 'Gauge Shafts', copper: 'Ignition Chamber' }
hud:     { heightLabel: 'DEPTH REMAINING', giveUpLabel: 'CUT CABLE' }
labels.startPrompt: 'the engine is cold — climb'
win.message:        'CORE · REIGNITED'
fail.message:       'ember · lost'
// palette: stone → ironPlate, ice → gaugeGlass (kept the cold blue),
// moss → oxidizedCopper (the one non-grey accent, now sage-teal patina).
// rope/ember colors unchanged — they are the hero.
```

**`src/systems/VisualFX.ts`** — add machine-decoration helpers to the existing brushstroke toolkit (no rewrite, just additions):
- `paintRivetRow(x, y, w)` — 3–6 small ink dots along a slab edge. Called from the existing `paintBrushSlab` when a slab is tagged `iron`.
- `paintPipeRun(x1, y1, x2, y2)` — 2-stroke pipe with a single hot-white highlight line. Used as decoration between slabs.
- `paintGaugeDial(x, y, r)` — ink circle + tick marks + a single ember needle (dead, frozen). Scattered on background layers.
- `paintGearSilhouette(x, y, r)` — brush-stroke cog outline for the parallax layers. Replaces the current abstract tower columns in the Machines build, same 0.3× / 0.6× scroll.
- `paintSteamVent(x, y)` — a tiny dead vent slit; during the win-color-reveal, emit one warm puff to sell the ignition.
All of these stay within the existing "brush-stroke + ember accent" language — no new palette, no new shader, no new asset.

**`src/scenes/BootScene.ts`** — title card pulls new `title` / `tagline` / `startPrompt` from `theme.ts` (already the case — just the strings change).

**`src/scenes/GameScene.ts`** — the arena decoration pass calls the new VisualFX helpers to scatter pipes, rivets, gauges, and gear silhouettes against the existing brushstroke slabs. No physics changes. No new Matter bodies. The finish flag becomes an **ignition trigger** — same glowing rectangle, different label.

**`README.md`** — update tagline to _"Climb a dead machine. Reignite the core. One ember, one cable, one run."_ and add a line under "Challenges targeted" noting how the framing lands against the **Machines** theme.

### Mechanics invariants (do NOT touch)

- Rope physics (distance constraint, stiffness, reel speeds) — unchanged.
- Input controllers (TAP / AIM modes, keybindings) — unchanged.
- Player body (charcoal silhouette + ember belt) — unchanged. The belt is now the "harness clip" that the ember cable threads through.
- One-run rule — unchanged. Falls are still permanent. The machine doesn't reignite twice.
- Build / deploy pipeline — unchanged.

### Plan B (only if Derelict Engine stops working during implementation)

If the Derelict Engine framing runs into a concrete problem (e.g. the gauge-dial decorations hurt readability on mobile, or testers find the "one ember" narrative confusing), fall back to **"Sentient Winch"**: the player is a tiny maintenance robot — a sentient winch — climbing its host machine to reach its own brain. Same mechanics, same assets, different one-liner. Decision cost is near-zero because the palette and tile set don't change.

## Ethereum Stretch (x402 — nice-to-have only)

**Backend:** single **Cloudflare Worker** (free tier) deployed from `server/`. Game stays static on itch/Pages/Wavedash and calls the worker. Only built after M5 ships.

**Packages** (from coinbase/x402 repo):
- Server: `@x402/hono` (Worker-compatible)
- Client: `@x402/fetch` wraps `fetch`, auto-handles 402 retries
- Wallet: `viem` + injected provider, Base mainnet (8453) or Base Sepolia for testing

**Minimum viable flow:**
1. User clicks "Unlock Gold Rope" in ShopScene
2. `x402/client.ts` calls `x402Fetch('https://harness-api.workers.dev/cosmetic/gold-rope')`
3. Worker returns `402 PAYMENT-REQUIRED` (scheme: USDC on Base, amount $0.10, payTo: dev address)
4. `@x402/fetch` prompts viem wallet, signs `PaymentPayload`, retries with `PAYMENT-SIGNATURE`
5. Worker verifies via x402 facilitator, returns `200 { sku, signedReceipt }`
6. Client stores receipt in `SaveStore.unlocks`; `CosmeticManager` re-applies on next scene
7. On future loads, local receipt is verified against a hardcoded public key — no re-payment

**What's paid vs free:**
- Free: core climb, daily seed fetch (`/daily/seed`)
- Paid: cosmetic unlocks, submitting a daily run to leaderboard, downloading top-N pro ghosts

One working paid endpoint is enough to qualify for the challenge. Don't over-scope.

---

## Visual Direction — "Ink & Ember"

Going for a **fresh, unique, non-pixel-art** aesthetic that almost no other Phaser jam entry will share. The rope is the hero; the world is a restrained backdrop so the rope and the player's motion always read.

**The pitch: sumi-e ink-wash world + a single vivid ember rope.**

- **World palette:** 4 cool greys (near-black → bone white), no saturation. Tower silhouettes rendered as loose brushstroke shapes, not tiles. Soft paper-grain texture overlay (one 512×512 noise PNG blended at ~8% opacity).
- **The rope is the only warm/saturated element on screen** — ember orange `#ff7a3d` with a hot-white core. It glows faintly (additive sprite + slight bloom via Phaser 4 Filter). When the rope is live you feel it instantly; when detached the screen visually "cools" back to ink grey.
- **Player:** 1 silhouette character, charcoal black with a single ember accent (the harness itself — a warm belt/clip that matches the rope). 24×32ish, rendered as a flat shape with a subtle rim light; no sprite detail needed so the style is cheap.
- **Anchors / tiles:** drawn as brush-stroke slabs with a slightly wet edge (Graphics API or pre-rendered PNGs, not a tileset). Ice = cooler grey with a sheen line, moss = a hint of sage (only non-grey tile hue in the whole game, restrained), stone = plain ink.
- **Motion = ink splatter:** when the hook sticks, emit a tiny ink-splash particle burst (6–8 black dots that fall with gravity). On hard landings, a grey dust puff. On detach, a warm ember flicker on the player for 200ms.
- **Parallax background:** 2 layers of distant tower silhouettes, each a single brushstroke column drawn procedurally via Graphics (no assets). Scroll at 0.3× and 0.6× parallax. Light fog gradient at the bottom of the viewport so depths fade to white.
- **Typography:** thin serif display font for title ("Cormorant Garamond" via Google Fonts, bundled as WOFF2 in `/public/assets/fonts`), monospace for HUD (keeps a "documentation" feel that contrasts with the ink world).
- **Camera feel:** soft vertical bias (player sits in the lower third), gentle lag on rope attach (0.1s settle), and a 2° tilt on hard swings for kinetic emphasis. No screen shake — keep it calm so the rope's motion is the only violent thing.
- **Win moment:** when the player hits the top trigger, the world slowly re-colors from ink-grey to full palette over 2 seconds — the first and only time saturation exists. Reward through contrast.

Nothing here requires an artist. All of it can be produced with Phaser Graphics API + one noise PNG (CC0) + one font. Replaceable with commissioned art later if time permits.

**Theme-drop plan for visuals:** the style is neutral enough to survive most jam themes — only the player accent colour, one tile hue, and the winning-color-reveal palette swap via `theme.ts`. The brushstroke language stays.

## Audio

Keep this dead simple. User will provide background music tracks; code just needs to be ready to play them.

- **Music:** single slot. `/public/assets/audio/music.ogg` + `.mp3` pair. Loaded in `PreloadScene`, played looping from `MenuScene`, ducked 40% during `GameScene`, restored on `EndScene`. If the file is missing at load time the audio manager logs once and the game runs silent — never crashes. A music volume slider lives in the pause menu.
- **SFX:** 5–6 one-shot effects generated with `jsfxr` (rope fire, hook stick, whoosh on swing, thud on hard landing, win chime, fail). Shipped as tiny `.wav`s committed to repo. These are stubs — easy to replace.
- **Audio engine:** Phaser's default `WebAudioSoundManager`. No ogg/mp3 branching logic needed; Phaser handles fallback.
- **Autoplay constraint:** browsers block audio until first input. Start music on first `pointerdown` in `MenuScene`.
- **No ambient/interactive music systems.** If the user wants to swap the music file mid-jam, they just drop a new `music.ogg` into the assets folder and push — the next deploy picks it up.

---

## Build + Deploy — every commit & every PR are playable

Core principle: **every push to any branch, and every PR, must produce a playable URL within ~2 minutes of the push landing.** No waiting for main, no manual steps. The user tests features on desktop and phone from their browser immediately.

One `vite build` produces one `dist/`. That `dist/` is shipped to:

### Primary iteration loop: GitHub Pages with branch/PR previews

We use a single workflow `.github/workflows/pages.yml` that:

1. Runs on `push` (any branch) AND on `pull_request` events.
2. Builds the game with `VITE_BASE=/theharness/<slug>/` where `<slug>` is:
   - `""` (root) for the default branch `main`
   - `branch/<branch-name>` for any other branch push
   - `pr/<number>` for pull requests
3. Publishes to a shared `gh-pages` branch at that subfolder via `peaceiris/actions-gh-pages@v4` (keep_files: true, so previews accumulate without wiping each other).
4. On PRs, posts a sticky comment with the preview URL so every PR page links to its build (`marocchino/sticky-pull-request-comment@v2`).
5. A companion workflow `.github/workflows/cleanup-preview.yml` deletes the subfolder when a branch is deleted or a PR is closed, so gh-pages doesn't grow forever.

Resulting URLs:
- Production (main): `https://thenanox.github.io/theharness/`
- Any other branch `foo`: `https://thenanox.github.io/theharness/branch/foo/`
- PR #42: `https://thenanox.github.io/theharness/pr/42/`

No external service, no tokens to manage — `actions-gh-pages` uses the auto-provided `GITHUB_TOKEN` scoped to `contents: write` on the gh-pages branch. Zero secrets live in the repo.

First-time setup (documented in README): **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**, and ensure **Actions → Workflow permissions: Read and write**.

### Secondary targets (manual, for jam submission)

- **itch.io:** `cd dist && zip -r ../harness.zip .` → upload as HTML5 (viewport 960×540). Requires `base: './'` — generated by a separate `npm run build:itch` script that sets `VITE_BASE=./`.
- **Wavedash:** `npm run build:itch && wavedash build push` from repo root. Custom HTML5 entrypoint = `index.html`. `WavedashJS` loads when present, otherwise no-op. Run once at M5 to validate the pipeline, then again at M6 for submission.
- **Worker (stretch only):** `wrangler deploy` from `server/`. Secrets set via `wrangler secret put`, never committed.

### README must document

Screenshot/gif, all three play links, controls (desktop + mobile), build instructions, architecture overview, challenge targets (Phaser / Open Source / Wavedash / Ethereum), MIT LICENSE, CC0 attribution, and the preview-URL convention so collaborators know where to look.

---

## Secrets & Open Source Hygiene

This repo is public from day one. Treat every commit like it's being read by a stranger. Rules:

- **Never commit** `.env`, `.env.local`, `*.key`, `*.pem`, private keys, wallet seeds, API tokens, session cookies, `wavedash` auth files, `wrangler` creds, or personal gitconfig. `.gitignore` covers all of these up-front (see below).
- **All secrets go into GitHub Actions secrets** (`Settings → Secrets and variables → Actions`), referenced as `${{ secrets.XYZ }}` in workflows. Workflows themselves contain no secret values. At time of writing the Pages iteration loop needs **zero** secrets because `GITHUB_TOKEN` is auto-provided.
- **Stretch x402 worker:** deploy from local dev machine with `wrangler secret put PAY_TO_ADDRESS` / `wrangler secret put RECEIPT_SIGNING_KEY`. These live in Cloudflare, not in the repo. The **public receipt-verify key** is fine to commit (it's public by definition).
- **Wallet addresses are public** — committing a `payTo` address is safe, but the private key behind it is not.
- **Pre-commit safety net:** add `gitleaks` via a GitHub Action on every push (`.github/workflows/gitleaks.yml`) to block accidental secret leaks. Free, open source, zero config for default rules.
- **`.gitignore`** (at repo root):
  ```
  node_modules/
  dist/
  dist-ssr/
  .vite/
  coverage/
  *.log
  npm-debug.log*
  .env
  .env.*
  !.env.example
  *.pem
  *.key
  .wrangler/
  .wavedash/
  .DS_Store
  Thumbs.db
  .idea/
  .vscode/*
  !.vscode/settings.json.example
  *.zip
  harness.zip
  ```
- **No analytics / tracking scripts.** Itch, Pages, and Wavedash all provide their own; don't inject extra trackers that could leak player info.
- **`SECURITY.md`** stub with "report vulnerabilities here" contact so the repo passes basic OSS hygiene checks.
- **License attribution:** CC0 assets (noise texture, font, any borrowed SFX) credited in `CREDITS.md` with direct links. No copy-pasted art from non-CC0 sources.

---

## Milestones (ordered by risk)

| # | Slice | Ship gate |
|---|---|---|
| **M0** ✓ | Scaffold: Phaser 4 + Vite + TS booting a blank Matter scene. `npm run dev` loads. | Phaser 4 splash on screen, Matter world ticking. |
| **M1** ✓ | Rope feels right: flat arena, mouse-aim, raycast-attach, reel, detach, refire. No art. | Swing across a 1000px gap and feel good. If no, pivot stiffness or kill project. |
| **M2** ~ | One vertical screen, camera follow, walk/jump recovery, HUD height meter. | Reach a ledge 500px up using only rope. |
| **M2.5** ✓ | **Theme adaptation — "Machines → Derelict Engine"**: update `theme.ts` labels + tagline, add `paintRivetRow` / `paintPipeRun` / `paintGaugeDial` / `paintGearSilhouette` / `paintSteamVent` to `VisualFX.ts`, scatter decoration props in `GameScene`, rewrite BootScene title strings, update README tagline. | Title card, HUD, and first arena read as a dead machine. Mechanics and physics untouched. Branch preview loads on desktop + mobile. |
| **M3** | Full tower: 30-screen Tiled map, 3 biomes, win trigger, End scene. | Playable end-to-end run. |
| **M3.5** ✓ | Branch/PR preview deploys: `peaceiris/actions-gh-pages` publishing to subfolders + PR sticky comment. | Pushing to any branch produces a playable URL within ~2 min. |
| **M4** ✓ | Ink & Ember visual pass: brush-stroke tiles, ember rope glow, parallax silhouettes, ink splashes, win-color-reveal + SFX stubs + music slot. | Looks and sounds like a game. |
| **M5** | Persistence + Menu + Wavedash integration: SaveStore, best height, `WavedashAdapter` submits score from EndScene. | Best height persists; Wavedash leaderboard entry submitted in a test build. |
| **M6** | Multi-target deploy: itch.io upload, GitHub Pages workflow green, Wavedash `build push`. | All three play links live from the same `dist`. |
| **M7 (stretch)** | x402 worker: one cosmetic unlockable on Base Sepolia. | Only if M1–M6 shipped with time to spare. |
| **M8 (stretch)** | Ghosts: RunRecorder, GhostPlayer, optional upload. | Only after M7. |
| **M9** | Polish + submit: itch page, gif, trailer, README, tag v1.0, submit. | Jam entry live before deadline. |

**Cut lines:**
- Minimum shippable: M0–M4 + M6 (playable game on at least itch).
- Target submission: M0–M6 (game + Wavedash leaderboard + all three deploy targets).
- Bonus: M7–M8 (Ethereum challenge).

---

## Key Risks

- **Rope feel IS the game.** Matter constraints can NaN at extreme reel speeds. Mitigations: clamp `length` per frame, cap body velocity, `positionIterations ≥ 8`, never `length: 0`.
- **Phaser 4 is brand new** (released Apr 10, 3 days before jam start). Matter isn't explicitly called out in the migration guide but the renderer, tint, Filter, and Point→Vector2 changes WILL bite. Mitigations: use the v4 skill docs in `phaserjs/phaser` as reference, set `roundPixels: true` explicitly (default flipped to false in v4), avoid removed classes (`Point`, `Mesh`, `BitmapMask`), use native `Set`/`Map` instead of `Phaser.Struct.*`, and watch for tint mode changes (`setTintFill` removed → `setTint().setTintMode(Phaser.TintModes.FILL)`).
- **Theme mismatch.** If the theme is radically incompatible with "climbing with a rope," we lose the Theme voting criterion. Mitigation: the `theme.ts` adapter + plan-B fallback to stage-based variant. Decision happens within 2h of theme drop — don't agonize.
- **Tilemap collision seams.** `convertTilemapLayer` can create overlapping bodies that snag the player on tile edges. Fallback: author collision as a single composite polygon in a Tiled object layer.
- **Refire mid-air must destroy old constraint first** (`Composite.remove(world, oldConstraint)`) or player double-tethers and snaps.
- **Wavedash CLI friction.** Brand-new platform, may have rough edges. Mitigation: do a dry-run `wavedash build push` at M0 with an empty scene to validate the pipeline before investing in game content.
- **Scope creep.** Ghosts, leaderboards, daily challenge, multiple cosmetics, x402 are each multi-day rabbit holes. Enforce the M6 cut line. x402 is strictly stretch.
- **Phaser Matter type gaps.** Some Matter internals (`Query.ray`, `Composite.allBodies`) are loosely typed. Expect a few `as any` casts.

---

## Critical Files

- `src/entities/Rope.ts` — state machine, constraint management, the whole game's feel
- `src/scenes/GameScene.ts` — Matter world, level load, entity orchestration
- `src/entities/Player.ts` — Matter body, walk/jump controls
- `src/config.ts` — physics tuning constants (iterate on these constantly)
- `src/theme.ts` — the single file touched when the jam theme drops (palette, labels, hero framing)
- `src/systems/InputController.ts` — keyboard + mouse + touch zones (tap vs hold detection)
- `src/systems/TouchControls.ts` — on-screen D-pad + reel buttons, mode toggle (Tap vs Aim)
- `src/systems/VisualFX.ts` — NEW: brush-stroke rendering helpers, ink-splash particles, ember glow shader, win-color-reveal
- `src/systems/WavedashAdapter.ts` — leaderboard integration, graceful no-op
- `wavedash.toml` — Wavedash deploy config
- `public/assets/maps/tower.json` — the hand-authored Tiled climb
- `public/assets/audio/music.ogg|mp3` — user-provided background music slot
- `.github/workflows/pages.yml` — branch + PR preview deploys
- `.github/workflows/cleanup-preview.yml` — prune deleted branch / closed PR subfolders
- `.github/workflows/gitleaks.yml` — block accidental secret leaks
- `.gitignore` — covers node_modules, dist, env files, creds, build artifacts
- `SECURITY.md` / `CREDITS.md` — OSS hygiene stubs
- `src/x402/client.ts` — stretch only
- `server/src/index.ts` — stretch only

---

## Verification Plan

- **M0 smoke test:** `npm run dev` shows a Phaser 4 scene with a Matter body falling under gravity. Dry-run `wavedash build push` succeeds with a stub dist.
- **M1 smoke test:** fire rope at various angles, confirm swing feels like Worms (rigid, momentum preserved on detach). No NaN errors in console. FPS stable at 60.
- **Full playthrough:** complete the tower top-to-bottom before shipping each milestone. Record a no-death run time as baseline.
- **Theme adaptation check (M2.5 — Machines):** after updating `theme.ts` + `VisualFX.ts` decoration helpers + `GameScene` decoration pass, the title card reads "THE HARNESS · one ember. one cable. reignite the core.", the first arena shows rivets, dead pipes, frozen gauge dials, and gear silhouettes in the parallax, the HUD says "DEPTH REMAINING" / "CUT CABLE", and the physics and controls are byte-identical to the pre-theme build. The grey-to-molten win-reveal plays on ignition trigger.
- **Wavedash e2e (M5):** run dev build with `WavedashJS` loaded → complete a run → confirm `uploadLeaderboardScore` call succeeds and appears in Wavedash dev portal.
- **Build verification (M6):** `npm run build` → serve `dist/` → walk through Menu → Game → End. Confirm no absolute paths break. Deploy to itch (draft), Pages, and Wavedash; play each and confirm identical behavior.
- **Itch iframe test:** upload zipped dist to a draft itch page, play inside the iframe, confirm input and audio work.
- **x402 e2e (stretch):** with a Base Sepolia wallet holding test USDC, click Unlock → wallet prompts → approval → cosmetic appears → reload → cosmetic still applied (receipt verified locally).
- **Open source check:** fresh clone → `npm i && npm run dev` works with zero extra setup. README build instructions accurate.
- **Preview deploy check (M3.5):** push a throwaway branch → within 2 min, `https://thenanox.github.io/theharness/branch/<name>/` loads the game. Open a PR → sticky comment appears with a `/pr/<n>/` URL. Close the PR → subfolder is pruned within one workflow run.
- **Secret hygiene check:** `gitleaks` workflow is green on every push. `git log -p` scan for `.env`, `key`, `token`, `secret` returns no hits. Cloning the repo as an anonymous user and building produces a working game with zero credentials.
- **Mobile learn-curve check:** hand the phone to someone who hasn't seen the game → they cross the first gap within 30 seconds in Tap mode. Toggle to Aim mode, confirm hold-to-aim reveals the aim line and release fires at the dragged angle.
