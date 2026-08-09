// Like orbit-position.js's absolutePosition, but compresses each level's
// offset (via display-scale.js) before summing — so the walk happens in
// display space rather than compressing one giant real-space vector at the
// end, which would wreck relative structure between tightly-spaced bodies.

import { keplerianOffset } from './kepler.js';
import { compressOffset } from './display-scale.js';

/**
 * @param {Map<number, object>} nodes
 * @param {number} bodyId
 * @param {number} atEpochMs
 * @param {object} [scaleOptions] Forwarded to compressOffset (see display-scale.js).
 * @returns {{x:number, y:number, z:number}} Display-unit position.
 */
export function displayPosition(nodes, bodyId, atEpochMs, scaleOptions = {}) {
  let x = 0;
  let y = 0;
  let z = 0;
  let currentId = bodyId;
  const visited = new Set();

  while (currentId !== null && currentId !== undefined) {
    if (visited.has(currentId)) {
      throw new Error(`Cycle detected in body tree while resolving display position of body ${bodyId} (at ${currentId})`);
    }
    visited.add(currentId);

    const node = nodes.get(currentId);
    if (!node) {
      throw new Error(`Body tree is missing node ${currentId} while resolving display position of body ${bodyId}`);
    }

    if (node.elements) {
      const realOffset = keplerianOffset(node.elements, atEpochMs);
      const displayOffset = compressOffset(realOffset, scaleOptions);
      x += displayOffset.x;
      y += displayOffset.y;
      z += displayOffset.z;
    }

    currentId = node.parentId;
  }

  return { x, y, z };
}

/**
 * @param {Map<number, object>} nodes
 * @param {number} atEpochMs
 * @param {object} [scaleOptions]
 * @returns {Map<number, {x:number,y:number,z:number}>}
 */
export function displayPositions(nodes, atEpochMs, scaleOptions = {}) {
  const positions = new Map();
  for (const id of nodes.keys()) {
    positions.set(id, displayPosition(nodes, id, atEpochMs, scaleOptions));
  }
  return positions;
}
