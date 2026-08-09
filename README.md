# ORRERY

**A live 3D map of the star system you're in — built from your own Elite Dangerous journal, running on your second monitor.**

<!-- demo gif goes here -->

Jump into a system, and ORRERY renders it: real bodies, real orbits, moving in real time (or up to 100,000× faster). It answers at a glance what the in-game UI makes you dig through three panels for — *what in this system matters to what I'm doing right now?*

<!-- screenshots go here -->

## What it does

- **Live-follows your game.** A tiny local watcher tails your journal folder; the view switches the instant you jump. No game running? It opens on a bundled demo system.
- **Auto-detects what you're doing** — exploration, exobiology, mining, or bounty hunting — from your recent journal events, and re-lights the map for that activity (pin a mode manually any time):
  - **Exploration** — undiscovered and unmapped bodies, Earth-likes, water/ammonia worlds, and terraformables glow in every mode, always.
  - **Exobiology** — biological signal counts, confirmed genuses, and per-species sample progress (1/3 → 3/3).
  - **Mining** — ringed bodies by ring class; pristine and major reserves glow.
  - **Bounty hunting** — system security, factions at War/Civil War, nav beacon status, session bounty tally.
- **Solves the procedural-name problem.** "LK-4 OC b17-2 A 12 e a" is unmemorable; a glowing icy moon in the right place isn't. Bodies read by icon, color, and position — names are demoted to short designators, and you can pin your own nicknames ("money moon") that persist per system.
- **Time warp** from real-time to 100,000×, with orbit-path ellipses tracing the system's structure. Two scale modes, both honest about what they are: compressed (everything visible) and true distances (space is mostly nothing).
- **Session strip**: scans, first discoveries, bounty earned.
- **EDSM backfill (opt-in)**: bodies the community knows but you haven't scanned yet appear as dim wireframes — "known, not yours yet."
- Second-monitor niceties: GPU-polite rendering (idle = zero draw calls, 30 FPS cap — it shares your card with the game), four HUD color schemes, hidable legend, optional audio cues for first discoveries and bio signals (off by default).

## How accurate is it?

Short version: **as accurate as the game's own data, drawn at a scale you can actually see.**

- Orbits use the full Keplerian element set from your own `Scan` events (semi-major axis, eccentricity, inclination, argument of periapsis, ascending node, mean anomaly), propagated in closed form from the scan's timestamp — no integration drift, same two-body model the game uses. Binaries and co-orbiting moon pairs orbit their real barycentres.
- The **default view compresses distances logarithmically** — real systems span seven orders of magnitude and a literal rendering makes every moon invisible. Ordering is preserved and the badge always says "not to scale." Body sizes are exaggerated in both modes (real scale is sub-pixel).
- **True-distances mode** shows honest orbital spacing (1 unit = 10⁹ m). Body sizes stay exaggerated — the planetarium convention — and the badge says exactly that.
- **EDSM-backfilled bodies** have correct orbit size/shape but an *unknowable* position along the orbit (EDSM doesn't record orbital phase) — hence the wireframe and the "position approximate" notice.
- **No invented numbers, ever.** No credit-value estimates, no predicted genuses — only what the journal or EDSM actually reports. If a number would require guessing Frontier's current balance tables, it isn't shown.

Full details — the math, the journal-format quirks (Ring pseudo-bodies, parentless barycentres, the BodyID-0 single-star case), and every accuracy caveat — in **[TECHNICAL.md](TECHNICAL.md)**.

## Privacy

Everything runs on your machine. Journal files never leave it; the watcher binds to `127.0.0.1` only. The **single** network call in the entire app is the EDSM lookup — opt-in, off by default, clearly labeled "(network)" in the UI.

## Getting started

Requirements: [Node.js](https://nodejs.org) 20+, ED on PC (journals are PC-only; exobiology features need Odyssey).

**Easiest (Windows):** double-click **`Start Orrery.cmd`**. It installs dependencies on first run, starts the server, and opens the orrery in your browser.

**Terminal:**

```sh
npm install    # once
npm start      # builds the UI and serves everything at http://127.0.0.1:47821
```

Leave it running while you play — the view follows your jumps. Drag to orbit, wheel to zoom, click a body for details.

**Development:** `npm run dev --workspace=ui` (Vite dev server on :5173, hot reload) plus `npm run watch --workspace=watcher` in a second terminal. `npm test` runs the full suite (~250 tests, Node's built-in runner, no test dependencies).

## License

MIT
