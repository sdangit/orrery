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
7. Polish: warp slider, true-scale toggle, ring rendering, session tracker strip, optional audio cues, HUD color-scheme picker, camera reset button (added to scope 2026-08-09, per Terje).

## Open questions for Terje (ask before coding)

1. Platform check: journals exist on PC only. Confirm the journal path exists on his machine (console editions are sunset, so almost certainly PC, but verify the path and whether he runs Odyssey — exobio requires it).
2. Ship's live position inside the system is NOT directly available (Status.json has planetary lat/long only; no free-space supercruise coords). Nearest approximation: proximity/targeting events. Set expectations before he asks for a live ship dot.
3. EDSM backfill on by default, or strictly-offline default with opt-in? Given Lethio ethos, recommend opt-in.
4. Second monitor delivery: fullscreen borderless browser tab is v1. Ask whether a frameless always-on-top window (Tauri) is worth it later — don't build it first.
5. Which activity does he do most right now? Build that mode's overlay second (after exploration default) to get real-play feedback fastest.
6. Verify current journal schema against the official Journal Manual before trusting field names in this doc — especially `FSSBodySignals`, `SAASignalsFound` signal type strings and `MeanAnomaly`/`AscendingNode` availability.

## Prototype file

`ed-space-tutor.html` sits next to this doc. Open it once before building — the target look and feel is that, but denser with real data.

## Progress log

### Milestone 1 — done (2026-08-09)

Built `watcher/` as a pure parsing library (no file-watching yet — that's milestone 3): NDJSON journal parser, body-tree builder, Kepler solver, orbital-position walker, and the mode-detection function, all unit-tested (48 tests, `node:test`, zero dependencies) against a real scrubbed journal excerpt at `watcher/test/fixtures/sample-journal.log`.

That fixture turned out to be a good stress test on its own: a binary star system (Col 285 Sector TI-U b18-2, from the owner's own Nov 2025 play session) with belt clusters, moons, a moon-of-a-moon chain, and multiple barycentre-hosted co-orbiting moon pairs. It exercises both hard cases flagged in the doc above:

- **The Ring quirk**: a ring is never independently scanned — a belt cluster's `Parents` chain names a synthetic ring id (e.g. `[{"Ring":3},{"Star":1},{"Null":0}]`) that has no `Scan`/`ScanBaryCentre` event of its own. `resolveParentLinks()` collapses Ring entries out of every chain so belt clusters resolve straight to the star/planet that actually owns the ring.
- **Barycentres have no `Parents` of their own**: `ScanBaryCentre` gives orbital elements for a barycentre BodyID but nothing about what it orbits. Its parent is only recoverable from *other* bodies' chains (a moon's `Parents` naming that barycentre id, followed by the real parent). Handled by unioning parent-links derived from every body's chain, not just the barycentre's own record.

Also resolved two of the open questions below from real data rather than guesswork:

- **Q1 (platform/Odyssey)**: confirmed. Real journals exist locally at the documented path; the current file's `Fileheader` shows `"Odyssey":true`, game version 4.4.0.3 (Aug 2026).
- **Q6 (schema verification)**: confirmed against real 2026-era journals — `MeanAnomaly` and `AscendingNode` are both present on every `Scan` and `ScanBaryCentre` event in the sample, in degrees, with the scan's own `timestamp` serving as that element set's epoch (there's no separate epoch field). No `ScanOrganic`/`FSSBodySignals` events were available in local history to verify those exact signal-type strings yet — still worth a spot-check before building the exobiology mode overlay in milestone 4.

Questions 3-5 (EDSM default, second-monitor delivery, which activity mode to prioritize) are still open — they're product decisions, not things code archaeology can resolve.

### Milestone 2 — done (2026-08-09)

Static orrery render, live at `ui/`: Vite + a locally-installed Three.js (not the prototype's CDN script tag — see below), the tree from milestone 1 walked into absolute positions at t=now, selection via raycasting, and a data panel.

Two decisions were made with Terje before building, since his own journal history couldn't settle them from data alone:

- **Demo data stays 100% real, no fabrication.** His local journal history has zero undiscovered bodies and zero ELW/WW/AW/terraformable worlds, so the milestone's "first-discovery/high-value bodies get the loudest treatment, always" requirement is implemented and unit-tested (`shared/src/spotlight.js`) but doesn't visibly trigger against the bundled demo system. It'll light up the first time the live watcher (milestone 3+) sees a real one.
- **Vite + npm-installed Three.js, not the prototype's CDN `<script>` tag.** Matches the handover's suggested architecture and stays offline-first after one `npm install`, rather than depending on a CDN being reachable.

Building the renderer forced a repo restructure into npm workspaces (`shared/` / `watcher/` / `ui/`): the Kepler solver and Parents-chain position walker from milestone 1 turned out to be needed in the browser too (the UI has to recompute positions every frame once warp/live-time exist in later milestones, not just once at build time), so they moved out of `watcher/` into a new `@orrery/shared` package both `watcher` and `ui` depend on. `shared/`'s own tests were rewritten to use a synthetic tree fixture instead of reaching into watcher's journal fixture, so each package's tests stay self-contained.

New in `shared/`: `display-scale.js` (log-compression for both orbital distances and body radii — this system's own real data spans ~10⁶ m moon orbits to ~5×10¹² m binary separation, six-plus orders of magnitude, so a literal metres-to-pixels mapping would render every inner planet as an invisible dot; see that file's doc comment for the "teaches rather than lies" reasoning the handover calls for), `display-position.js` (composes compression with the parent-chain walk, compressing *each level* before summing rather than compressing one final giant vector — the latter would wreck relative spacing between tightly-orbiting bodies), and `spotlight.js` (the classifier above).

Belt clusters render as a ring band on their owning star/planet (from the real `Rings` data) rather than as individual points — the journal gives no per-cluster angular position, only that they exist somewhere in the band, so inventing 3D positions for them would be exactly the kind of fabrication just ruled out for the discovery/value data.

**Real limitation, not a corner cut:** this was built and validated (production build, and a headless Node test suite in `ui/test/` that constructs the actual Three.js scene graph against the real demo data) in an environment with no browser or screenshot tooling available. It has never actually been opened and looked at. Open `http://localhost:5173` before trusting the visual output — see the README's verification caveat.

### Milestone 3 — done (2026-08-09)

Live mode: `watcher/scripts/watch.js` tails the real journal directory and broadcasts system snapshots to the UI over a local (127.0.0.1-only) WebSocket. The UI loads the demo system immediately on open, then tries the live connection in the background — if a watcher is running it switches seamlessly from DEMO to LIVE (visible in the System panel's Source line); if not, it just stays on the demo, no error surfaced. This preserves milestone 2's "runs standalone, no game required" property rather than replacing it.

Implementation is split so the only untested code is a thin timer + WebSocket wrapper:

- `journal-locator.js` — finds the newest `Journal.*.log` by the timestamp embedded in the filename (not mtime, which sync/backup tools can clobber).
- `journal-tailer.js` — incremental reads from a byte offset; a partial trailing line (the game can be mid-write) is held back as a remainder and completed on the next read rather than dropped as invalid JSON.
- `system-model.js` — tracks "the current system" across an incoming event stream. The one non-obvious rule: an `FSDJump`/`Location` to a *different* `SystemAddress` resets accumulated scans and counts as a real switch; re-arriving at the *same* system (leave and come back within a session) does not reset — bodies scanned earlier stay known. Also reports `updated` precisely (a real system switch or at least one new Scan/ScanBaryCentre), so the poller doesn't broadcast an identical snapshot on every idle tick full of Music/ReceiveText noise.
- `live-watcher.js` — composes the three into one `poll()` step, called on a 1s timer by `scripts/watch.js`. A newer journal file appearing (relog) switches the tailing target immediately; whether that counts as a system *change* is still entirely `system-model.js`'s call.

`watcher/test/watch-process.test.js` spawns the real `scripts/watch.js` process against a synthetic journal directory (not the real Saved Games folder) and drives it with a real `ws` client — the one true end-to-end test in the project so far. The watcher was also run for a few seconds directly against the real journal directory (read-only; no live-mode code path ever writes to a journal) as a final sanity check — it correctly found the newest of many real journal files and read the current system from a `Location` event.

One real gap surfaced during this milestone that live mode newly exposes: `buildBodyTree`'s `orphans` case (a body whose parent hasn't been scanned yet — plausible mid-session if a moon gets scanned before its planet ever does) was previously only exercised by a synthetic test; `build-demo-snapshot.js` asserts zero orphans for the committed static fixture, so milestone 2's renderer never had to handle one. Fixed: `scene-builder.js` now catches a failed position resolution per-body and skips just that body (logging a console warning) rather than the unresolvable chain taking down the whole scene — it reappears on its own once the missing parent gets scanned. Covered by a new test that constructs a node with a deliberately-dangling parentId.

### Label shortening (fixed alongside milestone 3, reported by Terje after trying milestone 2 in a real browser)

Every in-scene label and the detail panel header were showing the full system-qualified body name (e.g. "Col 285 Sector TI-U b18-2 A 12 e a"), which is exactly the "name problem" this doc calls the core design issue — and milestone 2's renderer wasn't actually applying any of the identity-layer thinking to it. Fixed narrowly: `ui/src/naming.js`'s `shortDesignator()` strips the system-name prefix (guaranteed correct by the game's own naming convention, not a heuristic — every ED body name is literally `${systemName} ${designator}`), so labels now read "A 12 e a". Full names remain available via the detail panel's Copy Name button. This is deliberately *not* the full milestone 5 identity layer (icons, pins, nicknames) — just removing redundant noise now that it was visibly a problem, without pulling that whole milestone forward.

### Milestone 4 — done (2026-08-09)

**Mode-detection wiring.** `watcher/src/recent-events.js` keeps a rolling window of *every* recent event (not just the Scan/context events `system-model.js` needs for the tree — Bounty, LaunchDrone, ScanOrganic, etc. never touch the body tree but are exactly what mode detection keys on), `live-watcher.js` feeds it on every poll and attaches the auto-detected mode to each snapshot, and a mode change alone (no tree change) now correctly triggers a broadcast. The UI shows the active mode in the System panel and has a manual pin (dropdown, persisted in localStorage) that overrides auto-detection — "auto wins unless pinned," per this doc's mode table — implemented as a purely client-side override so the watcher itself stays UI-preference-agnostic.

**Decision from Terje: skip numeric value estimates entirely, qualitative flags only.** Exploration's "est. mapping value" and exobiology's genera/Vista Genomics payout tables would have needed Frontier's current per-PlanetClass constants — the kind of thing the ED community tracks carefully and Frontier periodically rebalances, which I couldn't verify from training knowledge alone, with zero real data in Terje's journal history to sanity-check against either way. Asked directly; his call was to drop numeric estimates and keep only what's driven by real journal fields. This simplified everything downstream: exploration turned out to need **no new overlay work at all** — its "what lights up" (undiscovered/unmapped/high-value/terraformable) is already exactly the always-on spotlight treatment from milestone 2, minus the value number.

**Mining — built, real-data-verified.** `shared/src/mode-highlight.js`'s `classifyModeHighlight(node, 'mining')` flags ringed bodies, with a `good-reserve` reason for Pristine/Major reserves. Caught one real mistake before it shipped: I'd assumed the journal's reserve-level strings were the bare names players use ("Pristine", "Major") — checking against the real fixture showed they actually carry a `"Resources"` suffix (`"ReserveLevel":"PristineResources"`). Fixed before writing a single test against it. The renderer boosts a highlighted ring's opacity and gives Pristine/Major rings FDev's own amber "good" color ("Pristine glows," per the mode table); tested against the real fixture's own body 39, which genuinely has a Pristine ring.

**Piracy — built, real-data-verified.** `system-model.js` now captures `SystemSecurity_Localised`/`SystemGovernment_Localised`/`Population`/`Factions` off every `FSDJump`/`Location` (using the game's own already-localised strings rather than parsing the internal `$SYSTEM_SECURITY_low;`-style tags myself), refreshing on *every* arrival — not just system switches — since BGS faction states can legitimately shift while the player is away, which is itself a small correct behavior change from milestone 3 (a same-system relog now reports `changed: true`, where it used to report `false`; updated the test that encoded the old assumption rather than leaving it stale). Also added nav-beacon detection (`FSSSignalDiscovered` with `SignalType:"NavBeacon"`) and a running session bounty tally (sums `Bounty.TotalReward`, survives system switches, resets only when the watcher restarts). All four of the mode table's piracy signals (system security, combat-zone factions via `FactionState` War/CivilWar, nav beacon, bounty tally) are wired into the UI, gated behind piracy mode specifically so the panel doesn't clutter up in other modes.

**Exobiology — researched, then built.** Initially stopped short of this because `ScanOrganic` has zero examples anywhere in Terje's local journal history, and its body-reference field was the one thing in this whole project I couldn't verify against real data. Asked to research it online rather than guess or leave it undone. Found the exact schema from two independent sources (elite-journal.readthedocs.io, schemas.edomh.nl), both agreeing: `ScanOrganic` identifies its body with a field called **`Body`**, not `BodyID` like every other event in this codebase — confirmed exactly the risk flagged earlier. Also confirmed `ScanType` progresses `"Log"` → `"Sample"` → `"Analyse"` across exactly three scans per species, matching this doc's "sample progress 1/3-3/3" line precisely. `FSSBodySignals`/`SAASignalsFound` needed no research — already confirmed real from Terje's own journal (Geological/Human signals, not Biological, but identical event shape), plus the exact string `"$SAA_SignalType_Biological;"` came back from the same research pass.

New `watcher/src/bio-signals.js` parses all three events into per-body data — signal count, confirmed genus names (only ever from `SAASignalsFound`, never predicted ahead of the game reporting them), and per-species sample progress. `body-tree.js` attaches this as `node.bio` when present (silently skipped, not thrown, if the body's own Scan hasn't landed yet — same grace-period tolerance as orphans). `system-model.js` now accumulates these alongside Scan/ScanBaryCentre (renamed its internal `scanEvents` to `bodyEvents` to match what it actually holds now). `shared/mode-highlight.js` highlights bio-signal bodies in exobiology mode, distinguishing "sampling-in-progress" from "fully-sampled" (all found species at 3/3); the renderer gives fully-sampled bodies a brighter halo than in-progress ones. No genus prediction, no credit values anywhere — same qualitative-only decision as mining/piracy.

This is the one area of the codebase where the underlying event schema (not just the numbers, which milestone 2-3's "no fabrication" caveats already cover) is sourced from external documentation rather than a real example in Terje's own journal — worth a first-hand sanity check the first time bio signals actually show up in play, same spirit as the "visual verification caveat" for the UI overall.

### Milestone 5 — done (2026-08-09)

The identity layer, per this doc's "name problem" section:

**Icon language.** `ui/src/body-visuals.js`'s `bodyIcon(node)` prefixes a glyph onto every label and the data panel header: `✦` for stars, `○`/`◉` for non-landable/landable planets, `·`/`◈` for non-landable/landable moons — deliberately smaller/plainer-looking symbols for moons, matching the glanceability principle that less-important bodies should read as less important. No new data needed — `kind`/`isMoon`/`landable` were already on every node.

**Pins/nicknames.** `ui/src/nicknames.js` persists one localStorage entry per system (keyed by the stable numeric `SystemAddress`, so two procedurally-named systems that happen to look similar can't collide), mapping bodyId to nickname. A nickname overrides the designator everywhere — in-scene label, data panel header — the instant it's saved (blur or Enter on the new nickname input in the detail panel), without touching the underlying real name, which is still what Copy Name copies. Needed a `localStorage` polyfill in the test DOM shim, since plain Node doesn't have that global the way a browser does.

**NavRoute badge.** `watcher/src/nav-route.js` reads `NavRoute.json` — a separate snapshot file next to the journal, not part of the append-only log — to find the hop after the current system on a plotted multi-jump route. Worth noting explicitly: the journal's own bare `NavRoute` event carries zero route data (confirmed from Terje's real journal history: literally `{"event":"NavRoute"}`, nothing else); the route only ever lives in the file. Verified the populated-route schema (`StarSystem`/`SystemAddress`/`StarPos`/`StarClass`, top-level `"event":"Route"`) against two independent sources, since Terje's own `NavRoute.json` currently holds a cleared route — but that cleared-state shape (`"event":"NavRouteClear"`, empty `Route` array) *is* confirmed from his real file. Displayed as a plain "Next stop: `<system name>`" text badge rather than an actual 3D glow on a body, since galaxy mode (which would be needed to place another system's star in the scene at all) stayed out of scope for v1 per this doc's own prototype-reuse notes.

### Orbital math implementation note

The handover doc's 5-step algorithm is implemented literally: each body's `SemiMajorAxis`/`Eccentricity`/`OrbitalInclination`/`Periapsis`/`AscendingNode`/`MeanAnomaly` are relative to its immediate parent, and absolute position is the sum of every ancestor's own Kepler-solved offset walking up to the system root (`orbit-position.js`). This matches the convention EDSM/EDDiscovery-style tools use — inclination/node are already in a common system reference frame, so no per-level frame rotation is needed, just additive offsets.
