import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindOrbitSettings, resolveOrbitBrightness } from '../src/orbit-settings.js';
import { buildSystemScene, disposeSystemScene, highlightSelectedOrbit } from '../src/scene-builder.js';

function controls(storage, onChange = () => {}) {
  const elements = new Map();
  const root = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', attributes: {},
      addEventListener(type, fn) { this[type] = fn; },
      setAttribute(key, value) { this.attributes[key] = value; },
    });
    return elements.get(id);
  } };
  return { settings: bindOrbitSettings({ root, storage, onChange }), el: root.getElementById };
}

test('brightness previews on input, persists even when off, and resets to the default', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const changes = [];
  const ui = controls(storage, (value) => changes.push(value));
  assert.equal(ui.settings.brightness, 1);
  ui.el('orbitBrightness').value = '175';
  ui.el('orbitBrightness').input();
  assert.deepEqual(changes, [1.75]);
  assert.equal(controls(storage).settings.brightness, 1.75);
  ui.el('orbitBrightness').value = '0';
  ui.el('orbitBrightness').input();
  const reloaded = controls(storage);
  assert.equal(reloaded.settings.brightness, 0);
  assert.equal(reloaded.el('orbitBrightness').attributes['aria-valuetext'], 'Off');
  reloaded.el('resetOrbitBrightness').click();
  assert.equal(controls(storage).settings.brightness, 1);
  assert.equal(reloaded.el('orbitBrightnessValue').textContent, '100%');
});

test('invalid saved brightness cannot produce invalid material opacity', () => {
  for (const value of [null, undefined, '', 'broken', 'Infinity']) assert.equal(resolveOrbitBrightness(value), 1);
  assert.equal(resolveOrbitBrightness('-1'), 0);
  assert.equal(resolveOrbitBrightness('9'), 4);
});

test('brightness preserves source contrast and selection emphasis without rebuilding geometry', () => {
  const elements = { semiMajorAxis: 1e11, eccentricity: 0, inclinationDeg: 0,
    periapsisDeg: 0, ascendingNodeDeg: 0, meanAnomalyDeg: 0, orbitalPeriodSec: 1000, epochMs: 0 };
  const nodes = new Map([
    [0, { id: 0, kind: 'Star', name: 'Test', raw: {} }],
    [1, { id: 1, kind: 'Planet', name: 'Test 1', parentId: 0, elements, raw: {} }],
    [2, { id: 2, kind: 'Planet', name: 'Test 2', parentId: 0, elements, raw: {}, isBackfill: true }],
  ]);
  for (const scaleMode of ['compact', 'distances', 'realistic']) {
    const built = buildSystemScene(nodes, 0, 'Test', 'exploration', {}, { scaleMode });
    const scanned = built.updatables.get(1).orbit;
    const community = built.updatables.get(2).orbit;
    const geometry = scanned.geometry;
    highlightSelectedOrbit(built.updatables, null, 1);
    const normal = scanned.material.opacity;
    assert.ok(normal > community.material.opacity);
    highlightSelectedOrbit(built.updatables, 1, 1);
    assert.ok(scanned.material.opacity > normal);
    highlightSelectedOrbit(built.updatables, 2, 0);
    assert.equal(scanned.visible, false);
    assert.equal(community.visible, false);
    highlightSelectedOrbit(built.updatables, 1, 2);
    assert.equal(scanned.visible, true);
    assert.ok(scanned.material.opacity <= 1);
    assert.equal(community.material.opacity, community.userData.baseOpacity * 2);
    highlightSelectedOrbit(built.updatables, 2, 1);
    assert.equal(scanned.material.opacity, normal, 'restoring brightness/selection must not compound changes');
    assert.equal(scanned.geometry, geometry);
    for (const intensity of [0.05, 1, 2, 3, 4]) {
      highlightSelectedOrbit(built.updatables, 2, intensity);
      const luminance = material => material.opacity * (0.2126 * material.color.r + 0.7152 * material.color.g + 0.0722 * material.color.b);
      assert.ok(luminance(community.material) > luminance(scanned.material) * 1.25,
        'selected community orbit must remain distinct from journal orbits at high intensity');
      assert.ok(community.renderOrder > scanned.renderOrder);
      assert.equal(community.material.depthWrite, false);
      assert.equal(scanned.material.depthWrite, false);
    }
    highlightSelectedOrbit(built.updatables, null, 2);
    const previous = scanned.material.color.clone();
    highlightSelectedOrbit(built.updatables, null, 4);
    assert.ok(scanned.material.color.r > previous.r, 'brightness must keep increasing after opacity is capped');
    disposeSystemScene(built.group);
  }
});
