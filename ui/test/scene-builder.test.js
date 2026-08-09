import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { buildSystemScene } from '../src/scene-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoSystem = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', 'demo-system.json'), 'utf8'));
const nodes = new Map(demoSystem.nodes.map((node) => [node.id, node]));

test('buildSystemScene runs against the real bundled demo data without throwing', () => {
  assert.doesNotThrow(() => buildSystemScene(nodes, Date.now(), demoSystem.systemName));
});

test('every renderable body (stars + planets) gets exactly one pickable mesh', () => {
  const { pickables } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const renderableCount = [...nodes.values()].filter((n) => n.kind === 'Star' || n.kind === 'Planet').length;
  assert.equal(pickables.size, renderableCount);
});

test('every pickable mesh maps back to a real node id', () => {
  const { pickables } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  for (const nodeId of pickables.values()) {
    assert.ok(nodes.has(nodeId), `pickable pointed at missing node ${nodeId}`);
  }
});

test('no mesh sits at a NaN or infinite position', () => {
  const { group } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Group)) return;
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Number.isFinite(obj.position[axis]), `${obj.type} has non-finite ${axis}: ${obj.position[axis]}`);
    }
  });
});

test('the star (id 1) gets a mesh with a positive display radius', () => {
  const { pickables } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const starMesh = [...pickables.entries()].find(([, id]) => id === 1)?.[0];
  assert.ok(starMesh, 'expected a pickable mesh for body 1');
  assert.ok(starMesh.geometry.parameters.radius > 0);
});

test('the star\'s ring (real Rings data on body 1) produces a ring mesh in the scene', () => {
  const { group } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const ringMeshes = [];
  group.traverse((obj) => {
    if (obj.geometry instanceof THREE.RingGeometry) ringMeshes.push(obj);
  });
  // Body 1 has one Rings entry in the fixture; landable-marker rings also use
  // RingGeometry, so just assert at least one ring mesh exists rather than an exact count.
  assert.ok(ringMeshes.length > 0, 'expected at least one ring mesh from real Rings data');
});

test('body labels are shortened to their designator, not the full system-qualified name', () => {
  const { group } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const labelTexts = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Sprite) labelTexts.push(obj.userData.text);
  });
  assert.ok(labelTexts.length > 0, 'expected at least one label sprite');
  for (const text of labelTexts) {
    assert.ok(!text.startsWith(demoSystem.systemName), `label "${text}" still carries the full system-name prefix`);
  }
  // The primary star's designator specifically should just be "A".
  assert.ok(labelTexts.includes('A'), 'expected the primary star\'s label to be shortened to "A"');
});

test('a body with an unresolvable parent chain (an "orphan", possible mid-session live data) is skipped, not a crash', () => {
  // Simulates scanning a moon before its planet has ever been scanned — a real
  // possibility in live play, per buildBodyTree's `orphans` reporting.
  const orphanNodes = new Map(nodes);
  orphanNodes.set(9001, {
    id: 9001,
    name: 'Orphan Moon',
    kind: 'Planet',
    parentId: 9002, // never scanned — no node 9002 exists
    elements: { semiMajorAxis: 1e6, eccentricity: 0, inclinationDeg: 0, periapsisDeg: 0, ascendingNodeDeg: 0, meanAnomalyDeg: 0, orbitalPeriodSec: 1000, epochMs: 0 },
    raw: { Radius: 500000 },
    children: [],
  });

  let result;
  assert.doesNotThrow(() => { result = buildSystemScene(orphanNodes, Date.now(), demoSystem.systemName); });
  for (const nodeId of result.pickables.values()) {
    assert.notEqual(nodeId, 9001, 'the orphaned body should have been skipped, not rendered');
  }
});

test('belt clusters (no independent position data) do not get their own pickable mesh', () => {
  const { pickables } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const beltClusterIds = [...nodes.values()].filter((n) => n.kind === 'BeltCluster').map((n) => n.id);
  for (const id of pickables.values()) {
    assert.ok(!beltClusterIds.includes(id), `belt cluster ${id} unexpectedly got a pickable mesh`);
  }
});
