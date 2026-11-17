import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies, compressDistance, parentOrbitFrame, transformVector } from '@orrery/shared';
import { buildSystemScene, updateSystemScene, highlightSelectedOrbit, disposeSystemScene } from '../src/scene-builder.js';
import { createBodyNavigation, navigationLabel } from '../src/body-navigation.js';
import { buildAsteroidBelt } from '../src/asteroid-belt.js';

const { systems } = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/asteroid-belts.json', import.meta.url)));

test('belts are navigable children sorted by radial extent, with no invented point body or phase', () => {
  const { nodes } = mergeCommunityBodies(new Map(), systems.Sol);
  const belt = [...nodes.values()].find(n => n.kind === 'AsteroidBelt');
  const nav = createBodyNavigation(nodes);
  const names = nav.children(0).map(id => nodes.get(id).name);
  assert.ok(names.indexOf('Mars') < names.indexOf('Asteroid Belt'));
  assert.ok(names.indexOf('Asteroid Belt') < names.indexOf('Jupiter'));
  assert.deepEqual(nav.path(belt.id), ['system', 0, belt.id]);
  assert.equal(navigationLabel(belt, 'Sol'), 'Asteroid Belt');
  for (const scaleMode of ['compact', 'distances', 'realistic']) {
    const built = buildSystemScene(nodes, 0, 'Sol', 'exploration', {}, { scaleMode });
    const entry = built.updatables.get(belt.id);
    assert.equal(entry.mesh, null);
    assert.equal(entry.label, null);
    assert.equal(entry.orbit, null);
    assert.ok(![...built.pickables.values()].includes(belt.id));
    const expected = scaleMode === 'compact' ? compressDistance(belt.raw.OuterRad) : belt.raw.OuterRad / 1e9;
    assert.equal(entry.frameRadius, expected);
    const p = entry.band.geometry.getAttribute('position');
    let min = Infinity, max = 0;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
      min = Math.min(min, r); max = Math.max(max, r);
    }
    assert.ok(Math.abs(max - expected) < expected * 1e-6);
    const inner = scaleMode === 'compact' ? compressDistance(belt.raw.InnerRad) : belt.raw.InnerRad / 1e9;
    assert.ok(Math.abs(min - inner) < inner * 1e-6);
    highlightSelectedOrbit(built.updatables, belt.id);
    const selected = entry.band.material.opacity;
    highlightSelectedOrbit(built.updatables, 0);
    assert.ok(selected > entry.band.material.opacity);
    highlightSelectedOrbit(built.updatables, belt.id, 0);
    assert.equal(entry.band.visible, false);
    let disposed = false;
    entry.band.geometry.addEventListener('dispose', () => { disposed = true; });
    disposeSystemScene(built.group);
    assert.ok(disposed);
  }
});

test('Shinrarta belt follows its moving star and uses its inherited child plane', () => {
  const { nodes } = mergeCommunityBodies(new Map(), systems['Shinrarta Dezhra']);
  const belt = [...nodes.values()].find(n => n.kind === 'AsteroidBelt');
  const built = buildSystemScene(nodes, 0, 'Shinrarta Dezhra', 'exploration', {}, { scaleMode: 'realistic' });
  const entry = built.updatables.get(belt.id);
  const before = entry.bodyGroup.position.clone();
  const frame = parentOrbitFrame(nodes, belt.id);
  const normal = transformVector(frame, { x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(normal.z) < 0.999, 'nontrivial inherited inclination');
  const p = entry.band.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getX(i) * normal.x + p.getY(i) * normal.y + p.getZ(i) * normal.z) < 1e-6);
  }
  updateSystemScene(nodes, built.updatables, 1e12, { scaleMode: 'realistic' });
  assert.ok(entry.bodyGroup.position.distanceTo(before) > 0);
  assert.ok(entry.bodyGroup.position.equals(built.updatables.get(belt.parentId).bodyGroup.position));
  disposeSystemScene(built.group);
});

test('missing or invalid belt extent never produces a fabricated band', () => {
  for (const raw of [{}, { InnerRad: 2, OuterRad: 1 }, { InnerRad: NaN, OuterRad: 3 }, { InnerRad: -1, OuterRad: 3 }]) {
    assert.equal(buildAsteroidBelt(new Map(), { raw }, true), null);
  }
});
