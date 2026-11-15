// Elite child elements use the parent's orbital basis followed by its axial
// tilt, not one common system plane. Validated against captured Scan ranges:
// docs/research/vega-parent-frame-results.json and orbital-frame-audit-results.json.
// These local frames do not establish an absolute galactic orientation.
import { eliteOrbitElements } from './elite-orbit.js';
export const IDENTITY_FRAME = Object.freeze([
  Object.freeze([1, 0, 0]), Object.freeze([0, 1, 0]), Object.freeze([0, 0, 1]),
]);

export function transformVector(frame, v) {
  const a = [v.x, v.y, v.z];
  const result = frame.map(row => row.reduce((sum, x, i) => sum + x * a[i], 0));
  return { x: result[0], y: result[1], z: result[2] };
}

export function multiplyFrames(a, b) {
  return a.map(row => b[0].map((_, i) => row.reduce((sum, x, j) => sum + x * b[j][i], 0)));
}

function rotateX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
function rotateZ(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

/** Perifocal basis in the parent's frame, using raw Elite angles. */
export function eliteOrbitalFrame(elements) {
  if (!elements) return IDENTITY_FRAME;
  const e = eliteOrbitElements(elements);
  const d = Math.PI / 180;
  return multiplyFrames(multiplyFrames(rotateZ(e.ascendingNodeDeg * d),
    rotateX(e.inclinationDeg * d)), rotateZ(e.periapsisDeg * d));
}

/** Ordered root-to-body chain, with the same validation for every geometry path. */
export function orbitalChain(nodes, bodyId) {
  const chain = [], visited = new Set();
  for (let id = bodyId; id != null;) {
    if (visited.has(id)) throw new Error(`Cycle detected in body tree while resolving body ${bodyId} (at ${id})`);
    visited.add(id);
    const node = nodes.get(id);
    if (!node) throw new Error(`Body tree is missing node ${id} while resolving body ${bodyId}`);
    if (node.positionIssue) throw new Error(node.positionIssue);
    chain.push(node);
    id = node.parentId;
  }
  return chain.reverse();
}

/** Frame inherited by children; spin phase never rotates their orbital elements. */
export function childOrbitFrame(parentFrame, node) {
  // The unorbiting root's tilt is only a common rigid rotation. Define system
  // axes before that rotation, preserving the existing main-planet view.
  if (node.parentId == null && !node.elements) return parentFrame;
  const tilt = Number.isFinite(node.raw?.AxialTilt) ? node.raw.AxialTilt : 0;
  // Negate axial tilt as well as inclination: F R F with F=diag(1,1,-1).
  // Flipping inclination alone would deform nested geometry, not reflect it.
  return multiplyFrames(multiplyFrames(parentFrame, eliteOrbitalFrame(node.elements)), rotateX(-tilt));
}

/** Find a uniquely measured stellar binary defining a group's inner plane.
 * Circumbinary children use the first component's orbital basis, while the
 * binary components themselves retain the enclosing group's frame. Body IDs
 * order the primary/secondary components in Elite's hierarchy, not map order.
 */
export function binaryReferenceForChild(nodes, node) {
  const parent = nodes.get(node.parentId);
  if (!['Barycentre', 'SystemBarycentre'].includes(parent?.kind)) return null;
  const siblings = [...nodes.values()].filter(n => n.parentId === parent.id && n.elements
    && !n.positionIssue && (n.orbitQuality !== 'approximate' || n.hasMeasuredOrientation)
    && ['Star', 'Barycentre'].includes(n.kind)).sort((a, b) => a.id - b.id);
  const nearAngle = (a, b, target = 0) => Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(Math.abs(((a - b + 180) % 360 + 360) % 360 - 180) - target) < 0.001;
  const pairs = [];
  for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) {
    const a = siblings[i], b = siblings[j], x = a.elements, y = b.elements;
    if (a.kind !== 'Star' && b.kind !== 'Star') continue;
    if (!Number.isFinite(x.orbitalPeriodSec) || !Number.isFinite(y.orbitalPeriodSec)
        || x.orbitalPeriodSec === 0 || y.orbitalPeriodSec === 0) continue;
    if (Math.abs(x.orbitalPeriodSec - y.orbitalPeriodSec) > Math.abs(x.orbitalPeriodSec) * 1e-6
        || !Number.isFinite(x.eccentricity) || !Number.isFinite(y.eccentricity)
        || Math.abs(x.eccentricity - y.eccentricity) > 1e-5
        || !nearAngle(x.inclinationDeg, y.inclinationDeg)
        || !nearAngle(x.ascendingNodeDeg, y.ascendingNodeDeg)
        || !nearAngle(x.periapsisDeg, y.periapsisDeg, 180)) continue;
    pairs.push([a, b]);
  }
  if (pairs.length !== 1 || pairs[0].some(n => n.id === node.id)) return null;
  return pairs[0][0];
}

export function orbitParentFrame(nodes, node, inheritedFrame) {
  const reference = binaryReferenceForChild(nodes, node);
  // The binary orbital plane, not either star's spin-equator or phase.
  return reference ? multiplyFrames(inheritedFrame, eliteOrbitalFrame(reference.elements)) : inheritedFrame;
}

/** Converts a body's parent-relative offset into system axes (no translation). */
export function parentOrbitFrame(nodes, bodyId) {
  const chain = orbitalChain(nodes, bodyId);
  let frame = IDENTITY_FRAME;
  for (let i = 0; i < chain.length; i++) {
    frame = orbitParentFrame(nodes, chain[i], frame);
    if (i < chain.length - 1) frame = childOrbitFrame(frame, chain[i]);
  }
  return frame;
}
