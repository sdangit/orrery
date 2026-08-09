import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayPosition, displayPositions } from '../src/display-position.js';
import { keplerianOffset } from '../src/kepler.js';
import { compressOffset } from '../src/display-scale.js';
import { buildSyntheticTree } from './helpers/synthetic-tree.js';

test('the root sits at the origin', () => {
  const nodes = buildSyntheticTree();
  const pos = displayPosition(nodes, 0, 12345);
  assert.deepEqual(pos, { x: 0, y: 0, z: 0 });
});

test('a body orbiting the root directly equals its own compressed offset', () => {
  const nodes = buildSyntheticTree();
  const now = 12345;
  const expected = compressOffset(keplerianOffset(nodes.get(1).elements, now));
  const actual = displayPosition(nodes, 1, now);
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
  assert.ok(Math.abs(actual.z - expected.z) < 1e-9);
});

test('each level is compressed before summing, not summed then compressed', () => {
  const nodes = buildSyntheticTree();
  const now = 6789;
  // Correct: compress(offset1) + compress(offset2) + compress(offset3)
  const o1 = compressOffset(keplerianOffset(nodes.get(1).elements, now));
  const o2 = compressOffset(keplerianOffset(nodes.get(2).elements, now));
  const o3 = compressOffset(keplerianOffset(nodes.get(3).elements, now));
  const perLevelExpected = { x: o1.x + o2.x + o3.x, y: o1.y + o2.y + o3.y, z: o1.z + o2.z + o3.z };

  // Wrong (what this test guards against): sum real offsets, then compress once.
  const r1 = keplerianOffset(nodes.get(1).elements, now);
  const r2 = keplerianOffset(nodes.get(2).elements, now);
  const r3 = keplerianOffset(nodes.get(3).elements, now);
  const summedThenCompressed = compressOffset({ x: r1.x + r2.x + r3.x, y: r1.y + r2.y + r3.y, z: r1.z + r2.z + r3.z });

  const actual = displayPosition(nodes, 3, now);
  assert.ok(Math.abs(actual.x - perLevelExpected.x) < 1e-9);
  assert.ok(Math.abs(actual.x - summedThenCompressed.x) > 1e-6, 'should not match the summed-then-compressed (wrong) approach');
});

test('a tightly-orbiting moon around a far-out planet is still clearly separated from its parent on screen', () => {
  // This is the actual problem compression exists to solve: without it, a moon
  // 1.5e6 m from a planet that's itself 4e9 m + 5e12 m out from the root would
  // round to "the same point" in any reasonable-precision render.
  const nodes = buildSyntheticTree();
  const now = 999;
  const planetPos = displayPosition(nodes, 2, now);
  const barycentrePos = displayPosition(nodes, 5, now);
  const separation = Math.hypot(
    planetPos.x - barycentrePos.x,
    planetPos.y - barycentrePos.y,
    planetPos.z - barycentrePos.z,
  );
  assert.ok(separation > 0.5, `expected a visually-separable gap, got ${separation} display units`);
});

test('an elements-less body sits exactly at its parent\'s display position', () => {
  const nodes = buildSyntheticTree();
  const now = 42;
  const starPos = displayPosition(nodes, 1, now);
  const clusterPos = displayPosition(nodes, 4, now);
  assert.deepEqual(clusterPos, starPos);
});

test('displayPositions computes a position for every node in the tree', () => {
  const nodes = buildSyntheticTree();
  const positions = displayPositions(nodes, Date.now());
  assert.equal(positions.size, nodes.size);
});

test('displayPosition throws on a cycle rather than looping forever', () => {
  const cyclicNodes = new Map([
    [1, { id: 1, parentId: 2, elements: null }],
    [2, { id: 2, parentId: 1, elements: null }],
  ]);
  assert.throws(() => displayPosition(cyclicNodes, 1, Date.now()), /Cycle detected/);
});
