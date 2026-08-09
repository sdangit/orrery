import * as THREE from 'three';
import demoSystem from './data/demo-system.json';
import { createOrbitCamera } from './camera.js';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from './scene-builder.js';
import { renderDetailPanel } from './data-panel.js';
import { connectLive } from './live-connection.js';
import { getNickname, getNicknames, setNickname } from './nicknames.js';
import { buildBackfillNodes } from '@orrery/shared';
import { fetchEdsmBodies } from './edsm-client.js';
import { createTimeControl, advance, resetToNow, warpFromSlider, formatWarp } from './time-control.js';
import { applyColorScheme, DEFAULT_SCHEME } from './color-schemes.js';
import { createAudioCues } from './audio-cues.js';

// ---------- renderer & scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060402);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60000);

// starfield backdrop, ported from ed-space-tutor.html — pushed far enough out
// that even true-distance mode's widest zoom stays inside the star sphere
(function addStarfield() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 25000 + Math.random() * 15000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x554433, size: 2.5, sizeAttenuation: false })));
})();

// ---------- HUD color scheme (milestone 7) ----------
// Applied before the first scene build so the 3D labels pick up the accent.
let labelAccent = '#ff8a2a';
const schemeSelect = document.getElementById('schemeSelect');
{
  const saved = localStorage.getItem('orrery.colorScheme') ?? DEFAULT_SCHEME;
  const applied = applyColorScheme(saved);
  labelAccent = applied.accent;
  schemeSelect.value = applied.name;
}
schemeSelect.addEventListener('change', () => {
  const applied = applyColorScheme(schemeSelect.value);
  labelAccent = applied.accent;
  localStorage.setItem('orrery.colorScheme', applied.name);
  schemeSelect.value = applied.name;
  rebuildSceneVisuals(); // 3D labels are canvas textures — they need a redraw to recolor
});

// ---------- simulated time: warp slider + "now" reset (milestone 7) ----------
const timeControl = createTimeControl();
const warpSlider = document.getElementById('warpSlider');
const warpValue = document.getElementById('warpValue');

warpSlider.addEventListener('input', () => {
  timeControl.warp = warpFromSlider(Number(warpSlider.value));
  warpValue.textContent = formatWarp(timeControl.warp);
  requestRender();
});
document.getElementById('nowButton').addEventListener('click', () => {
  resetToNow(timeControl);
  requestRender();
});

// ---------- GPU-polite render-on-demand, FPS-capped ----------
// Only camera input, a selection change, a new live snapshot, or active time
// warping should trigger a redraw — and even then, never faster than the FPS
// cap. See the handover doc's GPU-politeness principle: this shares a card
// with the game. At warp 1× (real time) bodies move imperceptibly, so no
// continuous rendering happens; above 1× the scene animates at the cap.
const FPS_CAP = 30;
const MIN_FRAME_INTERVAL_MS = 1000 / FPS_CAP;
let needsRender = true;
let lastRenderTime = 0;
let lastFrameTime = null;
function requestRender() { needsRender = true; }

function loop(now) {
  requestAnimationFrame(loop);
  const realDt = lastFrameTime === null ? 0 : now - lastFrameTime;
  lastFrameTime = now;
  advance(timeControl, realDt);
  if (timeControl.warp > 1) needsRender = true;
  if (!needsRender) return;
  if (now - lastRenderTime < MIN_FRAME_INTERVAL_MS) return; // stays dirty; picked up on the next eligible frame
  needsRender = false;
  lastRenderTime = now;
  updateSystemScene(renderedNodes, updatables, timeControl.simTimeMs, { trueScale });
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

const orbitCamera = createOrbitCamera(canvas, camera, { initialRadius: 70, onDirty: requestRender });
document.getElementById('resetViewButton').addEventListener('click', () => orbitCamera.reset());

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
addEventListener('resize', resize);
resize();

// ---------- selection ----------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let selectedId = null;
let scannedNodes = new Map(); // the real, authoritative tree — never mutated by EDSM backfill
let renderedNodes = new Map(); // scannedNodes, merged with EDSM backfill bodies when enabled — what's actually shown/selectable
let systemName = '';
let systemAddress = null;
let pickables = new Map();
let updatables = new Map();
let systemGroup = null;
let detectedMode = 'exploration';
let systemSecurity = null;
let factions = [];
let navBeaconDetected = false;
let bountyTally = 0;
let nextSystem = null;
let trueScale = false;

const nicknameInput = document.getElementById('nicknameInput');

function currentNickname(id) {
  return id !== null && systemAddress !== null ? getNickname(systemAddress, id) : null;
}

function selectNode(id) {
  selectedId = id;
  renderDetailPanel(id === null ? null : renderedNodes.get(id), systemName, currentNickname(id));
  nicknameInput.value = currentNickname(id) ?? '';
  requestRender();
}

function saveNicknameFromInput() {
  if (selectedId === null || systemAddress === null) return;
  setNickname(systemAddress, selectedId, nicknameInput.value);
  renderDetailPanel(renderedNodes.get(selectedId), systemName, currentNickname(selectedId));
  rebuildSceneVisuals(); // the in-scene label needs to pick up the new nickname too
}
nicknameInput.addEventListener('blur', saveNicknameFromInput);
nicknameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    saveNicknameFromInput();
    nicknameInput.blur();
  }
});

canvas.addEventListener('click', (event) => {
  pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
  pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects([...pickables.keys()], false);
  if (hits.length > 0) {
    selectNode(pickables.get(hits[0].object));
  }
});

document.getElementById('copyName').addEventListener('click', () => {
  if (selectedId === null) return;
  const node = renderedNodes.get(selectedId);
  navigator.clipboard?.writeText(node.name ?? '');
});

// ---------- true scale toggle (milestone 7) ----------
// Honest distances and radii — see scene-builder.js's TRUE_SCALE notes. Moons
// collapsing into their planets and near-invisible bodies are the honest
// point, per the handover doc: "flag it in the UI so it teaches rather than lies."
const trueScaleToggle = document.getElementById('trueScaleToggle');
trueScale = localStorage.getItem('orrery.trueScale') === 'true';
trueScaleToggle.checked = trueScale;
trueScaleToggle.addEventListener('change', () => {
  trueScale = trueScaleToggle.checked;
  localStorage.setItem('orrery.trueScale', String(trueScale));
  updateScaleBadge();
  rebuildSceneVisuals();
  fitCameraToBodies(); // the two scales differ by orders of magnitude — never leave the camera staring at empty space
});

// Zooms out (or in) so the whole system fits the view — used when toggling
// scale modes, where the layout size jumps by orders of magnitude.
function fitCameraToBodies() {
  let maxDistance = 0;
  for (const { bodyGroup } of updatables.values()) {
    maxDistance = Math.max(maxDistance, bodyGroup.position.length());
  }
  const radius = Math.min(Math.max(maxDistance * 1.4, 40), 18000);
  orbitCamera.focus(new THREE.Vector3(0, 0, 0), radius);
}

function updateScaleBadge() {
  const el = document.getElementById('sysScale');
  if (trueScale) {
    el.textContent = 'true distances — body sizes exaggerated';
    el.className = 'val-live';
  } else {
    el.textContent = 'compressed — not to scale';
    el.className = 'val-warn';
  }
}
updateScaleBadge();

// ---------- legend window (milestone 7): hidable icon/color explainer ----------
const legendPanel = document.getElementById('legend');
const legendToggle = document.getElementById('legendToggle');
legendPanel.hidden = localStorage.getItem('orrery.legendVisible') !== 'true';
legendToggle.addEventListener('click', () => {
  legendPanel.hidden = !legendPanel.hidden;
  localStorage.setItem('orrery.legendVisible', String(!legendPanel.hidden));
});

// ---------- audio cues (milestone 7): off by default ----------
const audioCues = createAudioCues();
const audioToggle = document.getElementById('audioToggle');
let audioEnabled = localStorage.getItem('orrery.audioEnabled') === 'true';
audioToggle.checked = audioEnabled;
audioToggle.addEventListener('change', () => {
  audioEnabled = audioToggle.checked;
  localStorage.setItem('orrery.audioEnabled', String(audioEnabled));
});

// Cue detection: compares each live snapshot's first-discovery and bio-signal
// body sets against the previous snapshot of the *same* system, so arriving
// in a system (or the first live snapshot after boot) never plays a burst of
// stale cues — only genuinely new events during play do.
let cueSystemAddress = null;
let knownDiscoveryIds = new Set();
let knownBioIds = new Set();

function detectAudioCues(payload) {
  const discoveryIds = new Set();
  const bioIds = new Set();
  for (const node of payload.nodes) {
    if (node.raw?.WasDiscovered === false) discoveryIds.add(node.id);
    if (node.bio?.signalCount > 0) bioIds.add(node.id);
  }

  const sameSystem = payload.systemAddress === cueSystemAddress;
  if (sameSystem && audioEnabled) {
    if ([...discoveryIds].some((id) => !knownDiscoveryIds.has(id))) audioCues.play('discovery');
    else if ([...bioIds].some((id) => !knownBioIds.has(id))) audioCues.play('bio');
  }
  cueSystemAddress = payload.systemAddress;
  knownDiscoveryIds = discoveryIds;
  knownBioIds = bioIds;
}

// ---------- session tracker strip (milestone 7, "thin v1.5") ----------
function updateSessionStrip(payload) {
  const strip = document.getElementById('sessionStrip');
  const stats = payload.sessionStats;
  strip.hidden = !stats; // the demo snapshot has no session — live only
  if (!stats) return;
  document.getElementById('stripScans').textContent = String(stats.scans);
  document.getElementById('stripFirstDisc').textContent = String(stats.firstDiscoveries);
  document.getElementById('stripBounty').textContent = (payload.bountyTally ?? 0).toLocaleString();
}

// ---------- activity mode: auto-detected, overridable by a manual pin ----------
// "Auto wins unless the user has pinned a mode" (handover doc). The watcher
// always reports its own auto-detection in the snapshot; the pin is a purely
// local UI preference layered on top, so multiple UI instances could each
// pin their own mode without needing to coordinate through the watcher.
const MODE_LABELS = { exploration: 'Exploration', exobiology: 'Exobiology', mining: 'Mining', piracy: 'Piracy' };
let pinnedMode = localStorage.getItem('orrery.pinnedMode') || null;

const modeSelect = document.getElementById('modeSelect');
modeSelect.value = pinnedMode ?? '';
modeSelect.addEventListener('change', () => {
  pinnedMode = modeSelect.value || null;
  if (pinnedMode) localStorage.setItem('orrery.pinnedMode', pinnedMode);
  else localStorage.removeItem('orrery.pinnedMode');
  updateModeDisplay();
  updateSystemLevelPanel(); // piracy's info block visibility depends on the effective mode
  rebuildSceneVisuals(); // mode-dependent highlighting (e.g. mining's ring glow) needs a rebuild, not just a label change
});

function effectiveMode() {
  return pinnedMode ?? detectedMode;
}

function updateModeDisplay() {
  document.getElementById('sysMode').textContent = MODE_LABELS[effectiveMode()] ?? effectiveMode();
}

// System-level context (security always shown; nav beacon/combat zones/bounty
// tally are piracy-specific, so gated behind the active mode to keep the
// panel lean the rest of the time — same "reduce clutter per mode" idea as
// the 3D overlay). The demo snapshot doesn't carry any of this (it's only
// ever captured live, from FSDJump/Bounty events), so it just reads "—".
function updateSystemLevelPanel() {
  document.getElementById('sysSecurity').textContent = systemSecurity ?? '—';

  const nextStopRow = document.getElementById('sysNextStopRow');
  nextStopRow.hidden = !nextSystem;
  if (nextSystem) document.getElementById('sysNextStop').textContent = nextSystem.starSystem;

  const isPiracy = effectiveMode() === 'piracy';
  document.getElementById('piracyInfo').hidden = !isPiracy;
  if (!isPiracy) return;

  document.getElementById('sysNavBeacon').textContent = navBeaconDetected ? 'Yes' : 'No';
  const combatFactions = factions.filter((f) => f.state === 'War' || f.state === 'CivilWar');
  document.getElementById('sysCombatZones').textContent = combatFactions.length > 0
    ? combatFactions.map((f) => `${f.name} (${f.state})`).join(', ')
    : 'None';
  document.getElementById('sysBountyTally').textContent = `${bountyTally.toLocaleString()} CR`;
}

// ---------- EDSM backfill (opt-in, off by default) ----------
// The one and only network call this app ever makes — see edsm-client.js and
// the README's privacy note. Bodies EDSM knows about that the player hasn't
// personally scanned are shown dim/wireframe ("known, not yours yet"); real
// Scan data always wins and is never overwritten (see edsm-backfill.js).
let edsmEnabled = localStorage.getItem('orrery.edsmEnabled') === 'true';
let edsmBodies = null; // raw EDSM response for the current system, or null (disabled/not fetched/failed)
let edsmFetchToken = 0; // guards against a stale response landing after the system has already changed again

const edsmToggle = document.getElementById('edsmToggle');
edsmToggle.checked = edsmEnabled;
edsmToggle.addEventListener('change', () => {
  edsmEnabled = edsmToggle.checked;
  localStorage.setItem('orrery.edsmEnabled', String(edsmEnabled));
  refreshEdsmBackfill();
});

function recomputeRenderedNodes() {
  renderedNodes = (edsmEnabled && edsmBodies) ? buildBackfillNodes(scannedNodes, edsmBodies) : scannedNodes;
}

async function refreshEdsmBackfill() {
  const token = ++edsmFetchToken;
  if (!edsmEnabled) {
    edsmBodies = null;
    recomputeRenderedNodes();
    rebuildSceneVisuals();
    return;
  }
  const bodies = await fetchEdsmBodies(systemName);
  if (token !== edsmFetchToken) return; // the system (or toggle) changed again while this was in flight — discard
  edsmBodies = bodies;
  recomputeRenderedNodes();
  rebuildSceneVisuals();
}

// Rebuilds just the 3D scene for the current renderedNodes/systemName at the
// current effective mode/scale/scheme — used by loadSystem (new data), a
// manual mode pin change, a scale or scheme change, and an EDSM backfill
// refresh (each changes what should render without touching selection).
function rebuildSceneVisuals() {
  if (systemGroup) disposeSystemScene(systemGroup);
  const nicknames = systemAddress !== null ? getNicknames(systemAddress) : {};
  const built = buildSystemScene(renderedNodes, timeControl.simTimeMs, systemName, effectiveMode(), nicknames, {
    trueScale,
    labelColor: labelAccent,
  });
  scene.add(built.group);
  pickables = built.pickables;
  updatables = built.updatables;
  systemGroup = built.group;
  requestRender();
}

// ---------- loading a system (shared by the demo data and live snapshots) ----------
function loadSystem(payload) {
  scannedNodes = new Map(payload.nodes.map((node) => [node.id, node]));
  systemName = payload.systemName;
  systemAddress = payload.systemAddress ?? null;
  edsmBodies = null; // that was for the previous system — cleared until refetched below
  recomputeRenderedNodes();
  // The demo snapshot has no live event stream to detect a mode from — default
  // to exploration, ED's own baseline activity, per the handover's mode table.
  detectedMode = payload.mode ?? 'exploration';
  systemSecurity = payload.systemSecurity ?? null;
  factions = payload.factions ?? [];
  navBeaconDetected = payload.navBeaconDetected ?? false;
  bountyTally = payload.bountyTally ?? 0;
  nextSystem = payload.nextSystem ?? null;
  updateModeDisplay();
  updateSystemLevelPanel();
  updateSessionStrip(payload);
  detectAudioCues(payload);

  rebuildSceneVisuals();
  refreshEdsmBackfill(); // no-op if disabled; otherwise fetches in the background and re-renders once it lands

  document.getElementById('sysName').textContent = systemName;
  const renderableCount = [...scannedNodes.values()].filter((n) => n.kind === 'Star' || n.kind === 'Planet').length;
  document.getElementById('sysBodyCount').textContent = String(renderableCount);

  // Keep the current selection if it still exists in the new tree (a rescan
  // shouldn't yank the view away); otherwise fall back to the primary star.
  if (selectedId !== null && renderedNodes.has(selectedId)) {
    selectNode(selectedId);
  } else {
    const primaryStar = [...renderedNodes.values()].find((n) => n.kind === 'Star');
    selectNode(primaryStar ? primaryStar.id : null);
  }
}

// ---------- source indicator (DEMO vs LIVE) ----------
let hasReceivedLiveSnapshot = false;
function setSourceBadge(state) {
  const el = document.getElementById('sysSource');
  if (state === 'live') {
    el.textContent = 'LIVE';
    el.className = 'val-live';
  } else if (state === 'live-disconnected') {
    el.textContent = 'LIVE (LOST)';
    el.className = 'val-warn';
  } else {
    el.textContent = 'DEMO';
    el.className = 'val-demo';
  }
}

// ---------- boot: demo data immediately, then try the live watcher ----------
// The UI never requires a live watcher connection to render something real —
// this is the "runs standalone with a bundled demo system JSON" path from
// the handover doc. See watcher/scripts/build-demo-snapshot.js for how this
// file is generated from the real (scrubbed) journal fixture.
loadSystem(demoSystem);
setSourceBadge('demo');

connectLive({
  onSnapshot(snapshot) {
    hasReceivedLiveSnapshot = true;
    loadSystem(snapshot);
    setSourceBadge('live');
  },
  onStatusChange(status) {
    if (!hasReceivedLiveSnapshot) return; // still on demo data; no watcher data to be "disconnected" from yet
    setSourceBadge(status === 'connected' ? 'live' : 'live-disconnected');
  },
});
