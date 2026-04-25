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

Visual direction: **"Dead Oscilloscope / CRT Phosphor"** — near-black screen
with a single phosphor trace that warms from cold green at the base to
white-hot at the ignition core. One ember cable, one run. On ignition,
the machine fires back up and the world re-colors for the first and only
time.

---

## Jam entry

**Gamedev.js Jam 2026** · April 13–26, 2026 · Theme: MACHINES
→ https://itch.io/jam/gamedevjs-2026

Challenges targeted:
- **Theme — MACHINES** — the tower IS a dead machine; the winch cable is the last
  live mechanism; winning reignites the core
- **Build it with Phaser** — Phaser 4 + Matter.js rigid-rope constraint
- **Open Source** — MIT, public repo, gitleaks on every push
- **Deploy to Wavedash** — leaderboard integration (best completion time)

---

## Play

- **Production (main)**: https://thenanox.github.io/theharness/
- **itch.io**: https://thenanox.itch.io/the-harness
- **Wavedash playtest**: https://wavedash.com/playtest/the-harness/39d18195-d62b-43f4-b3c7-734325d3a845

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

---

## How it was made

**The Harness was built entirely with [Claude Code](https://claude.ai/code)**
— Anthropic's AI coding assistant — operated exclusively from a **mobile
phone**, with no laptop or desktop involved at any point during development.

The entire game — rope physics, level design, visual effects, input system,
CI/CD pipelines, tests, and this README — was authored through conversation
with Claude Code over the 13-day jam window. Each feature was developed on
a dedicated branch, reviewed as a PR, and merged to main. The 16 PRs in
this repo tell the full story of how the game evolved from a blank scaffold
to a complete, playable jam entry.

No traditional IDE. No keyboard. Just a phone and a model.

---

## Controls

Point-and-fire — the rope is the only locomotion. No jump, no walking.

### Desktop
- **Mouse cursor**: aim (rope fires toward the cursor, up to its max length)
- **Left-click / space**: fire rope (IDLE) / detach (SWINGING)
- **W / up**: reel in &nbsp;·&nbsp; **S / down**: reel out
- **A / D / ◄ / ►**: pendulum pump while swinging
- **Right-click**: hard detach
- Press **\`** to open the runtime physics tuning panel

### Mobile (portrait 9:16)
- **Touch the arena**: aim guide appears at the touch point, release to fire.
  Quick taps snap-fire. Touching again while SWINGING detaches.
- **Bottom-left joystick (◄ ► ▲ ▼)**: pendulum pump / reel in / reel out.
  The joystick is a no-fire zone — taps on it never trigger the rope.

Game plays natively in portrait orientation — no "rotate your device" overlay.

---

## Stack

- [Phaser 4](https://phaser.io/) + Matter.js (rope physics via distance constraint)
- TypeScript + Vite
- Procedural "Ink & Ember / Dead Oscilloscope" rendering via Phaser Graphics API
  (no tilesets, no external art assets — artist-free for a jam)
- Vitest test suite covering the rope state machine (mandatory pre-merge)

---

## Build

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # produces ./dist with VITE_BASE defaults to './'
npm run typecheck    # tsc --noEmit
npm test             # vitest watch
npm run test:run     # vitest one-shot (CI)
```

For GitHub Pages builds, the CI workflow sets `VITE_BASE` automatically
from the branch/PR context. If you want to build locally with a specific
base, set `VITE_BASE=/theharness/` before `npm run build`.

---

## Deploy targets

The same `dist/` build ships to three places:

- **GitHub Pages**: branch + PR previews via `.github/workflows/pages.yml`.
  Uses `peaceiris/actions-gh-pages` to publish to subfolders on a shared
  `gh-pages` branch.
- **itch.io**: `npm run build && cd dist && zip -r ../harness.zip .` →
  upload as HTML5 (viewport 480×854 portrait). Default `VITE_BASE='./'` already
  works inside the itch iframe.
- **Wavedash**: `npm run build && wavedash build push` (reads
  `wavedash.toml`, uploads `./dist`). Leaderboard scores best completion time.

---

## Audio

Background music is a single slot at
`public/assets/audio/music.ogg` (+ optional `music.mp3`).
If the file is missing at load time the game runs silent — no crash.
Drop a new track into that folder, push, and the next preview deploy
picks it up.

---

## Security & open-source hygiene

The repo is public. We take care to never publish secrets or tokens:

- `.gitignore` blocks `.env*`, `*.pem`, `*.key`, `.wrangler/`, `.wavedash/` and friends
- `.github/workflows/gitleaks.yml` runs on every push and PR
- All deploy credentials live in GitHub Actions secrets or external vaults —
  never in the repo
- Report vulnerabilities: see [`SECURITY.md`](./SECURITY.md)
- Asset attribution: see [`CREDITS.md`](./CREDITS.md)

---

## License

MIT — see [LICENSE](./LICENSE).
