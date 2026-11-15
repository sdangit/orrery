import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildSystemScene, updateSystemScene, scenePosition, highlightSelectedOrbit, disposeSystemScene } from '../src/scene-builder.js';
import { updateBodyAnnotations } from '../src/body-markers.js';

// Reduced live journal snapshot: Nusakan 2 and 3 share barycentre BodyID 2.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/nusakan-orbital-group.json', import.meta.url)));
const epoch = fixture.nodes.find(n => n.id === 2).elements.epochMs;

for (const scaleMode of ['compact', 'distances', 'realistic']) {
  test(`${scaleMode}: renders the shared Nusakan orbit without inventing a body`, () => {
    const nodes = new Map(fixture.nodes.map(n => [n.id, n]));
    const { group, pickables, updatables } = buildSystemScene(nodes, epoch, fixture.systemName, 'exploration', {}, { scaleMode });
    const paths = group.children.filter(obj => obj.userData.orbitBodyId !== undefined);
    assert.deepEqual(paths.map(p => p.userData.orbitBodyId).sort(), [2, 3, 4]);
    assert.deepEqual([...pickables.values()].sort(), [0, 3, 4]);
    const shared = updatables.get(2);
    assert.equal(shared.bodyGroup.children.length, 0, 'barycentre has no visible body, marker or label');
    assert.equal(shared.radius, 0);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1e6);
    camera.position.z = 1000;
    assert.doesNotThrow(() => updateBodyAnnotations(updatables, camera, 800));
    highlightSelectedOrbit(updatables, null, 0);
    assert.equal(shared.orbit.visible, false);
    highlightSelectedOrbit(updatables, null, 1);
    assert.equal(shared.orbit.visible, true);
    let disposed = false;
    shared.orbit.geometry.addEventListener('dispose', () => { disposed = true; });
    disposeSystemScene(group);
    assert.ok(disposed, 'shared path participates in normal scene cleanup');
  });

  test(`${scaleMode}: a nested group orbit follows its moving parent through time`, () => {
    const nodes = new Map(fixture.nodes.map(n => [n.id, { ...n }]));
    // Put the existing group inside another orbiting barycentre.
    nodes.set(8, { ...nodes.get(2), id: 8, children: [2] });
    nodes.set(2, { ...nodes.get(2), parentId: 8 });
    const { group, updatables } = buildSystemScene(nodes, epoch, fixture.systemName, 'exploration', {}, { scaleMode });
    assert.ok(updatables.get(2)?.orbit);
    assert.ok(updatables.get(8)?.orbit);
    const before = updatables.get(2).orbit.position.clone();
    const later = epoch + 30 * 86400 * 1000;
    updateSystemScene(nodes, updatables, later, { scaleMode });
    for (const id of [2, 8, 3, 4]) {
      const entry = updatables.get(id);
      const trueDistances = scaleMode !== 'compact';
      const origin = scenePosition(nodes, trueDistances ? id : nodes.get(id).parentId, later, trueDistances);
      assert.deepEqual(entry.orbit.position.toArray(), [origin.x, origin.y, origin.z]);
      assert.ok([...entry.orbit.geometry.attributes.position.array].every(Number.isFinite));
    }
    assert.ok(before.distanceTo(updatables.get(2).orbit.position) > 0.1);
    disposeSystemScene(group);
  });
}

test('groups without orbital data or a resolvable parent do not get fabricated paths', () => {
  const nodes = new Map(fixture.nodes.map(n => [n.id, n]));
  nodes.set(2, { ...nodes.get(2), elements: null });
  nodes.set(8, { ...fixture.nodes.find(n => n.id === 2), id: 8, parentId: 99 });
  const { group } = buildSystemScene(nodes, epoch, fixture.systemName);
  assert.ok(!group.children.some(obj => [2, 8].includes(obj.userData.orbitBodyId)));
  disposeSystemScene(group);
});
