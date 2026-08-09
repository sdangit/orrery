import * as THREE from 'three';
import { displayPosition, classifySpotlight, classifyModeHighlight, compressDistance } from '@orrery/shared';
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
 * @returns {{ group: THREE.Group, pickables: Map<THREE.Object3D, number> }}
 */
export function buildSystemScene(nodes, atEpochMs, systemName, mode = 'exploration', nicknames = {}) {
  const group = new THREE.Group();
  const pickables = new Map();
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
      pos = displayPosition(nodes, node.id, atEpochMs);
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
    const labelColor = spotlighted ? '#ffd24d' : (node.isBackfill ? '#7a4a1e' : '#ff8a2a');
    const label = makeLabel(labelText, labelColor);
    label.userData.text = labelText; // stashed for testability — canvas-texture text isn't otherwise inspectable
    label.position.set(0, radius + 1.1, 0);
    bodyGroup.add(label);

    group.add(bodyGroup);

    // Ring band(s), drawn once per owning body regardless of how many belt
    // clusters reference it — the journal never gives individual cluster
    // angles, only that they exist somewhere in the band.
    const rawRings = node.raw?.Rings;
    if (Array.isArray(rawRings) && !ringsAddedFor.has(node.id)) {
      ringsAddedFor.add(node.id);
      for (const ring of rawRings) {
        const innerR = compressDistance(ring.InnerRad);
        const outerR = compressDistance(ring.OuterRad);
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
      }
    }
  }

  return { group, pickables };
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
