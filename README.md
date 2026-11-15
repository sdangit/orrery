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

There's reference-orbit playback to watch even very slow systems move at a useful speed, orbit ellipses so the structure reads even when the bodies themselves are small, and three scale modes: Compact, True distances, and Fully to scale. EDSM and Spansh can optionally fill in bodies you haven't scanned yourself, drawn as dim wireframes so you can tell at a glance what's yours and what's borrowed.

Smaller things: four colour schemes, a legend you can hide, quiet audio pings for first discoveries and bio signals (silent unless you ask for them). It renders on demand and caps at 30fps, so it isn't quietly stealing frames from the game.

## How accurate is it?

The orbits are real. Every `Scan` event carries a full Keplerian element set and ORRERY uses all of it, solved properly and propagated from the timestamp on the scan itself, so warping forward a year puts things where they would actually be instead of accumulating drift. Binaries and co-orbiting moon pairs orbit their real barycentres.

Scale is the part that isn't honest, and the panel says so while it's happening. A real system spans about seven orders of magnitude between a tight moon orbit and a wide binary separation, so the default view compresses distances logarithmically, per orbit rather than globally, which keeps a moon visible beside its planet however far that planet sits from its star. Ordering always survives: further away is always drawn further away. The **Scale mode** selector offers:

- **Compact:** compressed distances and exaggerated body sizes (the default).
- **True distances:** proportional distances with exaggerated body sizes.
- **Fully to scale:** distances, body radii, and ring radii all use the same linear scale.

In Fully to scale, a small open diamond marks bodies that are too small to see;
markers, labels, and click targets are screen aids, not physical sizes. The actual
sphere stays at its physical radius. Bodies with an unknown radius get only a
location marker. Select a body and choose **Zoom to body** to inspect it and its
rings; **Center selection** retains the current viewing distance. Zoom to body
requires a known radius in Fully to scale. Body effects and community wireframes
remain enabled. Fit system still frames bodies at their current positions, not
entire orbital paths. The selected scale mode persists across launches, and the
old True scale setting migrates to True distances.

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

The top toolbar keeps scale modes and camera actions within reach. **System**
and **Body details** toggle the side panels without clearing your selection.
The System panel holds search, system context, community-data status/refresh,
and live session statistics. Body details groups physical properties,
exploration, provenance, and nicknames into expandable sections.

**Settings** opens appearance, data-provider, activity-mode, and audio preferences
in place of body details; closing it restores the previous panel state. **Legend**
opens a temporary reference panel. Escape dismisses either overlay. Narrow
windows show one side panel at a time, and short windows keep their contents
scrollable. Incoming journal updates preserve your panel choices.

**Settings → Appearance → Orbit brightness** adjusts all orbit lines from off
to 400%, with 100% matching the default appearance. Above 100%, both color
brightness and opacity increase. Changes preview immediately
and persist across reloads. The selected orbit keeps its automatic extra emphasis and draws above other orbit lines;
off hides all orbit lines, including the selected one.

The bottom playback bar keeps the ED clock and transport controls visible.
**More** expands the time reference and speed explanation; choosing a body as
the time reference opens that explanation automatically.

Camera controls: left-drag to orbit; right-drag or Shift-drag to pan; scroll or
pinch to zoom. Arrow keys pan while the map has focus. On a touchscreen, use
one finger to orbit and two fingers to pan/zoom. Dragging does not select a body.

**Center main star** and the detail panel's **Center selection** move the
orbit pivot while preserving angle and zoom. The centered body stays under the
pivot as simulated time advances; panning releases it. **Fit system** frames the
known bodies at the current angle, while **Reset view** also restores the default
orientation. The **Orbiting** indicator names the current target. Main-star
centering is disabled until the available data identifies the arrival star. The
selected body's orbit line is slightly brighter; selecting another body restores
the previous line. Collapsing details keeps the selection and its highlight.

**View** offers **Top**, **Front**, **Side**, and **Angled** orientations. The
**System reference plane** is the renderer's XY plane. **Selected orbit** aligns
to the selected body's displayed orbital plane; it is unavailable without orbital
orientation data, and approximate community orientations are identified. Front
and Side are edge-on views 90° apart; Top is perpendicular to the plane.
Presets preserve the camera center, following, and zoom. They apply only when
clicked: changing the selection or reference choice does not rotate the camera.
Dragging afterward switches to a custom orientation. Reset view restores the
system's default angled view and framing.

**View → System plane grid** shows a square grid aligned to the system axes.
Use **System reference plane → Top** for square cells. Finer divisions fade in
as you zoom, with larger divisions every ten cells. **Grid origin → Follow view
centre** keeps it visible around distant orbital groups; **System centre** pins
it to the system's zero-height plane, which may leave the viewport in a close-up.
The origin choice and visibility are remembered. True-distance modes show physical
cell spacing; Compact uses display units. This is a local alignment aid, not a
calibrated galactic plane.

**Browse bodies** opens the system hierarchy. In the detail panel, **← / →**
cycle through siblings, ordered by orbital size (unknown sizes last), and wrap
at either end. **↑ Up** selects the parent; breadcrumb buttons jump to ancestors.
The expandable, scrollable **Children** list enters a body or orbital group. Navigation
centers the selection while preserving the current viewing distance and angle,
including when returning to the System breadcrumb. Use **Zoom to body** or
**Fit system** to change framing. Barycentres appear as **Orbital group**,
including groups whose positions are unavailable. Keyboard arrows still pan.

**Find system (EDSM)** accepts a system name and opens its community-data orrery.
Submitting a name explicitly queries EDSM, even when automatic EDSM backfill is
off; if Spansh backfill is enabled, the resolved system address is also queried
there. The source indicator reads **BROWSING**. Journal updates continue in the
background; **Return to live system** displays the latest journal snapshot (or
the demo if none has arrived). Failed searches leave the current view intact.
Name lookup requires a working local watcher and an EDSM result with an ID64.

**Time controls:** select a body, then choose **Use as time reference** in its
detail panel. At **1× playback speed**, that body's orbital period takes 30 real
seconds; **×2** and **÷2** adjust the speed without a fixed slider ceiling. The
readout shows the resulting seconds per reference orbit. Every body still uses
one shared simulation clock, so their relative orbital periods are preserved;
fast moons may jump between frames when viewing a slow outer orbit. Selecting
or centering another body does not change the reference. Its period is captured
when chosen, so incoming scans do not unexpectedly change playback speed.

**Pause / Resume** and **Reverse / Play forward** control playback. **Live time**
clears the reference and restores the current time, forward at real
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

Orrery keeps journal body data for the 128 most recently visited systems in
memory, keyed by system address. Returning to a system restores those scans
immediately; new journal scans replace older ones and remain authoritative over
community data. The cache survives journal rotation, game restarts, and browser
reloads while the watcher stays running. Restarting Orrery's watcher or changing
commander clears it. Nothing is written to disk, and older journal files are not
searched. The newest file is read at startup, so earlier visits within that file
also populate the cache. Each system retains up to 10,000 body events, compacting
repeated scans/signals and deduplicating identical organic samples; oldest entries
are evicted at the limit. Restoring cached data does not recount session statistics.

This project uses journal data generated by Elite Dangerous, supplemented by
[EDSM](https://www.edsm.net/), [Spansh](https://spansh.co.uk/), and
[EDGIS](https://edgis.elitedangereuse.fr/) when enabled in Settings → Data.
Consider supporting these community-run services.

The providers are combined by system address and journal body ID. Journal
fields win; missing descriptive fields prefer Spansh, then EDGIS, then EDSM. Orbital elements
are chosen as a complete group: journal first, then Spansh, with an approximate
provider orbit as the last resort. Conflicting parent chains are diagnosed;
community conflicts cannot overwrite a journal parent link. Barycentre parent
links can be recovered from the ancestor chains of their children.
Referenced but absent barycentres remain navigable placeholders. Only the system
root is treated as the origin; other missing groups still require orbital data
before their descendants can be positioned.

Spansh's `timestamps.meanAnomaly` supplies the orbital epoch. **`updateTime` is
record freshness, not an orbital epoch**, and appears separately in the detail
panel. EDSM-only phase is anchored to the cached response's receipt time, so
rebuilding the scene does not reset it. Missing/invalid phase timestamps never
produce a claim of a fully propagated position.

EDGIS supplies journal-style metres and seconds, including bodies missing from
the other providers. Its `updatetime` is also record freshness, not a verified
phase epoch. EDGIS orbits therefore remain marked approximate. For an unambiguous
pair of stars sharing a barycentre, matching periods, eccentricities and planes,
and opposite periapsides, an EDGIS companion can use the other star's known phase
as an estimate. The detail panel identifies this inference. Other EDGIS phases
are illustrative and anchored to the cached response's receipt time.

Requests use EDSM's `/api-system-v1/bodies?systemName=…` and Spansh's
`/api/dump/{id64}`, plus EDGIS's `/system-map?name_or_id={id64}`. The EDGIS
response includes system identity for validation; station data is discarded.
Each provider has an 8-second timeout and fails independently.
Responses are cached for one minute, with a maximum of 64 cache entries. This is
local request deduplication, not a provider-imposed rate limit or a periodic
refresh schedule. **Refresh community data** bypasses this cache for enabled
providers; it preserves journal data and keeps previously loaded community bodies
visible if a request fails. Concurrent requests for the same provider/system are
coalesced. An explicit HTTP 429 pauses requests to that provider for its
`Retry-After` duration (one minute if absent), including manual refreshes.
The UI requires the local watcher for community lookups; Vite dev
and preview proxy that route to the watcher on port 47821. Spansh and EDGIS need a known
system address. Changing systems or disabling a provider discards stale UI
responses. Provider statuses appear beside the checkboxes.

Mapping fixtures capture Sol's body data from both APIs. They pin the actual
response units (semi-major axis in AU, arrival distance in light-seconds,
Spansh ring radii in metres versus EDSM ring radii in kilometres), which differ
from some labels in the [Spansh OpenAPI docs](https://docs.spansh.co.uk/).
Unsafe JSON integer IDs are retained as decimal strings before they can be
rounded by JavaScript.

Captured EDSM and Spansh fixtures also cover Bleia Dryiae XJ-R e4-1 (173 bodies)
and HIP 97950 (40 bodies). Spansh supplies 11 and 4 additional barycentres,
respectively. Regression checks cover complete hierarchy traversal, missing
groups with EDSM alone, and finite animated positions in every scale mode.
LFT 509 fixtures from all three providers verify that EDGIS restores Ross 54 and
its planetary group, with all 29 physical bodies renderable and the estimated
binary motion kept consistent.


## License

MIT.
