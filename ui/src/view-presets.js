import * as THREE from 'three';
import { eliteOrbitalFrame, parentOrbitFrame, multiplyFrames, IDENTITY_FRAME } from '@orrery/shared';

export const DEFAULT_DIRECTION = new THREE.Vector3(0.57, -0.71, 0.41).normalize();
export const SYSTEM_FRAME = {
  x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
};

// Include ancestor orientations, but not the selected body's own axial tilt:
// that tilt defines its children's reference plane, not its own orbit plane.
export function orbitFrame(node, nodes) {
  const raw = node?.elements;
  if (!raw || !['inclinationDeg', 'ascendingNodeDeg', 'periapsisDeg'].every(k => Number.isFinite(raw[k]))) return null;
  try {
    const basis = multiplyFrames(nodes ? parentOrbitFrame(nodes, node.id) : IDENTITY_FRAME, eliteOrbitalFrame(raw));
    return Object.fromEntries(['x', 'y', 'z'].map((key, i) =>
      [key, new THREE.Vector3(basis[0][i], basis[1][i], basis[2][i])]));
  } catch { return null; }
}

export function viewOrientation(preset, frame = SYSTEM_FRAME) {
  const { x, y, z } = frame;
  if (preset === 'top') return { direction: z.clone(), up: y.clone() };
  if (preset === 'front') return { direction: y.clone().negate(), up: z.clone() };
  if (preset === 'side') return { direction: x.clone(), up: z.clone() };
  if (preset === 'angled') return {
    direction: x.clone().multiplyScalar(DEFAULT_DIRECTION.x)
      .addScaledVector(y, DEFAULT_DIRECTION.y).addScaledVector(z, DEFAULT_DIRECTION.z), up: z.clone(),
  };
  throw new Error(`Unknown view preset: ${preset}`);
}
