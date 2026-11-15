// Like orbit-position.js's absolutePosition, but compresses each level's
// offset (via display-scale.js) before summing — so the walk happens in
// display space rather than compressing one giant real-space vector at the
// end, which would wreck relative structure between tightly-spaced bodies.

import { positionInTree } from './orbit-position.js';
import { compressOffset } from './display-scale.js';

/**
 * @param {Map<number, object>} nodes
 * @param {number} bodyId
 * @param {number} atEpochMs
 * @param {object} [scaleOptions] Forwarded to compressOffset (see display-scale.js).
 * @returns {{x:number, y:number, z:number}} Display-unit position.
 */
export function displayPosition(nodes, bodyId, atEpochMs, scaleOptions = {}) {
  return positionInTree(nodes, bodyId, atEpochMs, offset => compressOffset(offset, scaleOptions));
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
