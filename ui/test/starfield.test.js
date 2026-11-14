import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStarfield } from '../src/starfield.js';

function capture() {
  const sky = createStarfield();
  const view = new THREE.PerspectiveCamera(55, 1.6, 0.05, 60000);
  let projected;
  let skyCamera;
  const renderer = { render(scene, camera) {
    camera.updateMatrixWorld();
    skyCamera = camera;
    const positions = scene.children[0].geometry.attributes.position;
    projected = Array.from({length:positions.count}, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(positions, i).project(camera).toArray());
  } };
  return { view, render() { sky.render(renderer, view); return projected; }, get camera() { return skyCamera; } };
}

test('zooming beyond the old shell and panning preserve every background star projection', () => {
  const sky = capture();
  const initial = sky.render();
  for (const distance of [1e-9, 25000, 40000, 1e8, 1e12]) {
    sky.view.position.set(distance, -distance * 2, distance * 3);
    sky.view.near = Math.max(1e-12, distance / 1e6);
    sky.view.far = Math.max(60000, distance * 4);
    sky.view.updateProjectionMatrix();
    assert.deepEqual(sky.render(), initial);
    assert.ok(sky.camera.near < 1 && sky.camera.far > 1);
  }
});

test('sky rotates with the viewing direction and adapts to viewport aspect and lens zoom', () => {
  const sky = capture();
  const initial = sky.render();
  sky.view.rotation.set(0.3, 0.5, 0.2);
  const rotated = sky.render();
  assert.notDeepEqual(rotated, initial);
  assert.ok(sky.camera.quaternion.angleTo(sky.view.quaternion) < 1e-7);
  sky.view.aspect *= 2;
  const wider = sky.render();
  for (let i=0; i<wider.length; i++) {
    assert.ok(Math.abs(wider[i][0] - rotated[i][0] / 2) < 1e-8);
    assert.equal(wider[i][1], rotated[i][1]);
  }
  sky.view.zoom = 2;
  const zoomed = sky.render();
  for (let i=0; i<zoomed.length; i++) assert.ok(Math.abs(zoomed[i][1] - wider[i][1] * 2) < 1e-8);
});
