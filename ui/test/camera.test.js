import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrbitCamera } from '../src/camera.js';

class Canvas extends EventTarget {
  style = {};
  getRootNode() { return this; }
  focus() {}
}

test('framing contains the system in landscape and portrait views, including HUD margins', () => {
  for (const aspect of [1.6, 0.5]) {
    const camera = new THREE.PerspectiveCamera(55, aspect, 0.05, 60000);
    const orbit = createOrbitCamera(new Canvas(), camera);
    const bounds = new THREE.Box3(new THREE.Vector3(-120, 10, -30), new THREE.Vector3(80, 170, 60));
    orbit.fit(bounds, { widthFraction: 0.55, heightFraction: 0.8 }, true);
    camera.updateMatrixWorld();
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(p.x) <= 0.55 && Math.abs(p.y) <= 0.8);
          assert.ok(p.z > -1 && p.z < 1);
        }
      }
    }
    assert.deepEqual(camera.up.toArray(), [0, 0, 1]);
    orbit.controls.dispose();
  }
});

test('centering preserves camera angle and distance; reset restores orientation', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.05, 60000);
  let pans = 0;
  const orbit = createOrbitCamera(new Canvas(), camera, { onPan: () => pans++ });
  const originalOffset = camera.position.clone().sub(orbit.controls.target);
  const target = new THREE.Vector3(100, 200, 30);
  orbit.focus(target);
  assert.ok(camera.position.clone().sub(target).distanceTo(originalOffset) < 1e-10);
  assert.equal(pans, 0);
  camera.position.set(150, 0, 20);
  orbit.controls.update();
  const bounds = new THREE.Box3(new THREE.Vector3(-2,-2,-2), new THREE.Vector3(2,2,2));
  orbit.fit(bounds, {}, true);
  assert.ok(camera.position.clone().sub(orbit.controls.target).normalize().distanceTo(originalOffset.normalize()) < 1e-10);
  orbit.controls.target.x += 10;
  orbit.controls.update();
  assert.equal(pans, 1);
  orbit.controls.dispose();
});

test('empty and very large systems remain frameable with valid clipping planes', () => {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60000);
  const orbit = createOrbitCamera(new Canvas(), camera);
  orbit.fit(new THREE.Box3(), {});
  assert.ok(Number.isFinite(camera.position.length()));
  orbit.fit(new THREE.Box3(new THREE.Vector3(-1e7,-1e7,-1e7), new THREE.Vector3(1e7,1e7,1e7)), {});
  assert.ok(camera.far > camera.position.length() + 1e7);
  assert.ok(camera.near > 0 && camera.near < camera.far);
  orbit.controls.dispose();
});
