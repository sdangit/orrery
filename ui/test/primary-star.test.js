import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primaryStarId } from '../src/primary-star.js';
import { buildBackfillNodes } from '../../shared/src/edsm-backfill.js';

const nodes = (...bodies) => new Map(bodies.map((body) => [body.id, body]));
const star = (id, distance) => ({ id, kind: 'Star', raw: { DistanceFromArrivalLS: distance } });

test('arrival star is independent of scan order and barycentre ID', () => {
  assert.equal(primaryStarId(nodes(star(2, 10000), { id: 0, kind: 'SystemBarycentre' }, star(1, 0))), 1);
  assert.equal(primaryStarId(nodes(star(0, 0))), 0);
});

test('partial or ambiguous star data does not invent a primary', () => {
  assert.equal(primaryStarId(nodes(star(2, 10000))), null);
  assert.equal(primaryStarId(nodes(star(1, undefined))), null);
  assert.equal(primaryStarId(nodes(star(1, 0), star(2, 0))), null);
  assert.equal(primaryStarId(nodes({ id: 1, kind: 'Planet', raw: { DistanceFromArrivalLS: 0 } })), null);
});

test('an explicit main-star marker is preserved through backfill and invalid API IDs are ignored', () => {
  const merged = buildBackfillNodes(nodes({ id: 0, kind: 'SystemBarycentre', parentId: null, elements: null }), [
    { bodyId: null, type: 'Star', name: 'Sol Test Body', isMainStar: true, distanceToArrival: 0 },
    { bodyId: 0, type: 'Star', name: 'Sol', isMainStar: true, parents: null },
  ]);
  assert.equal(primaryStarId(merged), 0);
  assert.equal(primaryStarId(nodes({ ...star(1, 0), isMainStar: false })), null);
  assert.equal(primaryStarId(nodes({ ...star(1, 0), isMainStar: true }, { ...star(2, 0), isMainStar: true })), null);
});
