import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absolutePosition, absolutePositions } from '../src/orbit-position.js';
import { keplerianOffset } from '../src/kepler.js';
import { buildSyntheticTree } from './helpers/synthetic-tree.js';

// Star-scale offsets here run up to ~1e12-1e13 metres, so a fixed absolute
// tolerance is tighter than double-precision summation can guarantee once a
// few Kepler solves get added together in a different order. Compare with a
// tolerance relative to magnitude instead.
function assertClose(actual, expected, message) {
  const scale = Math.max(Math.abs(expected), 1);
  assert.ok(
    Math.abs(actual - expected) < scale * 1e-9,
    `${message}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`,
  );
}

test('the root sits at the origin', () => {
  const nodes = buildSyntheticTree();
  const pos = absolutePosition(nodes, 0, 12345);
  assert.equal(pos.x, 0);
  assert.equal(pos.y, 0);
  assert.equal(pos.z, 0);
});

test('a body orbiting the root directly equals its own keplerianOffset', () => {
  const nodes = buildSyntheticTree();
  const now = 12345;
  const expected = keplerianOffset(nodes.get(1).elements, now);
  const actual = absolutePosition(nodes, 1, now);
  assert.equal(actual.x, expected.x);
  assert.equal(actual.y, expected.y);
  assert.equal(actual.z, expected.z);
});

test('a moon-of-a-moon position sums every level (star -> planet -> moon)', () => {
  const nodes = buildSyntheticTree();
  const now = 6789;
  const o1 = keplerianOffset(nodes.get(1).elements, now);
  const o2 = keplerianOffset(nodes.get(2).elements, now);
  const o3 = keplerianOffset(nodes.get(3).elements, now);
  const expected = { x: o1.x + o2.x + o3.x, y: o1.y + o2.y + o3.y, z: o1.z + o2.z + o3.z };
  const actual = absolutePosition(nodes, 3, now);
  assertClose(actual.x, expected.x, 'x');
  assertClose(actual.y, expected.y, 'y');
  assertClose(actual.z, expected.z, 'z');
});

test('a barycentre-hosted moon pair includes the barycentre\'s own offset', () => {
  const nodes = buildSyntheticTree();
  const now = 999;
  const o1 = keplerianOffset(nodes.get(1).elements, now);
  const o2 = keplerianOffset(nodes.get(2).elements, now);
  const o5 = keplerianOffset(nodes.get(5).elements, now);
  const o6 = keplerianOffset(nodes.get(6).elements, now);
  const expected = {
    x: o1.x + o2.x + o5.x + o6.x,
    y: o1.y + o2.y + o5.y + o6.y,
    z: o1.z + o2.z + o5.z + o6.z,
  };
  const actual = absolutePosition(nodes, 6, now);
  assertClose(actual.x, expected.x, 'x');
  assertClose(actual.y, expected.y, 'y');
  assertClose(actual.z, expected.z, 'z');
});

test('an elements-less body (e.g. a belt cluster) sits exactly at its parent\'s position', () => {
  const nodes = buildSyntheticTree();
  const now = 42;
  const starPos = absolutePosition(nodes, 1, now);
  const clusterPos = absolutePosition(nodes, 4, now);
  assert.equal(starPos.x, clusterPos.x);
  assert.equal(starPos.y, clusterPos.y);
  assert.equal(starPos.z, clusterPos.z);
});

test('absolutePositions computes a position for every node in the tree', () => {
  const nodes = buildSyntheticTree();
  const positions = absolutePositions(nodes, Date.now());
  assert.equal(positions.size, nodes.size);
  for (const id of nodes.keys()) assert.ok(positions.has(id));
});

test('absolutePosition throws on a cycle rather than looping forever', () => {
  const cyclicNodes = new Map([
    [1, { id: 1, parentId: 2, elements: null }],
    [2, { id: 2, parentId: 1, elements: null }],
  ]);
  assert.throws(() => absolutePosition(cyclicNodes, 1, Date.now()), /Cycle detected/);
});

test('absolutePosition throws with a clear message when a parent id is missing', () => {
  const brokenNodes = new Map([[1, { id: 1, parentId: 999, elements: null }]]);
  assert.throws(() => absolutePosition(brokenNodes, 1, Date.now()), /missing node 999/);
});
