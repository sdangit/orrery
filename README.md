# Elite Dangerous Live System Orrery

A personalized, real-time 3D orrery of the star system you're currently in, built from your own Elite Dangerous journal data, meant to live on a second monitor while you play. See [HANDOVER-ed-orrery.md](HANDOVER-ed-orrery.md) for the full design doc.

**Privacy:** everything runs locally. Journal files never leave your machine. The only optional network call is an opt-in EDSM lookup to backfill bodies you haven't personally scanned yet — off by default.

## Status

- [x] **Milestone 1** — journal parsing core: NDJSON parser, body-tree builder (Parents chain resolution, including the Ring pseudo-body quirk and barycentre-without-Parents recovery), Kepler solver, and the pure activity-mode-detection function. All unit-tested against a real (scrubbed) journal fixture. See [watcher/](watcher/).
- [ ] Milestone 2 — static orrery render at t=now, selection + data panel, first-discovery treatment.
- [ ] Milestone 3 — live mode: watcher process + WebSocket + auto system-switch, FPS cap.
- [ ] Milestone 4 — activity mode overlays (exploration, exobiology, mining, piracy).
- [ ] Milestone 5 — identity layer: icons, pins/nicknames, NavRoute badge.
- [ ] Milestone 6 — EDSM backfill toggle.
- [ ] Milestone 7 — polish: warp slider, true-scale toggle, session tracker, audio cues.

## Layout

- `watcher/` — Node process: parses journal files into a system body tree. Currently a pure parsing library (no file-watching or WebSocket yet — that's milestone 3).
- `ed-space-tutor.html` — the original prototype. Reference for visual language and the manual orbit camera; not wired to real data.

## Running the tests

```
cd watcher
npm test
```

Uses Node's built-in test runner (`node:test`) — no dependencies to install. Tests run against `watcher/test/fixtures/sample-journal.log`, a real journal excerpt (scrubbed of any commander-identifying fields) covering a binary star system with belt clusters, moons, moon-of-moon chains, and barycentre-hosted moon pairs.
