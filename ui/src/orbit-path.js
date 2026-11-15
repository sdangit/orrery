import * as THREE from 'three';
import { compressOffset, eliteKeplerianOffset, IDENTITY_FRAME, transformVector } from '@orrery/shared';
import { METRES_PER_UNIT } from './scale-modes.js';

const SAMPLES = 96;
const LOCAL_LEVELS = 36;
const MAX_VERTICES = SAMPLES + 2 + LOCAL_LEVELS * 2;

/** Coarse full orbit, with smoothly moving local detail at true distances. */
export function buildOrbitPath(node, trueDistances, radius, atEpochMs, parentFrame = IDENTITY_FRAME) {
  if (!node.elements) return null;
  const periodMs = node.elements.orbitalPeriodSec * 1000;
  const points = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const offset = transformVector(parentFrame, eliteKeplerianOffset(node.elements, node.elements.epochMs + (i / SAMPLES) * periodMs));
    const p = trueDistances
      ? { x: offset.x / METRES_PER_UNIT, y: offset.y / METRES_PER_UNIT, z: offset.z / METRES_PER_UNIT }
      : compressOffset(offset);
    points.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const geometry = trueDistances
    ? new THREE.BufferGeometry().setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(MAX_VERTICES * 3), 3).setUsage(THREE.DynamicDrawUsage))
    : new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry,
    new THREE.LineBasicMaterial({ color: 0x7a4a1e, transparent: true, depthWrite: false, opacity: node.isBackfill ? 0.25 : 0.42 }));
  line.userData.baseOpacity = line.material.opacity;
  line.userData.orbitBodyId = node.id;
  line.userData.parentOrbitFrame = parentFrame;
  if (trueDistances) {
    // Retain precision until after subtracting the body's current offset.
    line.userData.orbitSamples = new Float64Array(points.flatMap((p) => p.toArray()));
    line.userData.orbitRadius = radius;
    updateOrbitPhase(line, node, atEpochMs);
  }
  return line;
}

/**
 * A single exact body vertex in a coarse polygon fixes attachment but its two
 * chords pivot abruptly at each coarse sample. Surround it with geometrically
 * spaced samples that move with the body, resolving the curve at body scale.
 * Keep the rest of the ellipse and a bounded, reusable GPU buffer. This also
 * avoids long Float32 segments crossing a very small close-up viewport.
 */
export function updateOrbitPhase(line, node, atEpochMs) {
  const samples = line.userData.orbitSamples;
  if (!samples) return;
  const periodMs = node.elements.orbitalPeriodSec * 1000;
  const turns = (atEpochMs - node.elements.epochMs) / periodMs;
  const wrap = (phase) => ((phase % 1) + 1) % 1;
  const phase = wrap(turns);
  const frame = line.userData.parentOrbitFrame;
  const point = transformVector(frame, eliteKeplerianOffset(node.elements, atEpochMs));
  const offset = [point.x / METRES_PER_UNIT, point.y / METRES_PER_UNIT, point.z / METRES_PER_UNIT];
  const knots = [];
  for (let i = 0; i <= SAMPLES; i++) {
    knots.push({ phase: i / SAMPLES,
      x: samples[i * 3] - offset[0], y: samples[i * 3 + 1] - offset[1], z: samples[i * 3 + 2] - offset[2] });
  }
  knots.push({ phase, x: 0, y: 0, z: 0 });
  const orbitSize = node.elements.semiMajorAxis / METRES_PER_UNIT;
  // Start within a quarter body radius on a circular orbit. The lower bound
  // also gives unknown radii useful detail without inventing a visible size.
  let step = Math.min(1 / SAMPLES, Math.max(1e-12,
    line.userData.orbitRadius / (2 * Math.PI * orbitSize) * 0.25));
  for (let level = 0; level < LOCAL_LEVELS; level++) {
    for (const direction of [-1, 1]) {
      const delta = step * direction;
      const local = transformVector(frame, eliteKeplerianOffset(node.elements, atEpochMs + delta * periodMs));
      knots.push({ phase: wrap(phase + delta),
        x: local.x / METRES_PER_UNIT - offset[0],
        y: local.y / METRES_PER_UNIT - offset[1],
        z: local.z / METRES_PER_UNIT - offset[2] });
    }
    if (step >= 1 / SAMPLES) break;
    step = Math.min(1 / SAMPLES, step * 2);
  }
  knots.sort((a, b) => a.phase - b.phase);
  const attribute = line.geometry.attributes.position;
  for (let i = 0; i < knots.length; i++) {
    const { x, y, z } = knots[i];
    attribute.setXYZ(i, x, y, z);
  }
  // Unused capacity must not retain stale positions in the bounding sphere.
  const last = knots.at(-1);
  for (let i = knots.length; i < attribute.count; i++) attribute.setXYZ(i, last.x, last.y, last.z);
  line.geometry.setDrawRange(0, knots.length);
  attribute.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}
