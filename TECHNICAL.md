# ORRERY — Technical Documentation

Implementation details, data-accuracy notes, and the journal-format quirks this project had to handle. Read the [README](README.md) first for what the tool does.

## Architecture

npm-workspaces monorepo, three packages, local-only data flow:

```text
ED journal files ──> watcher (Node)  ──ws://127.0.0.1:47821──> ui (browser, Three.js)
%USERPROFILE%\Saved Games\...          │                          │
NavRoute.json ────────────────────────>│                          ├──(opt-in only)──> EDSM API
                                       └── also serves ui/dist on the same port
```

- **`shared/`** — pure math and classification, no I/O. Used by both other packages. Kepler solver, orbital-position resolution, display-scale compression, spotlight/mode-highlight classifiers, EDSM field mapping and merge logic.
- **`watcher/`** — Node process. Tails the newest journal file, maintains a model of the current system, broadcasts JSON snapshots over a WebSocket bound to `127.0.0.1`. Also serves the built UI statically on the same port (with a strict path-containment check), so one process serves everything.
- **`ui/`** — Vite + Three.js (plain JS). Renders the orrery. Boots on a bundled demo-system snapshot so it works with no watcher and no game running, then upgrades itself to LIVE if a watcher is reachable.

Everything that could be made a pure function was, and is unit-tested (`npm test`, ~250 tests on Node's built-in runner, zero test-framework dependencies). The impure remainder — timers, sockets, the render loop — is thin wiring.

## Journal parsing

The journal is newline-delimited JSON, written incrementally while the game runs. The parser tolerates a partial trailing line (held back and completed on the next read), and the tailer reads by byte offset so each poll only processes new data. A journal file that shrinks (relog onto a new session file) triggers a clean restart of the tail; whether that constitutes a *system* change is decided separately by SystemAddress comparison, so a relog into the same system keeps all accumulated scan data.

### The body tree

Each `Scan` event carries a `Parents` array describing the body's ancestor chain, e.g. `[{"Ring":3},{"Star":1},{"Null":0}]`. Resolving these into a tree required handling four quirks, all confirmed against real journals:

1. **Ring pseudo-bodies.** A belt cluster's chain names a synthetic "Ring" id that never receives its own `Scan` event. Ring entries are collapsed out of every chain, so belt clusters resolve to the star/planet that owns the belt. Belt clusters render as their parent's ring band, not as points — the journal gives no per-cluster angular position, and inventing one would be fabrication.
2. **Barycentres have no `Parents` of their own.** `ScanBaryCentre` gives orbital elements for a barycentre BodyID but nothing about what it orbits. Its parent is recovered from *other* bodies' chains (a moon's chain `[{"Null":63},{"Planet":62},…]` proves barycentre 63 orbits planet 62). Parent links are unioned across every body's chain.
3. **BodyID 0 can be a real star.** In a single-star system, the primary star itself is `BodyID:0` with no `Parents` field at all (confirmed: LFT 682 and others). BodyID 0 is only synthesized as a placeholder root when no real scan claims it — and this is the *common* case, not an edge case; most systems are single-star.
4. **Orphans are a normal transient state.** In live play a moon can be scanned before its planet. The renderer skips (not crashes on) any body whose ancestor chain can't yet resolve; it appears automatically once the missing parent is scanned.

Duplicate scans of the same body (an `AutoScan` followed by a `NavBeaconDetail` scan is common) resolve latest-wins by timestamp.

## Orbital mechanics and accuracy

Each `Scan`/`ScanBaryCentre` provides a full Keplerian element set **relative to the body's immediate parent**: `SemiMajorAxis` (m), `Eccentricity`, `OrbitalInclination`, `Periapsis` (argument of periapsis), `AscendingNode`, `MeanAnomaly` (all degrees), `OrbitalPeriod` (s). The scan event's own timestamp serves as the epoch for `MeanAnomaly` — there is no separate epoch field.

Position at time *t*:

1. Propagate the mean anomaly: `M = M₀ + 2π(t − t₀)/P`
2. Solve Kepler's equation `E − e·sin E = M` by Newton–Raphson (5 iterations, first-order seed `E₀ = M + e·sin M`; residual < 1e-8 across tested eccentricities)
3. True anomaly and radius from `E`; rotate by argument of periapsis, inclination, and ascending node (standard combined perifocal rotation)
4. Sum each ancestor's own offset walking up the parent chain to the system root

Inclination and node are already expressed in a common system-wide reference frame (the same convention EDSM/EDDiscovery-family tools use), so the per-level offsets are directly additive — no per-level frame rotation.

**Accuracy statement:** body positions are exactly as accurate as Frontier's own published elements under the two-body assumption — each body orbits its parent independently, no N-body perturbation (the game itself works the same way). Propagation is closed-form from the scan epoch, so there is no accumulating integration drift; the warp slider is just evaluating the same equations at a different *t*.

### Display scaling — where the picture deliberately deviates

Real systems span ~10⁶ m (tight moon orbits) to ~10¹³ m (wide binary separations) — seven orders of magnitude. Two display modes, always labeled on screen:

- **Compressed (default):** each body's offset from its *immediate parent* is log-compressed (`d′ = min + gain·log₁₀(1 + d/scale)`) before summation. Per-level compression is what keeps a moon's orbit visible around a planet that is itself far from its star; order is preserved (farther is always drawn farther). Body radii are also log-compressed, with separate tuning for stars vs. planets.
- **True distances:** positions at an honest linear 1 unit = 10⁹ m; body sizes and ring bands keep the compressed display sizing (the standard planetarium convention — fully honest radii render as invisible sub-pixel dots). Badge reads "true distances — body sizes exaggerated."

Orbit-path ellipses are drawn in both modes by sampling one full period through the same per-level transform as body positions, so the path always passes through its body.

## Activity modes

A pure recency-weighted scorer over the last 10 minutes of events (weight decays linearly with age) picks between exploration / exobiology / mining / piracy; a manual pin always wins. Trigger events per the journal: `FSSDiscoveryScan`/`Scan`, `ScanOrganic`/`FSSBodySignals`, `LaunchDrone`/`MiningRefined`, `Bounty`/`ShipTargeted`/`UnderAttack`.

Per-mode overlays use **only fields the journal reports directly** — a deliberate decision. No credit-value estimates, no genus predictions: those need Frontier's current balance tables, which are unverifiable from outside and periodically rebalanced, and a confidently wrong number is worse than none.

- **Exploration** needs no mode overlay: undiscovered (`WasDiscovered:false`), unmapped, Earth-like/water/ammonia worlds and terraformables get an always-on spotlight in *every* mode.
- **Mining** highlights ringed bodies; `ReserveLevel` drives the emphasis. Real enum values carry a `Resources` suffix (`"PristineResources"`, not `"Pristine"`) — verified against real journal data before shipping.
- **Piracy** shows system security, faction War/CivilWar states (combat zones), nav-beacon detection (`FSSSignalDiscovered` with `SignalType:"NavBeacon"`), and a session bounty tally. Security/faction data refreshes on *every* arrival, not just system switches — BGS state legitimately changes while you're away.
- **Exobiology** tracks `FSSBodySignals`/`SAASignalsFound` biological counts, confirmed genus names (only after the game itself reports them), and per-species sample progress (`ScanOrganic` `Log → Sample → Analyse`, 3 scans per species). One schema gotcha, verified against journal-schema references: `ScanOrganic` identifies its body with a field named `Body` — every other event in this codebase uses `BodyID`.

## EDSM backfill (opt-in)

`https://www.edsm.net/api-system-v1/bodies?systemName=…` — the only network call in the entire application, off by default. Merge rules:

- EDSM's `bodyId` space matches the journal's `BodyID` space directly (verified against real systems), enabling merge-by-id. Real scan data is never overwritten.
- EDSM's `subType` strings are *not* the journal's `PlanetClass` strings ("Earth-like world" vs `"Earthlike body"`, "Class I gas giant" vs `"Sudarsky class I gas giant"`, …). An explicit verified mapping table translates them; unmapped values fall through to neutral rendering rather than guessing.
- **EDSM provides no `MeanAnomaly` or `AscendingNode`** — a backfilled body's orbit *size and shape* are right, but its position along that orbit is unknowable. It's placed at periapsis by convention, rendered as a dim wireframe, and its detail panel says "position approximate." Backfilled bodies are `WasDiscovered:true` (known to the community) and never claim `WasMapped:false` — so backfill can never fake a first-discovery or first-mapping spotlight. A genuinely high-value backfilled world still gets the spotlight; that's the point.

## Rendering and GPU discipline

The tool is designed to share a GPU with the game:

- **Render-on-demand**: a frame renders only when something changed (camera input, selection, a new snapshot, active time warp) — an idle static view draws nothing.
- **30 FPS cap** even when animating.
- Warp animates by *moving* existing objects (`updateSystemScene`, ~70 closed-form Kepler solves per frame) — no per-frame scene rebuild. Full rebuilds happen only on data/mode/scale/scheme changes, with explicit disposal of geometries/materials/textures to avoid GPU memory leaks.
- Labels are canvas-texture sprites (no font assets); audio cues are Web Audio oscillators (no audio assets).

## Security posture

- The watcher binds `127.0.0.1` only; nothing is reachable from the network.
- The static file server resolves every request against the dist directory and rejects anything that escapes it (path-traversal-tested).
- The UI never interprets data as HTML: all dynamic text renders through `textContent` or canvas textures; `innerHTML` is not used. A CSP meta header blocks inline/external scripts and restricts connections to same-origin, local websockets, and the opt-in EDSM host.
- Journal data, EDSM responses, and WebSocket messages are all parsed inside try/catch with malformed input dropped, never thrown into the UI.
- Nicknames/pins/settings persist in `localStorage` only. Nothing leaves the machine.

## Known limitations

- **No live ship position.** The journal/Status.json simply don't expose free-space supercruise coordinates — only planetary lat/long when near a surface. Any tool showing a live ship dot in supercruise is approximating from proximity events; this one doesn't pretend.
- **Journals only contain what you (or your FSS honk) scanned.** Unscanned bodies don't exist to the tool unless EDSM backfill is enabled.
- **`ScanOrganic` handling is schema-verified but not yet play-verified** — its event shape came from community journal-schema documentation rather than a captured real event. Worth a glance the first time bio scanning happens in-game.
- Sub-frame timing aside, the demo snapshot's orbital epochs date from its capture (Nov 2025) — positions shown for the demo system are correctly propagated from then, which is exactly what a real system's data looks like after you've been away a while.
