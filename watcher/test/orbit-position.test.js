import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJournalLines } from '../src/journal-parser.js';
import { buildBodyTree } from '../src/body-tree.js';
import { absolutePosition, absolutePositions } from '../src/orbit-position.js';
import { keplerianOffset } from '../src/kepler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleText = readFileSync(join(__dirname, 'fixtures', 'sample-journal.log'), 'utf8');
const sampleEvents = parseJournalLines(sampleText);
const tree = buildBodyTree(sampleEvents, { systemAddress: 5064706368953, systemName: 'Col 285 Sector TI-U b18-2' });

// Coordinates here run up to ~1e12-1e13 metres, so a fixed absolute tolerance
// like 1e-6 is tighter than double-precision summation can guarantee once a
// few Kepler solves get added together. Compare with a tolerance relative to
// magnitude instead (1 part in 1e9 — still sub-metre precision at these scales).
function assertClose(actual, expected, message) {
  const scale = Math.max(Math.abs(expected), 1);
  assert.ok(
    Math.abs(actual - expected) < scale * 1e-9,
    `${message}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`,
  );
}

test('the root sits at the origin', () => {
  const pos = absolutePosition(tree.nodes, tree.rootId, Date.now());
  assert.equal(pos.x, 0);
  assert.equal(pos.y, 0);
  assert.equal(pos.z, 0);
});

test('a star orbiting the root directly equals its own keplerianOffset', () => {
  const now = Date.now();
  const star = tree.nodes.get(1);
  const expected = keplerianOffset(star.elements, now);
  const actual = absolutePosition(tree.nodes, 1, now);
  assertClose(actual.x, expected.x, 'x');
  assertClose(actual.y, expected.y, 'y');
  assertClose(actual.z, expected.z, 'z');
});

test('a moon-of-a-moon position is the sum of every level\'s offset (star -> planet -> planet -> moon)', () => {
  const now = Date.now();
  // 48 "A 12 e a" -> 47 "A 12 e" -> 39 "A 12" -> 1 (star) -> root
  const star = tree.nodes.get(1);
  const p39 = tree.nodes.get(39);
  const p47 = tree.nodes.get(47);
  const moon48 = tree.nodes.get(48);

  const oStar = keplerianOffset(star.elements, now);
  const o39 = keplerianOffset(p39.elements, now);
  const o47 = keplerianOffset(p47.elements, now);
  const o48 = keplerianOffset(moon48.elements, now);

  const expected = {
    x: oStar.x + o39.x + o47.x + o48.x,
    y: oStar.y + o39.y + o47.y + o48.y,
    z: oStar.z + o39.z + o47.z + o48.z,
  };
  const actual = absolutePosition(tree.nodes, 48, now);
  assertClose(actual.x, expected.x, 'x');
  assertClose(actual.y, expected.y, 'y');
  assertClose(actual.z, expected.z, 'z');
});

test('a barycentre-hosted moon pair includes the barycentre\'s own offset', () => {
  const now = Date.now();
  // 64 "A 14 a" -> 63 (barycentre) -> 62 "A 14" -> 1 (star) -> root
  const star = tree.nodes.get(1);
  const p62 = tree.nodes.get(62);
  const bary63 = tree.nodes.get(63);
  const moon64 = tree.nodes.get(64);

  const oStar = keplerianOffset(star.elements, now);
  const o62 = keplerianOffset(p62.elements, now);
  const oBary = keplerianOffset(bary63.elements, now);
  const o64 = keplerianOffset(moon64.elements, now);

  const expected = {
    x: oStar.x + o62.x + oBary.x + o64.x,
    y: oStar.y + o62.y + oBary.y + o64.y,
    z: oStar.z + o62.z + oBary.z + o64.z,
  };
  const actual = absolutePosition(tree.nodes, 64, now);
  assertClose(actual.x, expected.x, 'x');
  assertClose(actual.y, expected.y, 'y');
  assertClose(actual.z, expected.z, 'z');
});

test('a belt cluster (no elements) sits exactly at its star\'s position', () => {
  const now = Date.now();
  const starPos = absolutePosition(tree.nodes, 1, now);
  const clusterPos = absolutePosition(tree.nodes, 4, now); // belt cluster, parent is star 1
  assert.equal(starPos.x, clusterPos.x);
  assert.equal(starPos.y, clusterPos.y);
  assert.equal(starPos.z, clusterPos.z);
});

test('absolutePositions computes a position for every node in the tree', () => {
  const now = Date.now();
  const positions = absolutePositions(tree.nodes, now);
  assert.equal(positions.size, tree.nodes.size);
  for (const id of tree.nodes.keys()) {
    assert.ok(positions.has(id));
  }
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
