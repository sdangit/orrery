// Walks a body tree's Parents chain to turn each node's own Keplerian
// elements (which are relative to its immediate parent) into an absolute
// position in the system's reference frame — step 5 from the design brief's
// orbital rendering math.
//
// Nodes with no elements (the root, and belt clusters, which the game never
// gives orbital elements for) contribute a zero offset: they sit exactly at
// their parent's position.

import { eliteKeplerianOffset } from './elite-orbit.js';
import { orbitalChain, IDENTITY_FRAME, childOrbitFrame, orbitParentFrame, transformVector } from './orbital-frame.js';

/**
 * @param {Map<number, object>} nodes Output of buildBodyTree().nodes
 * @param {number} bodyId
 * @param {number} atEpochMs
 * @returns {{x:number, y:number, z:number}} Absolute position, metres, system-frame.
 */
export function absolutePosition(nodes, bodyId, atEpochMs) {
  return positionInTree(nodes, bodyId, atEpochMs);
}

/** Shared hierarchy walk; display scaling is applied to each local offset. */
export function positionInTree(nodes, bodyId, atEpochMs, scaleOffset = v => v) {
  const position = { x: 0, y: 0, z: 0 };
  let frame = IDENTITY_FRAME;
  const chain = orbitalChain(nodes, bodyId);
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    frame = orbitParentFrame(nodes, node, frame);
    if (node.elements) {
      const offset = transformVector(frame, scaleOffset(eliteKeplerianOffset(node.elements, atEpochMs)));
      position.x += offset.x;
      position.y += offset.y;
      position.z += offset.z;
    }
    if (i < chain.length - 1) frame = childOrbitFrame(frame, node);
  }
  return position;
}

/**
 * Computes absolute positions for every node in the tree at once.
 * @param {Map<number, object>} nodes
 * @param {number} atEpochMs
 * @returns {Map<number, {x:number,y:number,z:number}>}
 */
export function absolutePositions(nodes, atEpochMs) {
  const positions = new Map();
  for (const id of nodes.keys()) {
    positions.set(id, absolutePosition(nodes, id, atEpochMs));
  }
  return positions;
}
