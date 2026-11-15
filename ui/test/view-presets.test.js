import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { eliteKeplerianOffset } from '@orrery/shared';
import { orbitFrame, viewOrientation } from '../src/view-presets.js';
import { bindViewPanel } from '../src/view-panel.js';

test('selected orbit plane matches the rendered Kepler curve, including tilted and retrograde orbits', () => {
  for (const inclinationDeg of [0, 63, 90, 150, 180]) {
    const elements = { semiMajorAxis: 1000, eccentricity: 0.4, orbitalPeriodSec: -100,
      epochMs: 0, meanAnomalyDeg: 17, inclinationDeg, periapsisDeg: 37, ascendingNodeDeg: 123 };
    const frame = orbitFrame({ elements });
    for (const time of [0, 13000, 55000]) {
      const p = eliteKeplerianOffset(elements, time);
      const point = new THREE.Vector3(p.x, p.y, p.z);
      assert.ok(Math.abs(point.dot(frame.z)) < 1e-9);
    }
    assert.ok(Math.abs(viewOrientation('top', frame).direction.dot(frame.z) - 1) < 1e-12);
    const front = viewOrientation('front', frame).direction;
    const side = viewOrientation('side', frame).direction;
    assert.ok(Math.abs(front.dot(frame.z)) < 1e-12);
    assert.ok(Math.abs(side.dot(frame.z)) < 1e-12);
    assert.ok(Math.abs(front.dot(side)) < 1e-12);
  }
  assert.equal(orbitFrame(null), null);
  assert.equal(orbitFrame({ elements: { inclinationDeg: NaN } }), null);
});

test('selection and reference changes do not rotate the camera until a preset is chosen', () => {
  const elements = new Map();
  const root = { addEventListener() {}, getElementById(id) {
    if (!elements.has(id)) elements.set(id, { hidden: true, value: '', attributes: {},
      addEventListener(type, fn) { this[type] = fn; }, setAttribute(k, v) { this.attributes[k] = v; }, focus() {} });
    return elements.get(id);
  } };
  const el = root.getElementById;
  let selected;
  const applied = [];
  const panel = bindViewPanel({ root, getSelectedNode: () => selected, onApply: pose => applied.push(pose) });
  assert.equal(el('selectedOrbitOption').disabled, true);
  selected = { id: 1, name: 'Planet 1', orbitQuality: 'approximate', elements: { inclinationDeg: 20, ascendingNodeDeg: 10, periapsisDeg: 80 } };
  panel.refresh();
  el('viewReference').value = 'selected';
  el('viewReference').change();
  assert.equal(applied.length, 0);
  assert.match(el('viewReferenceNote').textContent, /approximate/);
  el('viewTopButton').click();
  assert.equal(applied.length, 1);
  assert.equal(el('viewOrientationStatus').textContent, 'Top · Planet 1');
  selected = { ...selected, id: 2, name: 'Planet 2' };
  panel.refresh();
  assert.equal(applied.length, 1);
  assert.equal(el('viewTopButton').attributes['aria-pressed'], 'false');
  assert.equal(el('viewOrientationStatus').textContent, 'Top · Planet 1');
  panel.custom();
  assert.equal(el('viewOrientationStatus').textContent, 'Custom orientation');
  selected = null;
  panel.refresh();
  assert.equal(el('viewReference').value, 'system');
  assert.equal(el('selectedOrbitOption').disabled, true);
});
