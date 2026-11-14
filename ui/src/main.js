import * as THREE from 'three';
import demoSystem from './data/demo-system.json';
import { createOrbitCamera } from './camera.js';
import { bindBodySelection, pickBody } from './picking.js';
import { primaryStarId } from './primary-star.js';
import { buildSystemScene, updateSystemScene, disposeSystemScene, highlightSelectedOrbit } from './scene-builder.js';
import { renderDetailPanel } from './data-panel.js';
import { connectLive } from './live-connection.js';
import { getNickname, getNicknames, setNickname } from './nicknames.js';
import { mergeCommunityBodies } from '@orrery/shared';
import { fetchCommunityBodies } from './community-client.js';
import { createTimeControl, advance, resetToNow } from './time-control.js';
import { bindTimePanel } from './time-panel.js';
import { applyColorScheme, DEFAULT_SCHEME } from './color-schemes.js';
import { createAudioCues } from './audio-cues.js';

// ---------- renderer & scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060402);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60000);

// starfield backdrop, ported from the original prototype — pushed far enough out
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

// ---------- shared simulation clock and reference-orbit playback ----------
const timeControl = createTimeControl();
const timePanel = bindTimePanel(timeControl, {
  getSelectedNode: () => renderedNodes.get(selectedId),
  onChange: () => { lastFrameTime = null; requestRender(); },
});

// ---------- GPU-polite render-on-demand, FPS-capped ----------
// Only camera input, a selection change, a new live snapshot, or active time
// warping should trigger a redraw — and even then, never faster than the FPS
// cap. See the design brief's GPU-politeness principle: this shares a card
// with the game. Live time needs no continuous GPU rendering; playback in
// either direction animates at the cap. The text clock updates independently.
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
  const wasPlaying = !timeControl.live && !timeControl.paused;
  advance(timeControl, realDt, Date.now());
  timePanel.tick(now);
  // Include the final frame if advance() pauses at the supported date limit.
  if (wasPlaying) needsRender = true;
  if (!needsRender) return;
  if (now - lastRenderTime < MIN_FRAME_INTERVAL_MS) return; // stays dirty; picked up on the next eligible frame
  needsRender = false;
  lastRenderTime = now;
  updateSystemScene(renderedNodes, updatables, timeControl.simTimeMs, { trueScale });
  if (focusedBodyId !== null) {
    const body = updatables.get(focusedBodyId);
    if (body) orbitCamera.focus(body.bodyGroup.position);
  }
  // A programmatic focus above is already included in this render.
  needsRender = false;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

const orbitCamera = createOrbitCamera(canvas, camera, {
  initialRadius: 70,
  onDirty: requestRender,
  onPan() {
    focusedBodyId = null;
    document.getElementById('orbitTarget').textContent = 'Custom point';
  },
});
document.getElementById('resetViewButton').addEventListener('click', () => fitCameraToBodies(true));
document.getElementById('fitSystemButton').addEventListener('click', () => fitCameraToBodies());
document.getElementById('centerMainStarButton').addEventListener('click', () => centerBody(primaryStarId(renderedNodes)));
document.getElementById('centerSelectedButton').addEventListener('click', () => centerBody(selectedId));
document.getElementById('closeDetailButton').addEventListener('click', () => selectNode(null));

function resize() {
  const { width: w, height: h } = canvas.getBoundingClientRect();
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
addEventListener('resize', resize);
resize();

// ---------- selection ----------
let selectedId = null;
let focusedBodyId = null;
let needsInitialFit = false;
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
  document.getElementById('centerSelectedButton').disabled = !updatables.has(id);
  timePanel.refresh();
  highlightSelectedOrbit(updatables, selectedId);
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

bindBodySelection(canvas, (x, y) => {
  const id = pickBody(x, y, canvas, camera, scene, pickables);
  if (id !== null) selectNode(id);
});

document.getElementById('copyName').addEventListener('click', () => {
  if (selectedId === null) return;
  const node = renderedNodes.get(selectedId);
  navigator.clipboard?.writeText(node.name ?? '');
});

// ---------- true scale toggle (milestone 7) ----------
// Honest distances and radii — see scene-builder.js's TRUE_SCALE notes. Moons
// collapsing into their planets and near-invisible bodies are the honest
// point, per the design brief: "flag it in the UI so it teaches rather than lies."
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
function fitCameraToBodies(resetDirection = false) {
  updateSystemScene(renderedNodes, updatables, timeControl.simTimeMs, { trueScale });
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const mesh of pickables.keys()) bounds.expandByObject(mesh);
  const { width, height } = canvas.getBoundingClientRect();
  const left = document.getElementById('systemPanel').getBoundingClientRect().right;
  const detail = document.getElementById('detail');
  const right = detail.hidden ? 0 : width - detail.getBoundingClientRect().left;
  focusedBodyId = null;
  orbitCamera.fit(bounds, {
    widthFraction: Math.max(0.2, 1 - 2 * (Math.max(left, right) + 24) / width),
    heightFraction: Math.max(0.3, 1 - 120 / height),
  }, resetDirection);
  document.getElementById('orbitTarget').textContent = 'System center';
}

function centerBody(id) {
  if (id === null || !updatables.has(id)) return;
  updateSystemScene(renderedNodes, updatables, timeControl.simTimeMs, { trueScale });
  focusedBodyId = id;
  orbitCamera.focus(updatables.get(id).bodyGroup.position);
  document.getElementById('orbitTarget').textContent = renderedNodes.get(id).name ?? `Body ${id}`;
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
// "Auto wins unless the user has pinned a mode" (design brief). The watcher
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

// ---------- community backfill: providers are independently opt-in ----------
const providerNames = { edsm: 'EDSM', spansh: 'Spansh' };
const enabledProviders = new Set(Object.keys(providerNames)
  .filter((source) => localStorage.getItem(`orrery.${source}Enabled`) === 'true'));
let communityData = null;
let communityFetchToken = 0;
let communityAbort = null;
let communityDiagnostics = [];

for (const source of Object.keys(providerNames)) {
  const toggle = document.getElementById(`${source}Toggle`);
  toggle.checked = enabledProviders.has(source);
  toggle.addEventListener('change', () => {
    if (toggle.checked) enabledProviders.add(source);
    else enabledProviders.delete(source);
    localStorage.setItem(`orrery.${source}Enabled`, String(toggle.checked));
    refreshCommunityBackfill();
  });
}

function recomputeRenderedNodes() {
  const active = Object.fromEntries([...enabledProviders]
    .filter((source) => communityData?.[source]).map((source) => [source, communityData[source]]));
  const merged = mergeCommunityBodies(scannedNodes, active);
  renderedNodes = merged.nodes;
  communityDiagnostics = merged.diagnostics;
}

function updateCommunityStatus(loading = false) {
  const messages = { ready: 'loaded', empty: 'no data', unavailable: 'unavailable',
    'identity-mismatch': 'system mismatch', 'missing-address': 'system address needed' };
  document.getElementById('communityStatus').textContent = !enabledProviders.size ? 'Community data off'
    : [...enabledProviders].map((source) => `${providerNames[source]}: ${loading ? 'loading' : messages[communityData?.[source]?.status] ?? 'watcher unavailable'}`).join(' · ');
  const unresolved = [...renderedNodes.values()].filter((n) => ['Star', 'Planet'].includes(n.kind) && n.positionIssue).length;
  const issue = document.getElementById('communityIssues');
  issue.hidden = !communityDiagnostics.length;
  issue.textContent = unresolved ? `${unresolved} bodies cannot be positioned from the available data.` : 'Data conflicts resolved using source priority.';
  issue.title = communityDiagnostics.join('\n');
}

async function refreshCommunityBackfill() {
  const token = ++communityFetchToken;
  communityAbort?.abort();
  // Immediately remove disabled sources, keeping enabled cached data visible.
  recomputeRenderedNodes();
  rebuildSceneVisuals();
  if (!enabledProviders.size) { updateCommunityStatus(); return; }
  communityAbort = new AbortController();
  const controller = communityAbort;
  const timeout = setTimeout(() => controller.abort(), 10000);
  updateCommunityStatus(true);
  const result = await fetchCommunityBodies({ systemName, systemAddress, providers: [...enabledProviders] }, { signal: controller.signal });
  clearTimeout(timeout);
  if (token !== communityFetchToken) return;
  communityData = result;
  recomputeRenderedNodes();
  rebuildSceneVisuals();
  updateCommunityStatus();
  if (needsInitialFit && updatables.size > 0) {
    fitCameraToBodies(true);
    needsInitialFit = false;
  }
}

// Rebuilds just the 3D scene for the current renderedNodes/systemName at the
// current effective mode/scale/scheme — used by loadSystem (new data), a
// manual mode pin change, a scale or scheme change, and a community backfill
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
  if (selectedId !== null && !renderedNodes.has(selectedId)) selectNode(null);
  const mainStarButton = document.getElementById('centerMainStarButton');
  mainStarButton.disabled = !updatables.has(primaryStarId(renderedNodes));
  mainStarButton.title = mainStarButton.disabled ? 'Main star is not yet identified in the available data' : 'Orbit around the main star';
  document.getElementById('centerSelectedButton').disabled = !updatables.has(selectedId);
  timePanel.refresh();
  highlightSelectedOrbit(updatables, selectedId);
  if (selectedId !== null) renderDetailPanel(renderedNodes.get(selectedId), systemName, currentNickname(selectedId));
  updateCommunityStatus();
  const knownCount = [...renderedNodes.values()].filter((n) => ['Star', 'Planet'].includes(n.kind)).length;
  const scannedCount = [...scannedNodes.values()].filter((n) => ['Star', 'Planet'].includes(n.kind)).length;
  document.getElementById('sysBodyCount').textContent = `${knownCount} known / ${scannedCount} scanned`;
  if (focusedBodyId !== null && !updatables.has(focusedBodyId)) {
    focusedBodyId = null;
    document.getElementById('orbitTarget').textContent = 'Custom point';
  }
  requestRender();
}

// ---------- loading a system (shared by the demo data and live snapshots) ----------
function loadSystem(payload) {
  const changedSystem = systemAddress !== (payload.systemAddress ?? null) || systemName !== payload.systemName;
  const hadBodies = updatables.size > 0;
  if (changedSystem) {
    resetToNow(timeControl);
    lastFrameTime = null;
    selectedId = null;
    focusedBodyId = null;
    needsInitialFit = true;
  }
  scannedNodes = new Map(payload.nodes.map((node) => [node.id, node]));
  systemName = payload.systemName;
  systemAddress = payload.systemAddress ?? null;
  // Same-system scans must retain backfill parents and the current camera target.
  if (changedSystem) communityData = null;
  recomputeRenderedNodes();
  // The demo snapshot has no live event stream to detect a mode from — default
  // to exploration, ED's own baseline activity, per the design brief's mode table.
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
  if (changedSystem) refreshCommunityBackfill();

  document.getElementById('sysName').textContent = systemName;

  // Keep the current selection if it still exists in the new tree (a rescan
  // shouldn't yank the view away); otherwise fall back to the primary star.
  if (selectedId !== null && renderedNodes.has(selectedId)) {
    selectNode(selectedId);
  } else {
    selectNode(changedSystem || !hadBodies ? primaryStarId(renderedNodes) : null);
  }
  if (updatables.size > 0 && (needsInitialFit || !hadBodies)) {
    fitCameraToBodies(true);
    needsInitialFit = false;
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
// the design brief. See watcher/scripts/build-demo-snapshot.js for how this
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
