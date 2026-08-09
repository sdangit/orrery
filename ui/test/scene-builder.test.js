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
  // The primary star's designator specifically should just be "A" (plus its icon prefix).
  assert.ok(labelTexts.includes('✦ A'), 'expected the primary star\'s label to be shortened to "A" with its star icon');
});

test('body labels are prefixed with the per-kind icon (star vs landable/non-landable planet)', () => {
  const { group } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const labelTexts = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Sprite) labelTexts.push(obj.userData.text);
  });
  assert.ok(labelTexts.some((t) => t.startsWith('✦ ')), 'expected at least one star-icon label');
  assert.ok(
    labelTexts.some((t) => t.startsWith('○ ') || t.startsWith('◉ ')),
    'expected at least one planet-icon label',
  );
});

test('a pinned nickname overrides the label\'s designator, but the icon prefix stays', () => {
  const { group } = buildSystemScene(nodes, Date.now(), demoSystem.systemName, 'exploration', { 1: 'money star' });
  const labelTexts = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Sprite) labelTexts.push(obj.userData.text);
  });
  assert.ok(labelTexts.includes('✦ money star'), 'expected the nicknamed star\'s label to show the nickname, not "A"');
  assert.ok(!labelTexts.includes('✦ A'), 'the plain designator should no longer appear once nicknamed');
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

test('exobiology mode gives a bio-signal body a green halo; other modes do not', () => {
  const bioNodes = new Map(nodes);
  bioNodes.set(13, { ...nodes.get(13), bio: { signalCount: 2, genuses: [], samples: [] } }); // real body "A 1"

  const findHalos = (group, color) => {
    const halos = [];
    group.traverse((obj) => {
      if (obj.geometry instanceof THREE.SphereGeometry && obj.material?.color?.getHex() === color) halos.push(obj);
    });
    return halos;
  };

  const exploration = buildSystemScene(bioNodes, Date.now(), demoSystem.systemName, 'exploration');
  const exobiology = buildSystemScene(bioNodes, Date.now(), demoSystem.systemName, 'exobiology');

  assert.equal(findHalos(exploration.group, 0x6bffb3).length, 0, 'no bio halo outside exobiology mode');
  assert.equal(findHalos(exobiology.group, 0x6bffb3).length, 1, 'expected exactly one bio halo in exobiology mode');
});

test('a fully-sampled body gets a brighter bio halo than one still in progress', () => {
  const inProgressNodes = new Map(nodes);
  inProgressNodes.set(13, { ...nodes.get(13), bio: { signalCount: 1, genuses: [], samples: [{ genus: 'Tubus', species: 'Tubus Conifer', scansLogged: 1, complete: false }] } });

  const completeNodes = new Map(nodes);
  completeNodes.set(13, { ...nodes.get(13), bio: { signalCount: 1, genuses: [], samples: [{ genus: 'Tubus', species: 'Tubus Conifer', scansLogged: 3, complete: true }] } });

  const findHaloOpacity = (group) => {
    let opacity = null;
    group.traverse((obj) => {
      if (obj.material?.color?.getHex() === 0x6bffb3) opacity = obj.material.opacity;
    });
    return opacity;
  };

  const inProgress = buildSystemScene(inProgressNodes, Date.now(), demoSystem.systemName, 'exobiology');
  const complete = buildSystemScene(completeNodes, Date.now(), demoSystem.systemName, 'exobiology');
  assert.ok(findHaloOpacity(complete.group) > findHaloOpacity(inProgress.group));
});

test('mining mode boosts a real Pristine-reserve ring\'s opacity and color; exploration mode does not', () => {
  // Body 39 ("A 12") has a real Rings entry with ReserveLevel:"PristineResources" in the fixture.
  const findRing39 = (group) => {
    const rings = [];
    group.traverse((obj) => {
      if (obj.geometry instanceof THREE.RingGeometry && obj.userData.bodyId === 39) rings.push(obj);
    });
    return rings;
  };

  const exploration = buildSystemScene(nodes, Date.now(), demoSystem.systemName, 'exploration');
  const mining = buildSystemScene(nodes, Date.now(), demoSystem.systemName, 'mining');

  const explorationRing = findRing39(exploration.group)[0];
  const miningRing = findRing39(mining.group)[0];
  assert.ok(explorationRing, 'expected a ring mesh for body 39 in exploration mode');
  assert.ok(miningRing, 'expected a ring mesh for body 39 in mining mode');

  assert.equal(explorationRing.material.opacity, 0.35, 'exploration mode should use the baseline ring opacity');
  assert.equal(miningRing.material.opacity, 0.65, 'mining mode should boost opacity for a Pristine-reserve ring');
  assert.equal(miningRing.material.color.getHex(), 0xffd24d, 'mining mode should color a Pristine ring amber');
});

test('belt clusters (no independent position data) do not get their own pickable mesh', () => {
  const { pickables } = buildSystemScene(nodes, Date.now(), demoSystem.systemName);
  const beltClusterIds = [...nodes.values()].filter((n) => n.kind === 'BeltCluster').map((n) => n.id);
  for (const id of pickables.values()) {
    assert.ok(!beltClusterIds.includes(id), `belt cluster ${id} unexpectedly got a pickable mesh`);
  }
});
