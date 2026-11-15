// Historical positive-angle, common-frame baseline preserved for research replay.
// Frozen from commit 8f95d28f9303d045755ade36c6e0c8e9d9d3bcbd before the Elite angle fix.
// Do not import this module into application code.
// Walks a body tree's Parents chain to turn each node's own Keplerian
// elements (which are relative to its immediate parent) into an absolute
// position in the system's reference frame — step 5 from the design brief's
// orbital rendering math.
//
// Nodes with no elements (the root, and belt clusters, which the game never
// gives orbital elements for) contribute a zero offset: they sit exactly at
// their parent's position.

import { keplerianOffset } from '../../shared/src/kepler.js';

/**
 * @param {Map<number, object>} nodes Output of buildBodyTree().nodes
 * @param {number} bodyId
 * @param {number} atEpochMs
 * @returns {{x:number, y:number, z:number}} Absolute position, metres, system-frame.
 */
export function absolutePosition(nodes, bodyId, atEpochMs) {
  let x = 0;
  let y = 0;
  let z = 0;
  let currentId = bodyId;
  const visited = new Set();

  while (currentId !== null && currentId !== undefined) {
    if (visited.has(currentId)) {
      throw new Error(`Cycle detected in body tree while resolving position of body ${bodyId} (at ${currentId})`);
    }
    visited.add(currentId);

    const node = nodes.get(currentId);
    if (!node) {
      throw new Error(`Body tree is missing node ${currentId} while resolving position of body ${bodyId}`);
    }

    if (node.positionIssue) throw new Error(node.positionIssue);

    if (node.elements) {
      const offset = keplerianOffset(node.elements, atEpochMs);
      x += offset.x;
      y += offset.y;
      z += offset.z;
    }

    currentId = node.parentId;
  }

  return { x, y, z };
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
