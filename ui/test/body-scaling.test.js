import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSystemScene, updateSystemScene } from '../src/scene-builder.js';
import { updateBodyAnnotations } from '../src/body-markers.js';

const elements = { semiMajorAxis: 1e12, eccentricity: 0, inclinationDeg: 0,
  periapsisDeg: 0, ascendingNodeDeg: 0, meanAnomalyDeg: 0, orbitalPeriodSec: 1000, epochMs: 0 };
const nodes = new Map([
  [0, { id: 0, kind: 'Star', name: 'Test', parentId: null, raw: { Radius: 1e11 } }],
  [1, { id: 1, kind: 'Planet', name: 'Test 1', parentId: 0, elements,
    raw: { Radius: 1e6, Rings: [{ InnerRad: 2e6, OuterRad: 3e6 }] } }],
  [2, { id: 2, kind: 'Planet', name: 'Test 2', parentId: 0,
    elements: { ...elements, semiMajorAxis: 2e12 }, raw: {} }],
]);
const build = (scaleMode) => buildSystemScene(nodes, 0, 'Test', 'exploration', {}, { scaleMode });

test('fully to scale uses one conversion for body sizes, rings, separations and orbital paths', () => {
  const { updatables } = build('realistic');
  const star = updatables.get(0);
  const planet = updatables.get(1);
  assert.equal(star.radius, 100);
  assert.equal(planet.radius, 0.001);
  assert.equal(star.radius / planet.radius, 100000);
  assert.equal(planet.bodyGroup.position.distanceTo(star.bodyGroup.position), 1000);
  assert.equal(planet.rings[0].geometry.parameters.innerRadius, 0.002);
  assert.equal(planet.rings[0].geometry.parameters.outerRadius, 0.003);
  const first = new THREE.Vector3().fromBufferAttribute(planet.orbit.geometry.attributes.position, 0);
  first.add(planet.orbit.position);
  assert.ok(first.distanceTo(planet.bodyGroup.position) < 1e-8);
  const distances = build('distances');
  updateSystemScene(nodes, updatables, 250000, { scaleMode: 'realistic' });
  updateSystemScene(nodes, distances.updatables, 250000, { scaleMode: 'distances' });
  assert.ok(planet.bodyGroup.position.distanceTo(distances.updatables.get(1).bodyGroup.position) < 1e-8);
  assert.equal(planet.radius, 0.001, 'playback does not change sizes');
});

test('compact and true-distance modes retain the existing exaggerated bodies and rings', () => {
  const compact = build('compact');
  const distances = build('distances');
  for (const id of nodes.keys()) {
    assert.equal(compact.updatables.get(id).radius, distances.updatables.get(id).radius);
    assert.equal(compact.updatables.get(id).marker, null);
  }
  assert.equal(compact.updatables.get(1).rings[0].geometry.parameters.outerRadius,
    distances.updatables.get(1).rings[0].geometry.parameters.outerRadius);
});

test('tiny bodies keep their physical sphere while markers and labels remain readable across zoom', () => {
  const { updatables } = build('realistic');
  const planet = updatables.get(1);
  const camera = new THREE.PerspectiveCamera(60, 1, 1e-10, 1e9);
  const markerPixels = [];
  for (const distance of [100, 10000]) {
    camera.position.copy(planet.bodyGroup.position).add(new THREE.Vector3(0, 0, distance));
    camera.lookAt(planet.bodyGroup.position);
    updateBodyAnnotations(updatables, camera, 800);
    assert.equal(planet.marker.visible, true);
    markerPixels.push(planet.marker.scale.x / (2 * distance * Math.tan(Math.PI / 6) / 800));
    assert.equal(planet.mesh.geometry.parameters.radius, 0.001);
    assert.ok(Math.abs(planet.label.scale.y / (2 * distance * Math.tan(Math.PI / 6) / 800) - 18) < 1e-8);
  }
  for (const pixels of markerPixels) assert.ok(Math.abs(pixels - 4) < 1e-8);
  camera.position.copy(planet.bodyGroup.position).add(new THREE.Vector3(0, 0, 0.01));
  camera.lookAt(planet.bodyGroup.position);
  updateBodyAnnotations(updatables, camera, 800);
  assert.equal(planet.marker.visible, false, 'marker disappears when the sphere is large enough');
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, 1)));
  updateBodyAnnotations(updatables, camera, 800);
  assert.equal(planet.marker.visible, false);
  assert.equal(planet.label.visible, false, 'labels behind the camera are hidden');
});

test('unknown radii use location markers without fabricating a physical size', () => {
  const { updatables } = build('realistic');
  const unknown = updatables.get(2);
  assert.equal(unknown.radius, 0);
  assert.equal(unknown.mesh.geometry.parameters.radius, 0);
  assert.equal(unknown.mesh.userData.minPickPixels, 10);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.001, 1e6);
  camera.position.copy(unknown.bodyGroup.position).add(new THREE.Vector3(0, 0, 10));
  camera.lookAt(unknown.bodyGroup.position);
  updateBodyAnnotations(updatables, camera, 800);
  assert.equal(unknown.marker.visible, true);
});

test('physical-scale orbit lines pass through the current body position between fixed samples', () => {
  for (const period of [1000, -1000]) {
    const movingNodes = new Map(nodes);
    movingNodes.set(1, { ...nodes.get(1), elements: { ...elements, orbitalPeriodSec: period } });
    const { updatables } = buildSystemScene(movingNodes, 12345, 'Test', 'exploration', {}, { scaleMode: 'realistic' });
    for (const time of [12345, 434567, -876543]) {
      updateSystemScene(movingNodes, updatables, time, { scaleMode: 'realistic' });
      const entry = updatables.get(1);
      const points = entry.orbit.geometry.attributes.position;
      let nearest = Infinity;
      for (let i = 0; i < points.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(points, i).add(entry.orbit.position);
        nearest = Math.min(nearest, p.distanceTo(entry.bodyGroup.position));
      }
      assert.ok(nearest < entry.radius / 10, 'path reaches the body within Float32 precision');
    }
  }
});
