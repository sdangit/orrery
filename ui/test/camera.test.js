import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrbitCamera, fitDistance, ORRERY_FOV_DEG } from '../src/camera.js';

class Canvas extends EventTarget {
  style = {};
  clientWidth = 1200;
  clientHeight = 800;
  getRootNode() { return this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus() {}
}

function input(canvas, type, overrides = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0,
    clientX: 600, clientY: 400, ...overrides });
  Object.assign(event, { pageX: event.clientX, pageY: event.clientY });
  canvas.dispatchEvent(event);
}

for (const gesture of ['rotate', 'zoom']) {
  test(`${gesture} keeps following a moving body at close and distant camera ranges`, () => {
    for (const distance of [0.0001, 70, 1e7]) {
      const canvas = new Canvas();
      const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.5, 0.05, 60000);
      let pans = 0;
      const orbit = createOrbitCamera(canvas, camera, { onPan: () => pans++ });
      for (let frame = 0; frame < 120; frame++) {
        const phase = frame / 19;
        const target = new THREE.Vector3(141.23 * Math.cos(phase), 58.921 * Math.sin(phase), 12.475 * Math.sin(2 * phase));
        orbit.focus(target, frame === 0 ? distance : undefined);
        if (gesture === 'rotate') {
          input(canvas, 'pointerdown');
          input(canvas, 'pointermove', { clientX: 615, clientY: 405 });
          input(canvas, 'pointerup', { clientX: 615, clientY: 405 });
        } else {
          input(canvas, 'wheel', { deltaY: 100, deltaMode: 0 });
        }
        assert.equal(pans, 0, `${gesture} must not release follow at distance ${distance}, frame ${frame}`);
        assert.ok(orbit.controls.target.distanceTo(target) < 1e-10);
      }
      orbit.controls.dispose();
    }
  });
}

test('actual pointer and keyboard pans still release following at physical and system scales', () => {
  for (const distance of [0.0001, 70, 1e7]) {
    for (const gesture of ['right-drag', 'shift-drag', 'arrow']) {
      const canvas = new Canvas();
      const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.5, 0.05, 60000);
      let pans = 0;
      const orbit = createOrbitCamera(canvas, camera, { onPan: () => pans++ });
      orbit.focus(new THREE.Vector3(141.23, 58.921, 12.475), distance);
      if (gesture === 'arrow') {
        input(canvas, 'keydown', { code: 'ArrowLeft' });
      } else {
        const modifiers = gesture === 'right-drag' ? { button: 2 } : { shiftKey: true };
        input(canvas, 'pointerdown', modifiers);
        input(canvas, 'pointermove', { ...modifiers, clientX: 620 });
        input(canvas, 'pointerup', { ...modifiers, clientX: 620 });
      }
      assert.ok(pans > 0, `${gesture} at distance ${distance} should release follow`);
      orbit.controls.dispose();
    }
  }
});

test('free rotation completes repeated horizontal and vertical revolutions without pole limits or lost follow', async () => {
  const { viewOrientation } = await import('../src/view-presets.js');
  for (const axis of ['clientX','clientY']) {
    const canvas = new Canvas(), camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG,1.5,.001,60000);
    let pans=0;
    const orbit=createOrbitCamera(canvas,camera,{ onPan: () => pans++ });
    const target=new THREE.Vector3(1494,-9510,-7662);
    orbit.focus(target,100);
    orbit.orient(viewOrientation('top'));
    const direction=camera.position.clone().sub(target).normalize(), up=camera.up.clone();
    input(canvas,'pointerdown');
    for (let i=1;i<=192;i++) {
      input(canvas,'pointermove',{ [axis]: (axis==='clientX' ? 600 : 400)+i*12.5 });
      // 64 increments of 12.5 pixels = one complete revolution.
      if (i%64===32) assert.ok(camera.position.clone().sub(target).normalize().dot(direction)<-.999999);
      if (i%64===0) {
        assert.ok(camera.position.clone().sub(target).normalize().distanceTo(direction)<1e-5);
        assert.ok(camera.up.distanceTo(up)<1e-5);
      }
      assert.ok(Math.abs(camera.position.distanceTo(target)-100)<1e-8);
    }
    input(canvas,'pointerup',{ [axis]: (axis==='clientX' ? 600 : 400)+2400 });
    assert.equal(pans,0);
    orbit.controls.dispose();
  }
});

test('two-finger pinch keeps free rotation out of the gesture, then one finger can rotate again', async () => {
  const { viewOrientation } = await import('../src/view-presets.js');
  const canvas=new Canvas(),camera=new THREE.PerspectiveCamera(ORRERY_FOV_DEG,1.5,.001,60000);
  const orbit=createOrbitCamera(canvas,camera);
  orbit.orient(viewOrientation('top'));
  const before=camera.quaternion.clone(),distance=camera.position.distanceTo(orbit.controls.target);
  input(canvas,'pointerdown',{ pointerType:'touch',pointerId:1,clientX:500 });
  input(canvas,'pointerdown',{ pointerType:'touch',pointerId:2,clientX:700 });
  input(canvas,'pointermove',{ pointerType:'touch',pointerId:2,clientX:800 });
  assert.ok(camera.quaternion.angleTo(before)<1e-6);
  assert.ok(camera.position.distanceTo(orbit.controls.target)<distance);
  input(canvas,'pointerup',{ pointerType:'touch',pointerId:2,clientX:800 });
  input(canvas,'pointermove',{ pointerType:'touch',pointerId:1,clientX:520 });
  assert.ok(camera.quaternion.angleTo(before)>.01);
  input(canvas,'pointerup',{ pointerType:'touch',pointerId:1,clientX:520 });
  orbit.controls.dispose();
});

test('a small physical body can be inspected without the old minimum zoom or near-plane clipping', () => {
  const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.6, 0.05, 60000);
  const orbit = createOrbitCamera(new Canvas(), camera);
  const radius = 1e-5; // 10 km in the shared metre-to-scene conversion.
  const target = new THREE.Vector3(10000, 20000, 30000);
  const distance = fitDistance(camera, radius * 2.3, { widthFraction: 0.5 });
  orbit.focus(target, distance);
  assert.ok(camera.position.distanceTo(target) < 0.001);
  assert.ok(camera.near < distance - radius);
  assert.ok(camera.far > distance + radius);
  camera.updateMatrixWorld();
  const projected = target.clone().project(camera);
  assert.ok(Math.abs(projected.x) < 1e-5 && Math.abs(projected.y) < 1e-5);
  orbit.controls.dispose();
});

test('sub-epsilon pans at physical body scale redraw and release camera following', () => {
  const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.6, 0.05, 60000);
  let pans = 0;
  let redraws = 0;
  const orbit = createOrbitCamera(new Canvas(), camera, { onPan: () => pans++, onDirty: () => redraws++ });
  orbit.focus(new THREE.Vector3(100, 0, 0), 1e-4);
  assert.equal(pans, 0);
  redraws = 0;
  orbit.controls.target.x += 1e-7;
  camera.position.x += 1e-7;
  orbit.controls.update();
  assert.equal(pans, 1);
  assert.ok(redraws > 0);
  orbit.controls.dispose();
});

test('framing contains the system in landscape and portrait views, including HUD margins', () => {
  for (const aspect of [1.6, 0.5]) {
    const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, aspect, 0.05, 60000);
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
  const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.6, 0.05, 60000);
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
  const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1, 0.05, 60000);
  const orbit = createOrbitCamera(new Canvas(), camera);
  orbit.fit(new THREE.Box3(), {});
  assert.ok(Number.isFinite(camera.position.length()));
  orbit.fit(new THREE.Box3(new THREE.Vector3(-1e7,-1e7,-1e7), new THREE.Vector3(1e7,1e7,1e7)), {});
  assert.ok(camera.far > camera.position.length() + 1e7);
  assert.ok(camera.near > 0 && camera.near < camera.far);
  orbit.controls.dispose();
});

for (const preset of ['top', 'front', 'side', 'angled']) test(`${preset} aligns to either plane while preserving center, zoom and follow`, async () => {
  const { orbitFrame, SYSTEM_FRAME, viewOrientation } = await import('../src/view-presets.js');
  for (const frame of [SYSTEM_FRAME, orbitFrame({ elements: { inclinationDeg: 63, ascendingNodeDeg: 117, periapsisDeg: 34 } })]) {
    const canvas = new Canvas();
    const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.6, 0.05, 60000);
    let pans = 0;
    let custom = 0;
    const orbit = createOrbitCamera(canvas, camera, { onPan: () => pans++, onOrientationChange: () => custom++ });
    const target = new THREE.Vector3(0, 0, 30000);
    orbit.focus(target, 0.0001);
    const distance = camera.position.distanceTo(target);
    const orientation = viewOrientation(preset, frame);
    orbit.orient(orientation);
    assert.ok(orbit.controls.target.distanceTo(target) < 1e-10);
    assert.ok(Math.abs(camera.position.distanceTo(target) - distance) < 1e-10);
    const direction = camera.position.clone().sub(target).normalize();
    assert.ok(direction.distanceTo(orientation.direction) < 1e-6);
    assert.ok(camera.up.distanceTo(orientation.up) < 1e-10);
    for (let i = 0; i < 20; i++) orbit.focus(target.clone().add(new THREE.Vector3(i / 10, i / 20, i / 50)));
    assert.equal(pans, 0);
    assert.equal(custom, 0);
    assert.ok(camera.position.clone().sub(orbit.controls.target).normalize().distanceTo(orientation.direction) < 1e-5);
    input(canvas, 'pointerdown');
    input(canvas, 'pointermove', { clientX: 615, clientY: 405 });
    input(canvas, 'pointerup', { clientX: 615, clientY: 405 });
    assert.ok(custom > 0, 'free rotation should mark the orientation custom');
    assert.equal(pans, 0, 'rotating after a preset must not lose body follow');
    input(canvas, 'keydown', { code: 'ArrowLeft' });
    assert.ok(pans > 0, 'keyboard controls must still work after replacing controls');
    orbit.fit(new THREE.Box3(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1)), {}, true);
    assert.deepEqual(camera.up.toArray(), [0, 0, 1]);
    orbit.controls.dispose();
  }
});

test('vertical dragging crosses below the reference plane after every preset, including Top', async () => {
  const { orbitFrame, SYSTEM_FRAME, viewOrientation } = await import('../src/view-presets.js');
  for (const frame of [SYSTEM_FRAME, orbitFrame({ elements: { inclinationDeg: 63, ascendingNodeDeg: 117, periapsisDeg: 34 } })]) {
    for (const preset of ['top', 'front', 'side', 'angled']) {
      const canvas = new Canvas();
      const camera = new THREE.PerspectiveCamera(ORRERY_FOV_DEG, 1.5, .001, 60000);
      const orbit = createOrbitCamera(canvas, camera);
      const target = new THREE.Vector3(1494, -9510, -7662);
      orbit.focus(target, 100);
      orbit.orient(viewOrientation(preset, frame));
      if (preset === 'top') {
        camera.updateMatrixWorld();
        const centre = target.clone().project(camera);
        const north = target.clone().add(frame.y).project(camera);
        assert.ok(north.y > centre.y, 'Top retains positive reference Y screen-up');
        assert.ok(Math.abs(north.x-centre.x) < 1e-5, 'Top does not introduce a roll');
      }
      input(canvas, 'pointerdown');
      input(canvas, 'pointermove', { clientY: 100 });
      input(canvas, 'pointerup', { clientY: 100 });
      assert.ok(camera.position.clone().sub(target).dot(frame.z) < -1,
        `${preset} must allow a continuous drag into the lower hemisphere`);
      assert.ok(orbit.controls.target.distanceTo(target) < 1e-10);
      orbit.controls.dispose();
    }
  }
});
