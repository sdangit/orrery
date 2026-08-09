import * as THREE from 'three';
import { displayPosition, absolutePosition, classifySpotlight, classifyModeHighlight, compressDistance } from '@orrery/shared';
import { makeLabel } from './labels.js';
import { bodyColor, bodyDisplayRadius, bodyIcon } from './body-visuals.js';
import { shortDesignator } from './naming.js';

const RING_CLASS_COLORS = {
  eRingClass_Icy: 0xcfe8f5,
  eRingClass_Rocky: 0x8a7866,
  eRingClass_Metalic: 0xb0b0b0,
  eRingClass_MetalRich: 0xd99a5b,
};

const RENDERABLE_KINDS = new Set(['Star', 'Planet']);

// True-scale mode: 1 display unit = 1e9 m (~0.0067 AU). At this scale the
// demo system's binary separation (~5e12 m) sits ~5000 units out and a tight
// moon orbit (~1.5e6 m) collapses to 0.0015 units — invisible, which is the
// honest point of the toggle (the handover doc: "flag it in the UI so it
// teaches rather than lies"). Radii are also honest, floored only barely
// enough to stay clickable.
const TRUE_SCALE_METRES_PER_UNIT = 1e9;
const TRUE_SCALE_MIN_RADIUS = 0.02;

function scenePosition(nodes, id, atEpochMs, trueScale) {
  if (!trueScale) return displayPosition(nodes, id, atEpochMs);
  const p = absolutePosition(nodes, id, atEpochMs);
  return {
    x: p.x / TRUE_SCALE_METRES_PER_UNIT,
    y: p.y / TRUE_SCALE_METRES_PER_UNIT,
    z: p.z / TRUE_SCALE_METRES_PER_UNIT,
  };
}

function sceneRadius(node, trueScale) {
  if (!trueScale) return bodyDisplayRadius(node);
  const realRadius = node.raw?.Radius ?? 0;
  return Math.max(realRadius / TRUE_SCALE_METRES_PER_UNIT, TRUE_SCALE_MIN_RADIUS);
}

function sceneRingRadius(realMetres, trueScale) {
  return trueScale ? realMetres / TRUE_SCALE_METRES_PER_UNIT : compressDistance(realMetres);
}

/**
 * Builds Three.js objects for every renderable body in the tree (stars and
 * planets/moons — barycentres are invisible organizing nodes, and belt
 * clusters render as their parent's ring band rather than as individual
 * points, since the journal gives no per-cluster angular position).
 *
 * @param {Map<number, object>} nodes
 * @param {number} atEpochMs
 * @param {string} systemName Used to strip the redundant system-name prefix off in-scene labels (see naming.js).
 * @param {string} [mode] The active activity mode (see mode-detect.js's MODES) — drives per-mode highlighting (see mode-highlight.js). Defaults to 'exploration', which has no per-body highlight beyond the always-on spotlight treatment.
 * @param {Record<number, string>} [nicknames] bodyId -> nickname (see nicknames.js) — stands in for the designator wherever a body is pinned.
 * @param {object} [options]
 * @param {boolean} [options.trueScale] Honest distances/radii instead of the default log-compressed display scale.
 * @param {string} [options.labelColor] CSS color for ordinary body labels (the active HUD color scheme's accent). Spotlighted/backfill labels keep their own fixed colors.
 * @returns {{ group: THREE.Group, pickables: Map<THREE.Object3D, number>, updatables: Map<number, {bodyGroup: THREE.Group, rings: THREE.Mesh[]}> }}
 *   `updatables` lets updateSystemScene() move bodies as simulated time advances (the warp slider) without a full scene rebuild.
 */
export function buildSystemScene(nodes, atEpochMs, systemName, mode = 'exploration', nicknames = {}, options = {}) {
  const { trueScale = false, labelColor = '#ff8a2a' } = options;
  const group = new THREE.Group();
  const pickables = new Map();
  const updatables = new Map();
  const ringsAddedFor = new Set();

  for (const node of nodes.values()) {
    if (!RENDERABLE_KINDS.has(node.kind)) continue;

    // In live play a body can be scanned before its parent is (e.g. a moon
    // mapped before its planet ever got a full Scan), which buildBodyTree
    // reports as an "orphan" — a parentId with no corresponding node. That's
    // an expected transient state mid-session, not a bug: skip the body
    // rather than letting the whole scene fail to render around one hole in
    // the chain. It reappears on its own once the missing parent is scanned.
    let pos;
    try {
      pos = scenePosition(nodes, node.id, atEpochMs, trueScale);
    } catch (err) {
      console.warn(`orrery: skipping body ${node.id} (${node.name ?? 'unnamed'}) — ${err.message}`);
      continue;
    }
    const radius = sceneRadius(node, trueScale);
    const color = bodyColor(node);
    const { spotlighted } = classifySpotlight(node);
    const modeHighlight = classifyModeHighlight(node, mode);

    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(pos.x, pos.y, pos.z);

    // EDSM backfill bodies ("known, not yours yet" — see edsm-backfill.js)
    // render as dim wireframes, never solid — their position in particular
    // is a fixed, non-live approximation (EDSM gives no orbital phase data),
    // and the wireframe is the visual promise that this isn't real scan data.
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      node.isBackfill
        ? new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.5 })
        : new THREE.MeshBasicMaterial({ color }),
    );
    bodyGroup.add(mesh);
    pickables.set(mesh, node.id);

    if (spotlighted) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.8, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xffd24d, transparent: true, opacity: 0.28, side: THREE.BackSide }),
      );
      bodyGroup.add(halo);
    }

    if (modeHighlight.highlighted && modeHighlight.reasons.includes('good-reserve')) {
      const miningHalo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 2.2, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x0ae6f0, transparent: true, opacity: 0.15, side: THREE.BackSide }),
      );
      bodyGroup.add(miningHalo);
    }

    if (modeHighlight.highlighted && modeHighlight.reasons.includes('has-bio-signals')) {
      // Brighter once every found species is fully sampled (3/3) — a glanceable
      // "nothing left to do here" signal, dim while signals are still unconfirmed/in-progress.
      const bioOpacity = modeHighlight.reasons.includes('fully-sampled') ? 0.3 : 0.15;
      const bioHalo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 2.2, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x6bffb3, transparent: true, opacity: bioOpacity, side: THREE.BackSide }),
      );
      bodyGroup.add(bioHalo);
    }

    if (node.landable) {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.3, radius * 1.5, 24),
        new THREE.MeshBasicMaterial({ color: 0x0ae6f0, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
      );
      bodyGroup.add(marker);
    }

    const designator = nicknames[node.id] ?? (node.name ? shortDesignator(node.name, systemName) : `Body ${node.id}`);
    const icon = bodyIcon(node);
    const labelText = icon ? `${icon} ${designator}` : designator;
    // Spotlight (e.g. a genuinely high-value world) still pops through even
    // on backfill data — that's the point of showing it before it's scanned.
    const finalLabelColor = spotlighted ? '#ffd24d' : (node.isBackfill ? '#7a4a1e' : labelColor);
    const label = makeLabel(labelText, finalLabelColor);
    label.userData.text = labelText; // stashed for testability — canvas-texture text isn't otherwise inspectable
    label.position.set(0, radius + 1.1, 0);
    bodyGroup.add(label);

    group.add(bodyGroup);

    const updatable = { bodyGroup, rings: [] };
    updatables.set(node.id, updatable);

    // Ring band(s), drawn once per owning body regardless of how many belt
    // clusters reference it — the journal never gives individual cluster
    // angles, only that they exist somewhere in the band.
    const rawRings = node.raw?.Rings;
    if (Array.isArray(rawRings) && !ringsAddedFor.has(node.id)) {
      ringsAddedFor.add(node.id);
      for (const ring of rawRings) {
        const innerR = sceneRingRadius(ring.InnerRad, trueScale);
        const outerR = sceneRingRadius(ring.OuterRad, trueScale);
        // In mining mode, a Pristine/Major reserve ring gets FDev's own
        // amber "this is good" color and a brighter band ("Pristine glows",
        // per the handover's mode table) instead of its natural ring-class tint.
        const isGoodReserve = modeHighlight.reasons.includes('good-reserve');
        const ringColor = isGoodReserve ? 0xffd24d : (RING_CLASS_COLORS[ring.RingClass] ?? 0x7a4a1e);
        const opacity = modeHighlight.highlighted ? (isGoodReserve ? 0.65 : 0.45) : 0.35;
        const ringMesh = new THREE.Mesh(
          new THREE.RingGeometry(innerR, outerR, 96),
          new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity }),
        );
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.set(pos.x, pos.y, pos.z);
        ringMesh.userData.bodyId = node.id; // stashed for testability
        group.add(ringMesh);
        updatable.rings.push(ringMesh);
      }
    }
  }

  return { group, pickables, updatables };
}

/**
 * Moves every body (and its rings) to its position at a new simulated time —
 * the warp slider's per-frame update path. Radii/highlighting/labels are
 * time-independent, so no rebuild is needed; ~70 Kepler solves per call is
 * cheap. A body whose chain can't resolve (same orphan tolerance as build
 * time) just stays where it was.
 *
 * @param {Map<number, object>} nodes
 * @param {Map<number, {bodyGroup: THREE.Group, rings: THREE.Mesh[]}>} updatables From buildSystemScene.
 * @param {number} atEpochMs
 * @param {{trueScale?: boolean}} [options] Must match what the scene was built with.
 */
export function updateSystemScene(nodes, updatables, atEpochMs, options = {}) {
  const { trueScale = false } = options;
  for (const [id, entry] of updatables) {
    let pos;
    try {
      pos = scenePosition(nodes, id, atEpochMs, trueScale);
    } catch {
      continue;
    }
    entry.bodyGroup.position.set(pos.x, pos.y, pos.z);
    for (const ring of entry.rings) ring.position.set(pos.x, pos.y, pos.z);
  }
}

/**
 * Frees GPU resources for a group built by buildSystemScene and removes it
 * from its parent. Needed once the scene gets rebuilt on every live snapshot
 * (system switches, new scans) rather than built once at startup — without
 * this, each rebuild would leak the previous system's geometries/materials/
 * textures.
 * @param {THREE.Group} group
 */
export function disposeSystemScene(group) {
  group.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        material.map?.dispose?.();
        material.dispose?.();
      }
    }
  });
  group.parent?.remove(group);
}
