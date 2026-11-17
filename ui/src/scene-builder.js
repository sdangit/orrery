import * as THREE from 'three';
import { displayPosition, absolutePosition, classifySpotlight, classifyModeHighlight, compressDistance, parentOrbitFrame, isBeltRing } from '@orrery/shared';
import { makeLabel } from './labels.js';
import { bodyColor, bodyDisplayRadius, bodyIcon } from './body-visuals.js';
import { shortDesignator } from './naming.js';
import { METRES_PER_UNIT, scaleSettings } from './scale-modes.js';
import { makeBodyMarker } from './body-markers.js';
import { buildOrbitPath, updateOrbitPhase } from './orbit-path.js';
import { resolveOrbitBrightness } from './orbit-settings.js';
import { buildAsteroidBelt } from './asteroid-belt.js';

const RING_CLASS_COLORS = {
  eRingClass_Icy: 0xcfe8f5,
  eRingClass_Rocky: 0x8a7866,
  eRingClass_Metalic: 0xb0b0b0,
  eRingClass_MetalRich: 0xd99a5b,
};

const RENDERABLE_KINDS = new Set(['Star', 'Planet']);

export function scenePosition(nodes, id, atEpochMs, trueDistances) {
  if (!trueDistances) return displayPosition(nodes, id, atEpochMs);
  const p = absolutePosition(nodes, id, atEpochMs);
  return {
    x: p.x / METRES_PER_UNIT,
    y: p.y / METRES_PER_UNIT,
    z: p.z / METRES_PER_UNIT,
  };
}

function addOrbitPath(group, nodes, node, pos, trueDistances, radius, atEpochMs) {
  if (!node.elements) return null;
  let parentPos;
  try {
    parentPos = node.parentId != null
      ? scenePosition(nodes, node.parentId, atEpochMs, trueDistances)
      : { x: 0, y: 0, z: 0 };
  } catch {
    return null;
  }
  const line = buildOrbitPath(node, trueDistances, radius, atEpochMs, parentOrbitFrame(nodes, node.id));
  // The physical orbit is around the parent. At true distances its vertices
  // use a local origin to retain close-up GPU precision.
  const origin = trueDistances ? pos : parentPos;
  line.position.set(origin.x, origin.y, origin.z);
  group.add(line);
  return line;
}

/**
 * Builds Three.js objects for every renderable body in the tree (stars and
 * planets/moons — barycentres have orbit paths but no visible body). Belts
 * render as schematic annuli. Clusters have no known angular position and
 * are not drawn as individual points.
 *
 * @param {Map<number|string, object>} nodes Merged tree including belt regions.
 * @param {number} atEpochMs
 * @param {string} systemName Used to strip the redundant system-name prefix off in-scene labels (see naming.js).
 * @param {string} [mode] The active activity mode (see mode-detect.js's MODES) — drives per-mode highlighting (see mode-highlight.js). Defaults to 'exploration', which has no per-body highlight beyond the always-on spotlight treatment.
 * @param {Record<number, string>} [nicknames] bodyId -> nickname (see nicknames.js) — stands in for the designator wherever a body is pinned.
 * @param {object} [options]
 * @param {'compact'|'distances'|'realistic'} [options.scaleMode] Distances and sizes share one linear scale only in realistic mode.
 * @param {string} [options.labelColor] CSS color for ordinary body labels (the active HUD color scheme's accent). Spotlighted/backfill labels keep their own fixed colors.
 * @returns {{ group: THREE.Group, pickables: Map<THREE.Object3D, number>, updatables: Map<number, {bodyGroup: THREE.Group, rings: THREE.Mesh[]}> }}
 *   `updatables` lets updateSystemScene() move bodies as simulated time advances (the warp slider) without a full scene rebuild.
 */
export function buildSystemScene(nodes, atEpochMs, systemName, mode = 'exploration', nicknames = {}, options = {}) {
  const { scaleMode = 'compact', labelColor = '#ff8a2a', labelPixelRatio } = options;
  const { trueDistances, trueSizes } = scaleSettings(scaleMode);
  const group = new THREE.Group();
  const pickables = new Map();
  const updatables = new Map();
  const ringsAddedFor = new Set();

  for (const node of nodes.values()) {
    const orbitOnly = node.kind === 'Barycentre' && node.elements && node.parentId != null;
    const beltOnly = node.kind === 'AsteroidBelt';
    if (!RENDERABLE_KINDS.has(node.kind) && !orbitOnly && !beltOnly) continue;

    // In live play a body can be scanned before its parent is (e.g. a moon
    // mapped before its planet ever got a full Scan), which buildBodyTree
    // reports as an "orphan" — a parentId with no corresponding node. That's
    // an expected transient state mid-session, not a bug: skip the body
    // rather than letting the whole scene fail to render around one hole in
    // the chain. It reappears on its own once the missing parent is scanned.
    let pos;
    try {
      pos = scenePosition(nodes, node.id, atEpochMs, trueDistances);
    } catch (err) {
      console.warn(`orrery: skipping body ${node.id} (${node.name ?? 'unnamed'}) — ${err.message}`);
      continue;
    }
    if (beltOnly) {
      const band = buildAsteroidBelt(nodes, node, trueDistances);
      if (!band) continue;
      const bodyGroup = new THREE.Group();
      bodyGroup.position.set(pos.x, pos.y, pos.z);
      bodyGroup.add(band);
      group.add(bodyGroup);
      updatables.set(node.id, { kind: node.kind, bodyGroup, mesh: null, radius: 0,
        frameRadius: band.userData.outerRadius, label: null, marker: null,
        rings: [], orbit: null, band, parentId: node.parentId });
      continue;
    }
    if (orbitOnly) {
      // A binary pair's shared path belongs to its centre of mass. Keep an
      // empty position anchor for time updates, with no mesh or annotation.
      const bodyGroup = new THREE.Group();
      bodyGroup.position.set(pos.x, pos.y, pos.z);
      const orbit = addOrbitPath(group, nodes, node, pos, trueDistances, 0, atEpochMs);
      updatables.set(node.id, {
        kind: node.kind,
        bodyGroup, mesh: null, radius: 0, label: null, marker: null,
        rings: [], orbit, parentId: node.parentId,
      });
      continue;
    }
    // Unknown physical sizes get a location marker, not an invented radius.
    const realRadius = node.raw?.Radius;
    const radius = trueSizes ? (Number.isFinite(realRadius) && realRadius > 0 ? realRadius / METRES_PER_UNIT : 0)
      : bodyDisplayRadius(node);
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
    if (trueSizes) mesh.userData.minPickPixels = 10;
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
    const label = makeLabel(labelText, finalLabelColor, { pixelRatio:labelPixelRatio });
    label.userData.text = labelText; // stashed for testability — canvas-texture text isn't otherwise inspectable
    label.userData.aspect = label.scale.x / label.scale.y;
    label.position.set(0, 0, radius + 1.1);
    bodyGroup.add(label);
    const labelHint = makeLabel('+',finalLabelColor, { pixelRatio:labelPixelRatio });
    labelHint.userData.text = '+';
    labelHint.userData.aspect = labelHint.scale.x/labelHint.scale.y;
    labelHint.visible = false;
    bodyGroup.add(labelHint);

    group.add(bodyGroup);

    const marker = trueSizes ? makeBodyMarker(labelColor) : null;
    if (marker) bodyGroup.add(marker);
    const updatable = { bodyGroup, mesh, radius, label, labelHint, marker, rings: [], orbit: null, kind: node.kind, parentId: node.parentId ?? null };
    updatables.set(node.id, updatable);

    updatable.orbit = addOrbitPath(group, nodes, node, pos, trueDistances, radius, atEpochMs);

    // Planetary rings retain their filled-band treatment. Journal belt entries
    // become separate AsteroidBelt nodes during the data merge.
    const rawRings = node.raw?.Rings;
    if (Array.isArray(rawRings) && !ringsAddedFor.has(node.id)) {
      ringsAddedFor.add(node.id);
      for (const ring of rawRings) {
        if (isBeltRing(ring)) continue;
        if (!Number.isFinite(ring.InnerRad) || !Number.isFinite(ring.OuterRad)
            || ring.InnerRad < 0 || ring.OuterRad <= ring.InnerRad) continue;
        const innerR = trueSizes ? ring.InnerRad / METRES_PER_UNIT : compressDistance(ring.InnerRad);
        const outerR = trueSizes ? ring.OuterRad / METRES_PER_UNIT : compressDistance(ring.OuterRad);
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
 * @param {{scaleMode?: string}} [options] Must match what the scene was built with.
 */
export function updateSystemScene(nodes, updatables, atEpochMs, options = {}) {
  const { trueDistances } = scaleSettings(options.scaleMode);
  for (const [id, entry] of updatables) {
    let pos;
    try {
      pos = scenePosition(nodes, id, atEpochMs, trueDistances);
    } catch {
      continue;
    }
    entry.bodyGroup.position.set(pos.x, pos.y, pos.z);
    for (const ring of entry.rings) ring.position.set(pos.x, pos.y, pos.z);
    if (entry.orbit) {
      try {
        const parentPos = entry.parentId != null
          ? scenePosition(nodes, entry.parentId, atEpochMs, trueDistances)
          : { x: 0, y: 0, z: 0 };
        const origin = entry.orbit.userData.orbitSamples ? pos : parentPos;
        entry.orbit.position.set(origin.x, origin.y, origin.z);
        updateOrbitPhase(entry.orbit, nodes.get(id), atEpochMs);
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
export function highlightSelectedOrbit(updatables, selectedId, brightness = 1) {
  const intensity = resolveOrbitBrightness(brightness);
  for (const [id, entry] of updatables) {
    if (entry.band) {
      const selected = id === selectedId;
      entry.band.material.color.setHex(selected ? 0xffcf8c : 0xb17b4a);
      entry.band.material.opacity = Math.min(1, (selected ? 0.85 : 0.5) * intensity);
      entry.band.visible = intensity > 0;
    }
    if (!entry.orbit) continue;
    const selected = id === selectedId;
    entry.orbit.material.color.setHex(selected ? 0xa76b32 : 0x7a4a1e);
    // Above the baseline, raise color luminance as well as opacity. Reserve
    // opacity headroom so even a community orbit stands out among journal ones.
    const gain = Math.max(0, (intensity - 1) / 3);
    entry.orbit.material.color.lerp(new THREE.Color(selected ? 0xffdda0 : 0xe6a25a), gain);
    const normalOpacity = Math.min(0.75, entry.orbit.userData.baseOpacity * intensity);
    entry.orbit.material.opacity = selected
      ? Math.min(1, Math.max(normalOpacity, Math.min(0.75, 0.42 * intensity)) + 0.2 * Math.min(1, intensity))
      : normalOpacity;
    entry.orbit.renderOrder = selected ? 1 : 0;
    entry.orbit.visible = intensity > 0;
  }
}
