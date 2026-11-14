import * as THREE from 'three';
import { displayPosition, absolutePosition, classifySpotlight, classifyModeHighlight, compressDistance, compressOffset, keplerianOffset } from '@orrery/shared';
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

// True-scale mode: honest *distances* (1 display unit = 1e9 m, ~0.0067 AU),
// exaggerated body sizes — the standard planetarium convention. Reworked
// after real-browser feedback: fully-honest radii made every body an
// invisible sub-pixel dot, which taught nothing. The distances are the part
// that teaches ("space is mostly nothing"); body sizes and ring bands keep
// the same exaggerated display sizing as compressed mode so there's still
// something to see and click, and the scale badge says so.
const TRUE_SCALE_METRES_PER_UNIT = 1e9;

function scenePosition(nodes, id, atEpochMs, trueScale) {
  if (!trueScale) return displayPosition(nodes, id, atEpochMs);
  const p = absolutePosition(nodes, id, atEpochMs);
  return {
    x: p.x / TRUE_SCALE_METRES_PER_UNIT,
    y: p.y / TRUE_SCALE_METRES_PER_UNIT,
    z: p.z / TRUE_SCALE_METRES_PER_UNIT,
  };
}

/**
 * A body's orbit path around its parent, as a line loop of positions sampled
 * across one full orbital period — glanceable structure even where the body
 * itself is a small dot (which true-distance mode makes common). Sampling by
 * time through keplerianOffset naturally spaces points by real motion, and
 * in compressed mode each sample is compressed exactly the way the body's own
 * position is, so the path always passes through the body.
 * @returns {THREE.Line|null} Positioned relative to the parent — the caller places it at the parent's current position.
 */
function buildOrbitPath(node, trueScale) {
  if (!node.elements) return null;
  const samples = 96;
  const periodMs = node.elements.orbitalPeriodSec * 1000;
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const offset = keplerianOffset(node.elements, node.elements.epochMs + (i / samples) * periodMs);
    const p = trueScale
      ? { x: offset.x / TRUE_SCALE_METRES_PER_UNIT, y: offset.y / TRUE_SCALE_METRES_PER_UNIT, z: offset.z / TRUE_SCALE_METRES_PER_UNIT }
      : compressOffset(offset);
    points.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x7a4a1e, transparent: true, opacity: node.isBackfill ? 0.18 : 0.35 }),
  );
  line.userData.baseOpacity = line.material.opacity;
  line.userData.orbitBodyId = node.id; // stashed for testability
  return line;
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
    const radius = bodyDisplayRadius(node);
    const color = bodyColor(node);
    const { spotlighted } = classifySpotlight(node);
    const modeHighlight = classifyModeHighlight(node, mode);

    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(pos.x, pos.y, pos.z);

    // Community bodies remain wireframes even when their orbital phase is
    // known. Personal scan status and position quality are separate concepts.
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
    label.position.set(0, 0, radius + 1.1);
    bodyGroup.add(label);

    group.add(bodyGroup);

    const updatable = { bodyGroup, rings: [], orbit: null, parentId: node.parentId ?? null };
    updatables.set(node.id, updatable);

    // Orbit path ellipse, centred on the body's parent. Kept out of bodyGroup
    // (which sits at the body itself) and repositioned alongside the parent
    // during warp updates.
    const orbitLine = buildOrbitPath(node, trueScale);
    if (orbitLine) {
      try {
        const parentPos = node.parentId != null
          ? scenePosition(nodes, node.parentId, atEpochMs, trueScale)
          : { x: 0, y: 0, z: 0 };
        orbitLine.position.set(parentPos.x, parentPos.y, parentPos.z);
        group.add(orbitLine);
        updatable.orbit = orbitLine;
      } catch {
        // parent unresolvable (orphan tolerance) — skip the path, keep the body
      }
    }

    // Ring band(s), drawn once per owning body regardless of how many belt
    // clusters reference it — the journal never gives individual cluster
    // angles, only that they exist somewhere in the band. Ring radii stay on
    // the compressed display scale even in true-distance mode, consistent
    // with the exaggerated body sizes they belong to.
    const rawRings = node.raw?.Rings;
    if (Array.isArray(rawRings) && !ringsAddedFor.has(node.id)) {
      ringsAddedFor.add(node.id);
      for (const ring of rawRings) {
        const innerR = compressDistance(ring.InnerRad);
        const outerR = compressDistance(ring.OuterRad);
        // In mining mode, a Pristine/Major reserve ring gets FDev's own
        // amber "this is good" color and a brighter band ("Pristine glows",
        // per the design brief's mode table) instead of its natural ring-class tint.
        const isGoodReserve = modeHighlight.reasons.includes('good-reserve');
        const ringColor = isGoodReserve ? 0xffd24d : (RING_CLASS_COLORS[ring.RingClass] ?? 0x7a4a1e);
        const opacity = modeHighlight.highlighted ? (isGoodReserve ? 0.65 : 0.45) : 0.35;
        const ringMesh = new THREE.Mesh(
          new THREE.RingGeometry(innerR, outerR, 96),
          new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity }),
        );
        // RingGeometry is already in XY, matching the journal reference plane.
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
 * @param {Map<number, {bodyGroup: THREE.Group, rings: THREE.Mesh[], orbit: THREE.Line|null, parentId: number|null}>} updatables From buildSystemScene.
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
    if (entry.orbit) {
      try {
        const parentPos = entry.parentId != null
          ? scenePosition(nodes, entry.parentId, atEpochMs, trueScale)
          : { x: 0, y: 0, z: 0 };
        entry.orbit.position.set(parentPos.x, parentPos.y, parentPos.z);
      } catch {
        // parent unresolvable this tick — leave the path where it was
      }
    }
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

/** A subtle selection cue; does not change the camera or time reference. */
export function highlightSelectedOrbit(updatables, selectedId) {
  for (const [id, entry] of updatables) {
    if (!entry.orbit) continue;
    const selected = id === selectedId;
    entry.orbit.material.color.setHex(selected ? 0xa76b32 : 0x7a4a1e);
    entry.orbit.material.opacity = entry.orbit.userData.baseOpacity + (selected ? 0.15 : 0);
  }
}
