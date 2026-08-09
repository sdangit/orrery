# HANDOVER: Elite Dangerous Live System Orrery

Project handover from Claude.ai chat session (2026-08-09) to Claude Code. Read this whole doc before writing code.

## Vision

A personalized, real-time 3D orrery of the star system the player is *currently in*, built from actual game data, designed to live on a **second monitor** while playing. Super futuristic ED-cockpit aesthetic (orange/cyan HUD). It answers, at a glance, the question the in-game UI makes you dig through three interfaces for: *"what in this system matters to what I'm doing right now?"*

Core design problem it solves: procedural body names (LK-4 OC etc.) are unmemorable. The app identifies bodies **spatially and visually** — icons, position, glow — with names demoted to secondary labels, plus a pin/nickname feature.

Owner: Terje (Lethio). Ethos applies: offline-first, no tracking, no cloud dependency. The tool should work with zero network access when journal data is available locally.

## Second-monitor design principles

- **Glanceable at 1m in 1s.** Big type, few words, brutal hierarchy. The player's hands and eyes are on the game; this screen is peripheral vision most of the time.
- **Passive-first.** Minimal required interaction. Auto-mode switching (below) does the work; clicks are for planning moments, not action moments. Click targets large.
- **GPU-polite.** It shares a card with ED (RTX 3060 12GB). Implement an FPS cap (30 default), pause rendering when the model is static and no animation is due, and a low-power toggle. requestAnimationFrame + dirty-checking, not a hot loop.
- **First-discovery is sacred.** `WasDiscovered: false` / `WasMapped: false` bodies get the loudest treatment in the app, in every mode, always. Same for high-value scan targets (ELW, WW, AW, terraformable) — these never get filtered out by mode.

## Activity modes

One rendering pipeline, per-mode highlight/data overlays. Manual mode picker + **auto-detection from journal events** (auto wins unless the user has pinned a mode):

| Mode | Auto-trigger events | What lights up | Key data sources |
|---|---|---|---|
| Exploration (default) | `FSSDiscoveryScan`, `Scan` | Undiscovered/unmapped bodies, ELW/WW/AW/terraformables, est. mapping value | `Scan` (`WasDiscovered`, `WasMapped`, `TerraformState`, `PlanetClass`), embedded community value formulas |
| Exobiology | `ScanOrganic`, `FSSBodySignals` w/ bio | Bodies with bio signal counts, predicted genera + Vista Genomics value (landable + atmosphere + temp heuristics), sample progress 1/3–3/3, **unsold data at risk** total | `FSSBodySignals`, `SAASignalsFound`, `ScanOrganic`, embedded genera/value tables |
| Mining | `LaunchDrone` (prospector), `MiningRefined`, cargo scoop flag in Status.json | Ringed bodies by ring type, `ReserveLevel` (Pristine glows), hotspot contents once mapped | `Scan.Rings`, `ReserveLevel`, `SAASignalsFound` |
| Pirate hunting | `Bounty`, `ShipTargeted`, `UnderAttack` | Rings w/ reserves (RES sites), nav beacon, system security, faction states (War/Civil War → combat zones), session bounty tally | `FSDJump` (SystemSecurity, Factions/States), `Bounty` |

Mode detection is a small pure function over recent journal events (last N minutes, weighted) — unit-test it with recorded event sequences.

## The name problem (identity layer)

- Per-body-type icon language + color coding; name rendered small and secondary.
- Pin bodies (persist per system, local JSON) and assign nicknames ("money moon"). Nicknames show in place of designations.
- "Next in route" badge from `NavRoute.json`, so post-jump the relevant body is already glowing.
- Copy-name button on the detail sheet (for pasting into external tools; can't paste into the game, set expectations).
- Optional short audio cue on first-discovery / bio-signal detection (off by default, Web Audio, no assets needed).

## Session tracker (thin, v1.5)

Small persistent strip: session credits earned (bounties, sales), bodies scanned, bio samples carried & unsold estimated value ("AT RISK: 38.2M" in hud-red when > some threshold), first discoveries this session.

## What already exists

A single-file HTML prototype (`ed-space-tutor.html`, in this same folder) with two modes:

1. Galaxy map — fixed XYZ star positions (ly, Sol origin), jump-range sphere, greedy route plotting, drop-stalks to the galactic plane.
2. System orrery — fake 3-planet system, animated orbits, a ship sim with a gravity-well speed cap and a distance/6s approach rule.

Reuse from it: the visual language (design tokens below), the manual orbit camera (Three.js r128, no OrbitControls), the label-sprite helper, the ring/well rendering approach, the panel layout. Discard: all hardcoded fake bodies, the ship sim (out of scope for v1), the galaxy mode (maybe v2).

### Design tokens (keep these)

- `--hud-orange: #ff8a2a`, dim `#7a4a1e`, faint `#3a220e`
- `--hud-cyan: #0ae6f0` (data values, selection)
- `--hud-amber: #ffd24d` (highlights, ship/markers)
- `--hud-red: #ff3b30` (warnings, gravity wells)
- `--bg: #060402`, panels `#0d0805e6`
- Monospace everywhere (Consolas / JetBrains Mono stack — Terje has JetBrains Mono Nerd Font locally)
- Scanline overlay via repeating-linear-gradient, angled clip-path tab buttons, thin bordered panels

## Data sources (in priority order)

### 1. Player Journal files (primary — live, offline, personal)

ED on PC writes newline-delimited JSON journals:

- Windows: `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous\Journal.*.log`
- Also useful in same dir: `Status.json` (live flags, updated ~1/sec), `NavRoute.json`, `Cargo.json`

Key events to parse:

- `Location` / `FSDJump` — current system name, address, star pos
- `Scan` — the goldmine. Per body: `BodyName`, `BodyID`, `Parents` (hierarchy!), `PlanetClass`/`StarType`, `MassEM`/`StellarMass`, `Radius` (m), `SurfaceGravity`, `SurfaceTemperature`, `Landable`, `AtmosphereType`, `Materials`, `Rings`, and the Keplerian set: `SemiMajorAxis` (m), `Eccentricity`, `OrbitalInclination` (deg), `Periapsis` (arg of periapsis, deg), `OrbitalPeriod` (s), `AscendingNode`, `MeanAnomaly` (both present in current-era journals), plus `RotationPeriod`, `AxialTilt`, `TidalLock`
- `ScanBaryCentre` — barycentre orbital elements for binary pairs (needed to place binaries correctly)
- `FSSDiscoveryScan` / `FSSAllBodiesFound` — how many bodies exist vs discovered
- `SAAScanComplete` — mapped bodies

Caveat: journals only contain bodies the player has scanned this session (or via FSS honk + discovery). Backfill from API when incomplete.

Caveat 2: verify exact field availability against the official Journal Manual (v38+, Frontier forums) rather than trusting this doc from memory. `MeanAnomaly`/`AscendingNode` presence should be confirmed — if absent in older entries, fall back to random/epoch phase.

### 2. EDSM API (backfill by system name)

`https://www.edsm.net/api-system-v1/bodies?systemName=<name>` — full body list with orbital elements for known systems, no auth, JSON. Free, community-run; cache aggressively and fail gracefully offline.

### 3. Spansh (alternative backfill / dumps)

`https://spansh.co.uk/api/` has system endpoints; also full galaxy dumps if we ever want local-only lookup. Overkill for v1.

## Orbital rendering math

Each `Scan` gives Keplerian elements relative to the body's parent (see `Parents` array — bodies orbit stars, moons orbit planets, some orbit barycentres, "Null" parents ARE barycentres). Position at time t:

1. Mean anomaly M = M0 + 2π·(t − t0)/OrbitalPeriod
2. Solve Kepler: E − e·sin E = M (Newton iteration, 5 loops is plenty)
3. True anomaly ν from E; r = a(1 − e·cos E)
4. Rotate by argument of periapsis, inclination, ascending node into parent frame
5. Walk the `Parents` chain to get absolute position

Scale problem: real systems span from 0.01 AU moons to 500,000 ls stars. Use log-ish or per-branch compressed scaling for display with a "true scale" toggle, and exaggerate body radii (real scale is invisible). This is a design decision — flag it in the UI so it teaches rather than lies.

Time control: real-time (bodies barely move) plus warp slider up to ~100,000x, and a "now" reset.

## Suggested architecture

Two processes, communicating locally only:

- `watcher/` — small Node process (chokidar or fs.watch) tailing the newest Journal file + Status.json, maintaining a "current system model" (merge Scan events, resolve Parents tree, backfill from EDSM if enabled), pushing over a local WebSocket (ws://127.0.0.1) as JSON snapshots + deltas.
- `ui/` — Vite + Three.js (plain JS is fine, TS if the agent prefers). Renders the orrery, panels, body detail sheet. Also runs standalone with a bundled demo system JSON for development without the game running.

Alternative if a single binary is wanted later: Tauri wrapper. Do NOT start there; v1 is `npm run dev` + a local watcher.

Repo hygiene: MIT license (Lethio default), `.gitignore` for node_modules and any copied journal samples containing the commander name if that matters, README with a no-asterisk privacy note (all data stays on the machine; EDSM lookup is opt-in and clearly labeled as the only network call).

## MVP milestones

1. Parse a static sample journal (commit a scrubbed sample) into a body tree; unit-test Parents resolution, Kepler solver, and the mode-detection function.
2. Render the tree as a static orrery with correct relative positions at t=now; selection + data panel; first-discovery + high-value treatment.
3. Live mode: watcher process, WebSocket, auto-switch when the player jumps systems; FPS cap + idle render pause.
4. Activity modes: exploration + exobiology first (highest info payoff), then mining, then pirate hunting. Auto-detection wired to the same event stream.
5. Identity layer: icons, pins/nicknames (local JSON persistence), NavRoute badge.
6. EDSM backfill toggle for unscanned bodies (dimmer/wireframe = "known, not yours yet").
7. Polish: warp slider, true-scale toggle, ring rendering, session tracker strip, optional audio cues.

## Open questions for Terje (ask before coding)

1. Platform check: journals exist on PC only. Confirm the journal path exists on his machine (console editions are sunset, so almost certainly PC, but verify the path and whether he runs Odyssey — exobio requires it).
2. Ship's live position inside the system is NOT directly available (Status.json has planetary lat/long only; no free-space supercruise coords). Nearest approximation: proximity/targeting events. Set expectations before he asks for a live ship dot.
3. EDSM backfill on by default, or strictly-offline default with opt-in? Given Lethio ethos, recommend opt-in.
4. Second monitor delivery: fullscreen borderless browser tab is v1. Ask whether a frameless always-on-top window (Tauri) is worth it later — don't build it first.
5. Which activity does he do most right now? Build that mode's overlay second (after exploration default) to get real-play feedback fastest.
6. Verify current journal schema against the official Journal Manual before trusting field names in this doc — especially `FSSBodySignals`, `SAASignalsFound` signal type strings and `MeanAnomaly`/`AscendingNode` availability.

## Prototype file

`ed-space-tutor.html` sits next to this doc. Open it once before building — the target look and feel is that, but denser with real data.
