# Elite Dangerous Live System Orrery

A personalized, real-time 3D orrery of the star system you're currently in, built from your own Elite Dangerous journal data, meant to live on a second monitor while you play. See [HANDOVER-ed-orrery.md](HANDOVER-ed-orrery.md) for the full design doc.

**Privacy:** everything runs locally. Journal files never leave your machine. The only optional network call is an opt-in EDSM lookup to backfill bodies you haven't personally scanned yet — off by default. The watcher's WebSocket server binds to 127.0.0.1 only.

## Status

- [x] **Milestone 1** — journal parsing core: NDJSON parser, body-tree builder (Parents chain resolution, including the Ring pseudo-body quirk and barycentre-without-Parents recovery), Kepler solver, and the pure activity-mode-detection function. All unit-tested against a real (scrubbed) journal fixture. See [watcher/](watcher/).
- [x] **Milestone 2** — static orrery render at t=now, selection + data panel, first-discovery/high-value treatment. See [ui/](ui/).
- [x] **Milestone 3** — live mode: watcher process tails the real journal directory, broadcasts system snapshots over a local WebSocket, UI auto-switches on system jump, FPS-capped + render-on-demand.
- [x] **Milestone 4** — auto-detection wired end-to-end (recent-events buffer → `detectMode` → every live snapshot → UI's Mode line, overridable by a manual pin persisted in localStorage). Exploration needs no extra overlay (already covered by the always-on spotlight treatment). Mining (ring reserve-level glow), piracy (system security, combat-zone factions, nav beacon, session bounty tally), and exobiology (bio signal counts, confirmed genuses, per-species sample progress — no genus prediction or credit values) are all built and either real-data-verified or sourced against authoritative journal-schema documentation. See the handover doc's progress log for exactly what's confirmed against real data vs. researched.
- [x] **Milestone 5** — identity layer: a per-body-kind icon language (star/planet/moon, landable status) prefixed on labels and the data panel header; pins/nicknames (persisted per system in localStorage, override the designator everywhere once set); a "next stop" badge sourced from `NavRoute.json`.
- [x] **Milestone 6** — EDSM backfill: an opt-in toggle (off by default) fetches known-but-unscanned bodies for the current system from EDSM's public API and renders them as dim wireframes ("known, not yours yet"). Real scan data is never overwritten. The one and only network call in the whole app — see `ui/src/edsm-client.js`.
- [x] **Milestone 7** — polish: time-warp slider (1×–100,000×, log scale, "reset to now"), true-scale toggle (honest distances/radii — small bodies genuinely become invisible, which is the point), session tracker strip (scans / first discoveries / bounty), optional audio cues (off by default, Web Audio blips, no asset files), HUD color-scheme picker (4 presets, 3D labels follow the scheme accent), camera reset button, and a hidable icon/color legend window. Plus a safety pass: CSP meta header, `replaceChildren` instead of `innerHTML`, all dynamic text rendered via `textContent`/canvas.

## Layout

This is an npm workspaces monorepo with three packages:

- `shared/` — pure orbital math used by both the watcher and the UI: Kepler solving, Parents-chain position resolution, the display-scale compression (real distances/radii span too many orders of magnitude to render true-to-scale — see the doc comment in `shared/src/display-scale.js`), the first-discovery/high-value spotlight classifier, and `edsm-mapping.js`/`edsm-backfill.js` (maps EDSM's API fields onto the journal's own vocabulary and merges backfill bodies into a tree without ever overwriting real scan data).
- `watcher/` — Node: parses journal files into a system body tree, and (as of milestone 3) a live process that tails the real journal directory and serves system snapshots over WebSocket. See its own module docs: `journal-locator.js` (finds the newest journal file), `journal-tailer.js` (incremental reads, handles a mid-write partial line), `system-model.js` (tracks "current system" across incoming events, detects real system switches vs. a same-system relog), `bio-signals.js` (exobiology event parsing), `nav-route.js` (reads the separate `NavRoute.json` snapshot file to find the next hop on a plotted route), `live-watcher.js` (ties all of those together into one `poll()` step — the piece scripts/watch.js's timer calls).
- `ui/` — Vite + Three.js: renders the orrery. Loads the bundled demo system immediately, then tries to connect to the live watcher in the background — if it's running, the view seamlessly switches from DEMO to LIVE; if not, it just stays on the demo, no error.
- `ed-space-tutor.html` — the original prototype (plain HTML + CDN Three.js, no build step). Reference for visual language and the manual orbit camera; `ui/` ports the same ideas through a proper local build instead of a CDN script tag, to stay offline-first.

## Running it

```
npm install                          # once, from the repo root — sets up all three workspace packages
npm test                             # runs every package's tests (248 as of milestone 7)
npm run dev --workspace=ui           # starts the orrery UI at http://localhost:5173
npm run watch --workspace=watcher    # (optional, in a second terminal) starts the live watcher against your real journal
```

Click a body to select it; drag to orbit the camera, wheel to zoom. With the watcher running and the game open, the System panel's "Source" line flips from DEMO to LIVE once it picks up your current system, and switches systems automatically when you jump.

**Milestone 2 demo data note:** the demo system (`ui/src/data/demo-system.json`, generated by `watcher/scripts/build-demo-snapshot.js` from the real fixture) is a real, previously-explored binary system — nothing in it is undiscovered or a high-value world (Earthlike/water/ammonia/terraformable), so the first-discovery/high-value spotlight styling exists and is unit-tested but won't visibly trigger in this particular demo. It'll light up the first time the live watcher sees an actual unexplored body or valuable world.

**Visual verification caveat:** this UI was built and tested (module build, production bundle, and a headless Node test suite that constructs the real Three.js scene graph against real data and checks it for sane geometry — see `ui/test/`) without ever being opened in an actual browser, since the environment it was built in has no browser/screenshot tooling. Open `http://localhost:5173` yourself before trusting it looks right.

## Running the tests

Each package uses Node's built-in test runner (`node:test`) — no test framework dependency. Run them all from the root with `npm test`, or per-package with `npm test --workspace=shared` (etc).

`watcher`'s and `shared`'s tests run against `watcher/test/fixtures/sample-journal.log`, a real journal excerpt (scrubbed of any commander-identifying fields) covering a binary star system with belt clusters, moons, moon-of-moon chains, and barycentre-hosted moon pairs. `ui`'s tests run against the demo snapshot generated from that same fixture. `watcher/test/watch-process.test.js` is a real end-to-end test: it spawns the actual `scripts/watch.js` process against a synthetic (not your real) journal directory and connects a real WebSocket client to it. `shared/test/edsm-*-live.test.js` and `ui/test/edsm-client-live.test.js` make real requests to the actual EDSM API (including, for one of them, this project's own real demo system) — they skip their assertions with a warning rather than failing if there's no network.
