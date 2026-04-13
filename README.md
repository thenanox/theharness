# The Harness

A one-run rope-climbing platformer for **Gamedev.js Jam 2026**.
Inspired by the Worms Ninja Rope and Jump King: a single life, a single rope, and a tower that wants you at the bottom.

## Play

- itch.io: _coming soon_
- GitHub Pages: _coming soon_
- Wavedash: _coming soon_

## Controls

- **Mouse aim + left click / space**: fire rope
- **W / up**: reel in
- **S / down**: let out
- **A / D**: walk, nudge mid-air
- **Space (while swinging)**: detach

## Stack

- [Phaser 4](https://phaser.io/) + Matter.js (rope physics via distance constraint)
- TypeScript + Vite
- Tiled (level authoring)

## Build

```bash
npm install
npm run dev     # dev server at localhost:5173
npm run build   # produces ./dist
```

## Deploy targets

The same `dist/` build ships to three places:

- **itch.io**: `zip -r harness.zip dist && upload` (HTML5 project)
- **GitHub Pages**: pushed automatically via `.github/workflows/pages.yml` (set `VITE_BASE=/theharness/`)
- **Wavedash**: `wavedash build push` (reads `wavedash.toml`)

## Challenges targeted

- **Build it with Phaser** — Phaser 4 + Matter
- **Open Source** — MIT licensed, public repo
- **Deploy to Wavedash** — shipped with `WavedashJS` leaderboard integration
- **Ethereum** _(stretch)_ — x402 cosmetic unlocks on Base

## License

MIT — see [LICENSE](./LICENSE).
