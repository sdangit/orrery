import * as THREE from 'three';
import demoSystem from './data/demo-system.json';
import { createOrbitCamera } from './camera.js';
import { buildSystemScene, disposeSystemScene } from './scene-builder.js';
import { renderDetailPanel } from './data-panel.js';
import { connectLive } from './live-connection.js';

// ---------- renderer & scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060402);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 20000);

// starfield backdrop, ported from ed-space-tutor.html
(function addStarfield() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 400 + Math.random() * 300;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x554433, size: 1.2, sizeAttenuation: true })));
})();

// ---------- GPU-polite render-on-demand, FPS-capped ----------
// Only camera input, a selection change, or a new live snapshot should
// trigger a redraw — and even then, never faster than the FPS cap. See the
// handover doc's GPU-politeness principle: this shares a card with the game.
const FPS_CAP = 30;
const MIN_FRAME_INTERVAL_MS = 1000 / FPS_CAP;
let needsRender = true;
let lastRenderTime = 0;
function requestRender() { needsRender = true; }

function loop(now) {
  requestAnimationFrame(loop);
  if (!needsRender) return;
  if (now - lastRenderTime < MIN_FRAME_INTERVAL_MS) return; // stays dirty; picked up on the next eligible frame
  needsRender = false;
  lastRenderTime = now;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

const orbitCamera = createOrbitCamera(canvas, camera, { initialRadius: 70, onDirty: requestRender });

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
let nodes = new Map();
let systemName = '';
let pickables = new Map();
let systemGroup = null;
let detectedMode = 'exploration';

function selectNode(id) {
  selectedId = id;
  renderDetailPanel(id === null ? null : nodes.get(id), systemName);
  requestRender();
}

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
  const node = nodes.get(selectedId);
  navigator.clipboard?.writeText(node.name ?? '');
});

// ---------- loading a system (shared by the demo data and live snapshots) ----------
function loadSystem(payload) {
  const newNodes = new Map(payload.nodes.map((node) => [node.id, node]));

  if (systemGroup) disposeSystemScene(systemGroup);
  const built = buildSystemScene(newNodes, Date.now(), payload.systemName);
  scene.add(built.group);

  nodes = newNodes;
  systemName = payload.systemName;
  pickables = built.pickables;
  systemGroup = built.group;

  document.getElementById('sysName').textContent = systemName;
  const renderableCount = [...nodes.values()].filter((n) => n.kind === 'Star' || n.kind === 'Planet').length;
  document.getElementById('sysBodyCount').textContent = String(renderableCount);

  // The demo snapshot has no live event stream to detect a mode from — default
  // to exploration, ED's own baseline activity, per the handover's mode table.
  detectedMode = payload.mode ?? 'exploration';
  updateModeDisplay();

  // Keep the current selection if it still exists in the new tree (a rescan
  // shouldn't yank the view away); otherwise fall back to the primary star.
  if (selectedId !== null && nodes.has(selectedId)) {
    selectNode(selectedId);
  } else {
    const primaryStar = [...nodes.values()].find((n) => n.kind === 'Star');
    selectNode(primaryStar ? primaryStar.id : null);
  }
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
});

function effectiveMode() {
  return pinnedMode ?? detectedMode;
}

function updateModeDisplay() {
  document.getElementById('sysMode').textContent = MODE_LABELS[effectiveMode()] ?? effectiveMode();
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
