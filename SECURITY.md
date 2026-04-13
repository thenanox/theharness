# Security Policy

## Supported Versions

The Harness is an open-source game jam entry. We patch the `main` branch only.

## Reporting a Vulnerability

If you find something security-relevant — a leaked key in git history, an
unpatched dependency, an XSS in the HUD, anything that could harm a player —
please open a **private** security advisory via GitHub:

<https://github.com/thenanox/theharness/security/advisories/new>

Do not open a public issue for security reports.

We aim to acknowledge reports within 72 hours. Since this is a jam entry with
a tiny threat surface (a static HTML5 game), most reports will be triaged as
"informational" unless they expose player data or credentials.

## What is in scope

- Secrets or credentials accidentally committed to the repo
- XSS / injection via game text fields, leaderboards, or x402 flows
- Vulnerable dependencies flagged by `npm audit`
- Cloudflare Worker issues (stretch goal only)

## What is NOT in scope

- Game balance, difficulty, or "rage quit" moments — that's the genre.
- Browser-level autoplay / fullscreen prompts.
- Third-party services (itch.io, Wavedash, GitHub Pages) — report to them directly.

## Our pledge

- We will never commit real secrets to this repo.
- All deploy credentials live in GitHub Actions secrets or external vaults.
- Pre-push `gitleaks` scanning is enforced on CI for every commit.
