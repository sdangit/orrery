# ORRERY

> **About this fork:** This fork of [TerjeRu/orrery](https://github.com/TerjeRu/orrery) adapts ORRERY for macOS, with Elite Dangerous running through CrossOver. `macos` is the default integration branch; `main` mirrors upstream, and upstream updates are regularly merged into `macos`. Development happens on sub-branches with PRs targeting `macos`.
>
> **Agentic workflow disclosure:** Changes made in this fork use a purely agentic workflow: AI coding agents implement, test, document, and manage changes under human direction. This disclosure applies to this fork's changes, not the upstream project's development process.

**[⬇ Download for Windows](https://github.com/TerjeRu/orrery/releases/latest)** — installer or portable, no Node or terminal required.

<img width="1280" height="720" alt="orrery2" src="https://github.com/user-attachments/assets/e72d844e-cc12-4119-a7ea-316d601affa9" />

<br>
<br>

You jump into a system, honk, and get handed forty names that look like `Col 285 Sector TI-U b18-2 A 12 e a`. Somewhere in that list is the one moon worth landing on. ORRERY reads your journal and draws the system instead: real orbits, real positions, updating as you fly. It's built to sit on a second monitor and be glanced at rather than read.
<br>
<br>

<img width="1913" height="913" alt="image" src="https://github.com/user-attachments/assets/589eb7f7-c2bf-408e-983d-d40a263f0dd8" />
<img width="950" height="851" alt="image" src="https://github.com/user-attachments/assets/4bd1a514-e51e-4174-93b3-bf15bbb96a32" />
<img width="304" height="358" alt="image" src="https://github.com/user-attachments/assets/9f8e10c3-77db-4240-9a8d-1f840bba5e02" />

<br>
<br>

## What it does

A small watcher process tails your journal folder and pushes what it finds to a browser page. Jump somewhere new and the map follows you there; scan a body and it appears in place. If the game isn't running you still get a demo system to poke at, so the page is never empty.

It also pays attention to what you've been doing lately. A few `ScanOrganic` events in the last ten minutes and it switches to exobiology, where bodies with biological signals light up and each species shows how far along its three samples you are. Launch a prospector limpet and it flips to mining, where ringed bodies come forward and pristine reserves glow. Collect a bounty and it moves to combat: system security, which factions are at war, whether there's a nav beacon, what you've earned this session. Exploration is the default, and in every mode, regardless of what else is highlighted, undiscovered bodies, unmapped bodies, Earth-likes, water and ammonia worlds and terraformables keep their glow. Those are never filtered away. If the guessing annoys you, pin a mode by hand.

The naming problem is the part this was really built for. Procedural names are impossible to hold in your head, so the map leans on position, colour and icon, keeps the text short (the system prefix is stripped, since you already know which system you're in), and lets you rename anything you like. Call something "money moon" and it stays "money moon" in that system forever.

There's reference-orbit playback to watch even very slow systems move at a useful speed, orbit ellipses so the structure reads even when the bodies themselves are small, and two scale modes: a compressed one where everything is visible at once, and a true-distance one that shows you how much emptiness is really out there. EDSM and Spansh can optionally fill in bodies you haven't scanned yourself, drawn as dim wireframes so you can tell at a glance what's yours and what's borrowed.

Smaller things: four colour schemes, a legend you can hide, quiet audio pings for first discoveries and bio signals (silent unless you ask for them). It renders on demand and caps at 30fps, so it isn't quietly stealing frames from the game.

## How accurate is it?

The orbits are real. Every `Scan` event carries a full Keplerian element set and ORRERY uses all of it, solved properly and propagated from the timestamp on the scan itself, so warping forward a year puts things where they would actually be instead of accumulating drift. Binaries and co-orbiting moon pairs orbit their real barycentres.

Scale is the part that isn't honest, and the panel says so while it's happening. A real system spans about seven orders of magnitude between a tight moon orbit and a wide binary separation, so the default view compresses distances logarithmically, per orbit rather than globally, which keeps a moon visible beside its planet however far that planet sits from its star. Ordering always survives: further away is always drawn further away. Switch on true distances for an honest linear scale. Body sizes are exaggerated in both modes.

Community bodies are drawn as wireframes to distinguish them from personal scans. Their position quality is shown separately: a complete Spansh orbit can be propagated from its mean-anomaly timestamp, while EDSM-only orbits use an illustrative phase and remain approximate. An approximate ancestor also makes a child's absolute position approximate. Bodies with unresolved parent links are not placed at the origin; they are omitted with a diagnostic count.

[TECHNICAL.md](TECHNICAL.md) has the math, the journal format quirks and the detail behind all of this.

## Privacy

The watcher listens on 127.0.0.1 and nowhere else. EDSM and Spansh lookups are independently opt-in, off by default, and labelled "(network)". Enabling EDSM sends the system name to EDSM; enabling Spansh sends the system address (ID64) to Spansh. The watcher makes these requests, caches results in memory, and returns body data to the local UI. Journal contents and commander details are not sent. An existing EDSM preference does not automatically enable Spansh.

## Running it

You need a PC copy of the game — journals don't exist on console, and the exobiology features need Odyssey.

The easiest way in is the [latest release](https://github.com/TerjeRu/orrery/releases/latest): grab the installer or the portable exe, run it, and you're looking at your current system. Nothing else to install, Node is bundled inside. It's an unsigned build, so Windows SmartScreen will complain the first time — "More info," then "Run anyway."

If you'd rather run it from source, you need Node 20 or newer. Double-click `Start Orrery.cmd` and the first run installs dependencies, starts the server, and opens the page for you. From a terminal it's:

```sh
npm install
npm start
```

Leave it running while you play. Drag to orbit, scroll to zoom, click a body for its details.

Camera controls: left-drag to orbit; right-drag or Shift-drag to pan; scroll or
pinch to zoom. Arrow keys pan while the map has focus. On a touchscreen, use
one finger to orbit and two fingers to pan/zoom. Dragging does not select a body.

**Center main star** and the detail panel's **Center selected body** move the
orbit pivot while preserving angle and zoom. The centered body stays under the
pivot as simulated time advances; panning releases it. **Fit system** frames the
known bodies at the current angle, while **Reset view** also restores the default
orientation. The **Orbiting** indicator names the current target. Main-star
centering is disabled until the available data identifies the arrival star. The
selected body's orbit line is slightly brighter; selecting another body or
closing details restores the previous line.

**Time controls:** select a body, then choose **Use as time reference** in its
detail panel. At **1× playback speed**, that body's orbital period takes 30 real
seconds; **×2** and **÷2** adjust the speed without a fixed slider ceiling. The
readout shows the resulting seconds per reference orbit. Every body still uses
one shared simulation clock, so their relative orbital periods are preserved;
fast moons may jump between frames when viewing a slow outer orbit. Selecting
or centering another body does not change the reference. Its period is captured
when chosen, so incoming scans do not unexpectedly change playback speed.

**Pause / Resume** and **Reverse / Play forward** control playback. **Return to
live time** clears the reference and restores the current time, forward at real
speed. Entering another system also returns to live time. A reference remains
usable if its source data is temporarily hidden (for example, disabling a community provider).
Bodies without a known nonzero orbital period cannot be used as references.
Retrograde orbits retain their signed period for positioning; playback uses its
absolute duration.

The **ED date / time** clock follows the displayed simulation, using UTC with
1,286 added to the displayed year (2026 → 3312), following the
[ED year offset](https://git.aror.org/florian/edjournal/src/commit/078c4ae7e7a243dda86fd8dc5792fad66647b713/EliteDangerous.cs).
This is a display conversion;
journal epochs and orbit calculations keep their original timestamps. Month,
day and UTC time are preserved, including leap days. The Live / Forward /
Reverse / Paused indicator distinguishes live game time from simulated time.

On macOS, the watcher and Electron app default to journals in the CrossOver
bottle named `Elite Dangerous`:

```text
~/Library/Application Support/CrossOver/Bottles/Elite Dangerous/drive_c/users/crossover/Saved Games/Frontier Developments/Elite Dangerous
```

For a different bottle or journal location, set `ORRERY_JOURNAL_DIR` to its path:

```sh
ORRERY_JOURNAL_DIR="$HOME/path/to/journals" npm start
```

To build your own installer instead of using the release, `npm run electron:build` does the same packaging locally (NSIS installer and a portable exe, both land in `dist-installer/`).

To hack on it, `npm run dev --workspace=ui` gives you Vite with hot reload on port 5173, and `npm run watch --workspace=watcher` runs the journal watcher separately alongside it. `npm run electron:dev` runs the Electron shell against the built UI. `npm test` runs the test suite.

## Data sources

This project uses journal data generated by Elite Dangerous, supplemented by
[EDSM](https://www.edsm.net/) and [Spansh](https://spansh.co.uk/) when enabled.
Consider supporting these community-run services.

The two providers are combined by system address and journal body ID. Journal
fields win; missing descriptive fields prefer Spansh, then EDSM. Orbital elements
are chosen as a complete group: journal first, then Spansh, with an approximate
provider orbit as the last resort. Conflicting parent chains are diagnosed;
community conflicts cannot overwrite a journal parent link. Barycentre parent
links can be recovered from the ancestor chains of their children.

Spansh's `timestamps.meanAnomaly` supplies the orbital epoch. **`updateTime` is
record freshness, not an orbital epoch**, and appears separately in the detail
panel. EDSM-only phase is anchored to the cached response's receipt time, so
rebuilding the scene does not reset it. Missing/invalid phase timestamps never
produce a claim of a fully propagated position.

Requests use EDSM's `/api-system-v1/bodies?systemName=…` and Spansh's
`/api/dump/{id64}`. Each provider has an 8-second timeout and fails independently.
Successful responses are cached for 30 minutes, failures/empty responses for one
minute, with a maximum of 64 cache entries. Requests for the same provider/system
are coalesced. The UI requires the local watcher for community lookups; Vite dev
and preview proxy that route to the watcher on port 47821. Spansh needs a known
system address. Changing systems or disabling a provider discards stale UI
responses. Provider statuses appear beside the checkboxes.

Mapping fixtures capture Sol's body data from both APIs. They pin the actual
response units (semi-major axis in AU, arrival distance in light-seconds,
Spansh ring radii in metres versus EDSM ring radii in kilometres), which differ
from some labels in the [Spansh OpenAPI docs](https://docs.spansh.co.uk/).
Unsafe JSON integer IDs are retained as decimal strings before they can be
rounded by JavaScript.


## License

MIT.
