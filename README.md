# The Harness

A one-run rope-climbing platformer for **[Gamedev.js Jam 2026](https://itch.io/jam/gamedevjs-2026)**.
Theme: **MACHINES**.

> **Climb a dead machine. Reignite the core. One ember, one cable, one run.**

You are the last maintainer of a colossal engine that stopped turning a
hundred years ago. The ignition chamber sits at the top of the stalled
core, and you're carrying the last live ember on a winch cable — climb
the machine's internal shafts, thread the cable through frozen boiler
halls and dead gauge shafts, and reignite the core before your ember
burns out.

Inspired by the Worms Ninja Rope and Jump King: a single life, a single
rope, and a tower that wants you at the bottom.

Visual direction: **"Ink & Ember"** — a sumi-e ink-wash world of oiled
iron, frosted gauge glass, and oxidized copper, where the ember cable is
the only warm thing on screen. On ignition, the machine fires back up
and the world re-colors for the first and only time. Easy to learn,
hard to master.

## Play

- **Production (main)**: https://thenanox.github.io/theharness/
- itch.io: _coming soon_
- Wavedash: _coming soon_

> ⚠️ **Are the links above 404?** GitHub Pages has to be enabled once by
> hand before any of the preview URLs resolve — the workflow already
> publishes the built game to the `gh-pages` branch, but GitHub won't
> serve anything until Pages is switched on. See **First-time setup**
> below. It takes 20 seconds.

### Iteration loop — every commit is playable

Every push to **any** branch auto-deploys to a GitHub Pages subfolder via
`.github/workflows/pages.yml`:

| Trigger                        | URL                                                                      |
| ------------------------------ | ------------------------------------------------------------------------ |
| Push to `main`                 | `https://thenanox.github.io/theharness/`                                 |
| Push to any other branch `foo` | `https://thenanox.github.io/theharness/branch/<foo>/` (slashes → dashes) |
| Pull request #42               | `https://thenanox.github.io/theharness/pr/42/`                           |

Pull requests get a sticky comment with their preview URL automatically.
Stale previews are pruned by `.github/workflows/cleanup-preview.yml` when
a branch is deleted or a PR is closed.

Allow ~1-2 minutes after a push for the deployment to go live.

### First-time setup (repo owner, one-time, **REQUIRED**)

Until these two toggles are flipped, every preview URL will return 404
even though the workflow is publishing files correctly.

1. **Enable Pages**: go to
   [Settings → Pages](https://github.com/thenanox/theharness/settings/pages)
   → **Source: Deploy from a branch** → pick branch **`gh-pages`** and
   folder **`/ (root)`** → **Save**. The `gh-pages` branch is already
   populated by the first workflow run, so you can do this now.
2. **Allow workflow writes**: go to
   [Settings → Actions → General](https://github.com/thenanox/theharness/settings/actions)
   → **Workflow permissions** → **Read and write permissions** → Save.

Within ~1 minute of saving step 1, `https://thenanox.github.io/theharness/pr/2/`
and every other preview URL in the table above will start serving the game.
The workflows use only `GITHUB_TOKEN` — no secrets to configure.

## Controls

### Desktop
- **Mouse aim + left click / space**: fire rope (or detach if swinging)
- **W / up**: reel in (jump when grounded)
- **S / down**: reel out
- **A / D / arrows**: walk, air nudge
- **Right-click / space**: hard detach

### Mobile (touch) — two modes, `ⓘ MODE` toggle top-left

**MODE · TAP** _(default, easy)_
- Tap anywhere: fire rope at tap point (or detach if already swinging)
- Bottom-left `◄ ►`: walk / air nudge
- Bottom-right `▲`: reel in (jump when grounded)
- Bottom-right `▼`: reel out (detach when swinging)

**MODE · AIM** _(hard-to-master depth)_
- Hold on the arena ≥110 ms to reveal the ember aim line
- Drag to tune angle and length; release to fire
- Quick taps (<110 ms) still snap-fire, so Tap-mode muscle memory carries over
- All four hold-buttons work identically to Tap mode
- `▲` during a swing smoothly reels in — the Worms pendulum-tightening
  move — and is the core high-level mobile skill

Game is landscape 16:9 — rotate phone for best experience. A rotate-hint
overlay appears on portrait phones.

## Stack

- [Phaser 4](https://phaser.io/) + Matter.js (rope physics via distance constraint)
- TypeScript + Vite
- Procedural "Ink & Ember" rendering via Phaser Graphics API (no tilesets yet)
- Tiled (level authoring — later milestone)

## Build

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # produces ./dist with VITE_BASE defaults to './'
npm run typecheck    # tsc --noEmit
```

For GitHub Pages builds, the CI workflow sets `VITE_BASE` automatically
from the branch/PR context. If you want to build locally with a specific
base, set `VITE_BASE=/theharness/` before `npm run build`.

## Deploy targets

The same `dist/` build ships to three places:

- **GitHub Pages**: branch + PR previews via `.github/workflows/pages.yml`.
  Uses `peaceiris/actions-gh-pages` to publish to subfolders on a shared
  `gh-pages` branch.
- **itch.io**: `npm run build && cd dist && zip -r ../harness.zip .` →
  upload as HTML5 (viewport 960×540). Default `VITE_BASE='./'` already
  works inside the itch iframe.
- **Wavedash**: `npm run build && wavedash build push` (reads
  `wavedash.toml`, uploads `./dist`).

## Audio

Background music is a single slot at
`public/assets/audio/music.ogg` (+ optional `music.mp3`).
If the file is missing at load time the game runs silent — no crash.
Drop a new track into that folder, push, and the next preview deploy
picks it up.

## Challenges targeted

- **Theme — MACHINES** — the harness itself is a mechanical winch + climbing
  rig, and the entire level is the internals of a single dead machine the
  player is trying to reignite. One ember cable is the only live machinery
  on screen until the win-moment ignition reveal.
- **Build it with Phaser** — Phaser 4 + Matter
- **Open Source** — MIT licensed, public repo, gitleaks scans, `SECURITY.md`
- **Deploy to Wavedash** — `WavedashJS` leaderboard integration (M5)
- **Ethereum** _(stretch)_ — x402 cosmetic unlocks on Base

## Security & open-source hygiene

The repo is public. We take care to never publish secrets or tokens:

- `.gitignore` blocks `.env*`, `*.pem`, `*.key`, `.wrangler/`, `.wavedash/` and friends
- `.github/workflows/gitleaks.yml` runs on every push and PR
- All deploy credentials live in GitHub Actions secrets or external vaults —
  never in the repo
- Report vulnerabilities: see [`SECURITY.md`](./SECURITY.md)
- Asset attribution: see [`CREDITS.md`](./CREDITS.md)

## License

MIT — see [LICENSE](./LICENSE).
