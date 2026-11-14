import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pickBody, bindBodySelection } from '../src/picking.js';

test('clicking a projected body hits it at 1x, fractional scaling, and Retina resolution', () => {
  const rect = { left: 30, top: 40, width: 1280, height: 800, right: 1310, bottom: 840 };
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const canvas = { width: rect.width * dpr, height: rect.height * dpr, getBoundingClientRect: () => rect };
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(2), new THREE.MeshBasicMaterial());
    parent.position.set(8, 3, 0);
    parent.add(body);
    scene.add(parent);
    const camera = new THREE.PerspectiveCamera(55, 1.6, 0.05, 60000);
    camera.position.set(0,0,40);
    camera.lookAt(0,0,0);
    camera.updateMatrixWorld();
    const projected = parent.position.clone().project(camera);
    const x = rect.left + (projected.x + 1) * rect.width / 2;
    const y = rect.top + (1 - projected.y) * rect.height / 2;
    // Parent matrices deliberately haven't been updated by a render yet.
    assert.equal(pickBody(x, y, canvas, camera, scene, new Map([[body, 0]])), 0);
    assert.equal(pickBody(0, 0, canvas, camera, scene, new Map([[body, 0]])), null);
    body.geometry.dispose();
    body.material.dispose();
  }
});

function pointer(canvas, type, values = {}) {
  const event = new Event(type);
  Object.assign(event, { pointerId: 1, button: 0, clientX: 100, clientY: 100, ...values });
  canvas.dispatchEvent(event);
}

test('only a primary click selects; dragging back to start, pan, cancel, and multitouch do not', () => {
  const canvas = new EventTarget();
  const selected = [];
  bindBodySelection(canvas, (...point) => selected.push(point));
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerup');
  assert.equal(selected.length, 1);
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointermove', { clientX: 160 });
  pointer(canvas, 'pointerup');
  for (const options of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { button: 2 }]) {
    pointer(canvas, 'pointerdown', options);
    pointer(canvas, 'pointerup', options);
  }
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointercancel');
  pointer(canvas, 'pointerup');
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerdown', { pointerId: 2 });
  pointer(canvas, 'pointerup', { pointerId: 2 });
  pointer(canvas, 'pointerup');
  assert.equal(selected.length, 1);
});
