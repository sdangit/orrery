import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies, absolutePosition } from '../src/index.js';
import { binaryReferenceForChild } from '../src/orbital-frame.js';

const source = JSON.parse(readFileSync(new URL('./fixtures/spansh-timbalderis-orbits.json', import.meta.url)));
const { nodes } = mergeCommunityBodies(new Map(), { spansh: source });

test('Timbalderis circumbinary planets use A’s orbital basis; A, B and C do not', () => {
  for (const id of [2, 3, 4, 1]) assert.equal(binaryReferenceForChild(nodes, nodes.get(id)), null);
  for (const id of [14, 25, 28, 41, 53]) assert.equal(binaryReferenceForChild(nodes, nodes.get(id)).id, 2);
  assert.equal(binaryReferenceForChild(new Map([...nodes].reverse()), nodes.get(14)).id, 2);
  for (const b of source.bodies) {
    const t = Date.parse(b.timestamps?.distanceToArrival);
    if (!Number.isFinite(t) || b.distanceToArrival == null || b.mainStar) continue;
    const p = absolutePosition(nodes, b.bodyId, t), star = absolutePosition(nodes, 2, t);
    const error = Math.abs(Math.hypot(p.x-star.x, p.y-star.y, p.z-star.z) / 299792458 - b.distanceToArrival);
    // Remote C already has ~0.105 ls catalogue residual at ~254,190 ls.
    assert.ok(error < (b.bodyId === 4 ? 0.11 : 0.001), `${b.name}: ${error} ls`);
  }
});

test('binary-frame inference rejects mismatched, ambiguous and unmeasured pairs', () => {
  for (const patch of [{ orbitalPeriodSec: 100 }, { inclinationDeg: 12 },
    { ascendingNodeDeg: 0 }, { periapsisDeg: 0 }, { eccentricity: NaN }]) {
    const changed = new Map(nodes);
    changed.set(3, { ...nodes.get(3), elements: { ...nodes.get(3).elements, ...patch } });
    assert.equal(binaryReferenceForChild(changed, nodes.get(14)), null);
  }
  const ambiguous = new Map(nodes);
  ambiguous.set(99, { ...nodes.get(3), id: 99 });
  assert.equal(binaryReferenceForChild(ambiguous, nodes.get(14)), null);
  const unknown = new Map(nodes);
  unknown.set(3, { ...nodes.get(3), orbitQuality: 'approximate', hasMeasuredOrientation: false });
  assert.equal(binaryReferenceForChild(unknown, nodes.get(14)), null);
});
