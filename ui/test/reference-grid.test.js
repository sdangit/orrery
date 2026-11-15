import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createReferenceGrid, gridLayout, gridStepLabel, bindGridToggle } from '../src/reference-grid.js';

test('grid is square in a top view, stays on system Z=0 and subdivides with zoom', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, .001, 1e9);
  camera.position.set(0, 0, 100);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const grid = createReferenceGrid();
  const a = grid.update(camera, new THREE.Vector3(), 1000);
  const centre = new THREE.Vector3().project(camera);
  const right = new THREE.Vector3(a.step, 0, 0).project(camera);
  const up = new THREE.Vector3(0, a.step, 0).project(camera);
  assert.ok(Math.abs((right.x-centre.x)*1600 - (up.y-centre.y)*1000) < 1e-9);
  camera.position.z /= 10;
  const b = grid.update(camera, new THREE.Vector3(123, -456, 0), 1000);
  // Compare the same target when checking level reduction.
  const zoomed = gridLayout(camera, new THREE.Vector3(), 1000);
  assert.equal(zoomed.step, a.step / 10);
  assert.equal(grid.mesh.position.z, 0);
  assert.ok(Math.abs(b.x / (100*b.step) - Math.round(b.x / (100*b.step))) < 1e-9);
  assert.equal(grid.mesh.geometry.attributes.position.count, 4, 'zoom must not multiply geometry');
  grid.dispose();
});

test('grid remains finite across physical zoom levels and labels compressed distances honestly', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, .001, 1e15);
  for (const distance of [1e-9, 1e-4, 1, 1e6, 1e12]) {
    camera.position.set(distance, distance, distance);
    const layout = gridLayout(camera, new THREE.Vector3(), 1000);
    assert.ok(Object.values(layout).every(Number.isFinite));
    assert.ok(layout.step > 0 && layout.blend >= 0 && layout.blend < 1);
  }
  assert.match(gridStepLabel(10, false), /display units/);
  assert.match(gridStepLabel(1, true), /ls/);
  assert.match(gridStepLabel(1000, true), /AU/);
});

test('grid toggle restores and persists its state', () => {
  const values = new Map([['orrery.referenceGrid', 'true']]), changes = [];
  const toggle = { addEventListener(event, fn) { this[event] = fn; } };
  const origin = { addEventListener(event, fn) { this[event] = fn; } };
  bindGridToggle({ root: { getElementById: id => id === 'referenceGridToggle' ? toggle : origin },
    storage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) },
    onChange: (visible, followView) => changes.push([visible, followView]) });
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  toggle.change();
  assert.deepEqual(changes, [[true, true], [false, true]]);
  assert.equal(values.get('orrery.referenceGrid'), 'false');
  origin.value = 'system';
  origin.change();
  assert.deepEqual(changes.at(-1), [false, false]);
  assert.equal(values.get('orrery.gridOrigin'), 'system');
});

test('grid follows a distant off-plane group through physical close-ups without retaining root-scale spacing', () => {
  const target = new THREE.Vector3(-1494, -9510, -7662);
  const camera = new THREE.PerspectiveCamera(55, 1.6, 1e-12, 60000);
  camera.up.set(0,1,0);
  for (const distance of [100, 1, .001]) {
    camera.position.copy(target).add(new THREE.Vector3(0,0,distance));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const follows = gridLayout(camera, target, 1000);
    const fixed = gridLayout(camera, target, 1000, { followView: false });
    assert.equal(follows.z, target.z);
    assert.equal(fixed.z, 0);
    assert.ok(follows.step < fixed.step);
    const p = new THREE.Vector3(target.x, target.y, follows.z).project(camera);
    assert.ok(Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6 && Math.abs(p.z) <= 1);
    assert.equal(camera.position.z < fixed.z, true, 'fixed system plane is behind this close-up camera');
  }
});
