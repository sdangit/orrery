# ORRERY

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

There's a time warp slider running up to 100,000× if you want to watch the system actually move, orbit ellipses so the structure reads even when the bodies themselves are small, and two scale modes: a compressed one where everything is visible at once, and a true-distance one that shows you how much emptiness is really out there. EDSM can optionally fill in bodies you haven't scanned yourself, drawn as dim wireframes so you can tell at a glance what's yours and what's borrowed.

Smaller things: four colour schemes, a legend you can hide, quiet audio pings for first discoveries and bio signals (silent unless you ask for them). It renders on demand and caps at 30fps, so it isn't quietly stealing frames from the game.

## How accurate is it?

The orbits are real. Every `Scan` event carries a full Keplerian element set and ORRERY uses all of it, solved properly and propagated from the timestamp on the scan itself, so warping forward a year puts things where they would actually be instead of accumulating drift. Binaries and co-orbiting moon pairs orbit their real barycentres.

Scale is the part that isn't honest, and the panel says so while it's happening. A real system spans about seven orders of magnitude between a tight moon orbit and a wide binary separation, so the default view compresses distances logarithmically, per orbit rather than globally, which keeps a moon visible beside its planet however far that planet sits from its star. Ordering always survives: further away is always drawn further away. Switch on true distances for an honest linear scale. Body sizes are exaggerated in both modes.

Bodies filled in from EDSM are marked as approximate. The shape and size of the orbit are right, but EDSM doesn't record where along that orbit a body currently is, so it gets parked at periapsis and drawn as a wireframe.

[TECHNICAL.md](TECHNICAL.md) has the math, the journal format quirks and the detail behind all of this.

## Privacy

Everything stays on your machine. The watcher listens on 127.0.0.1 and nowhere else. The only network call in the entire application is the EDSM lookup, it's off by default, and the checkbox says "(network)" so you always know when it's on.

## Running it

You need Node 20 or newer and a PC copy of the game. Journals don't exist on console, and the exobiology features need Odyssey.

Double-click `Start Orrery.cmd`. The first run installs dependencies, then it starts the server and opens the page for you. From a terminal it's:

```sh
npm install
npm start
```

Leave it running while you play. Drag to orbit, scroll to zoom, click a body for its details.

If you'd rather have a real installer than a terminal window, `npm run electron:build` packages ORRERY as a Windows app (NSIS installer and a portable exe, both in `dist-installer/` when it's done) — same watcher and same UI, just running inside its own window instead of a browser tab.

To hack on it, `npm run dev --workspace=ui` gives you Vite with hot reload on port 5173, and `npm run watch --workspace=watcher` runs the journal watcher separately alongside it. `npm run electron:dev` runs the Electron shell against the built UI. `npm test` runs the test suite.

## License

MIT.
