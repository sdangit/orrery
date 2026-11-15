import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeCommunityBodies } from '@orrery/shared';
import { buildSystemScene, updateSystemScene, disposeSystemScene, scenePosition } from '../src/scene-builder.js';
import { orbitFrame } from '../src/view-presets.js';

const fixture = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/vega-journal-orbits.json', import.meta.url)));
const nodes = new Map(fixture.nodes.map(n => [n.id, n]));
const timb = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/spansh-timbalderis-orbits.json', import.meta.url)));
const systems = [
  { name: 'Vega', nodes, epoch: fixture.capturedAt, ids: [4, 5, 6, 7, 8, 9, 12] },
  { name: 'Timbalderis', nodes: mergeCommunityBodies(new Map(), { spansh: timb }).nodes,
    epoch: '2026-11-15T08:34:53.050Z', ids: [2, 3, 14, 17, 28, 40, 53, 54] },
];
const vector = p => new THREE.Vector3(p.x, p.y, p.z);

test('front-view orbit diagonal uses the corrected vertical sign', () => {
  // Raw node=90°, inclination=45° gives z=-x after Elite angle conversion.
  // The old positive-inclination convention instead produced z=+x.
  const nodes = new Map([
    [0, { id: 0, kind: 'Star', parentId: null, raw: {} }],
    [1, { id: 1, kind: 'Planet', parentId: 0, raw: {}, elements: {
      semiMajorAxis: 1e9, eccentricity: .2, inclinationDeg: 45,
      ascendingNodeDeg: 90, periapsisDeg: 0, meanAnomalyDeg: 90,
      orbitalPeriodSec: 1000, epochMs: 0,
    } }],
  ]);
  for (const scaleMode of ['compact', 'distances', 'realistic']) {
    const built = buildSystemScene(nodes, 0, 'Diagonal test', 'exploration', {}, { scaleMode });
    try {
      const entry = built.updatables.get(1);
      assert.ok(entry.bodyGroup.position.x > 0 && entry.bodyGroup.position.z < 0);
      const attribute = entry.orbit.geometry.attributes.position;
      for (let i = 0; i < Math.min(attribute.count, entry.orbit.geometry.drawRange.count); i++) {
        const p = new THREE.Vector3().fromBufferAttribute(attribute, i).add(entry.orbit.position);
        assert.ok(Math.abs(p.z + p.x) < 1e-6, `wrong front-view diagonal in ${scaleMode}`);
      }
    } finally { disposeSystemScene(built.group); }
  }
});

for (const system of systems) for (const scaleMode of ['compact', 'distances', 'realistic']) {
  test(`${system.name} ${scaleMode}: nested curves, playback and selected orbit views share the body's frame`, () => {
    const trueDistances = scaleMode !== 'compact';
    const { nodes } = system;
    const now = Date.parse(system.epoch);
    const built = buildSystemScene(nodes, now, system.name, 'exploration', {}, { scaleMode });
    try {
      for (const time of [now, now + 1e10, now - 1e10]) {
        updateSystemScene(nodes, built.updatables, time, { scaleMode });
        for (const id of system.ids) {
          const node = nodes.get(id), entry = built.updatables.get(id);
          const parent = vector(scenePosition(nodes, node.parentId, time, trueDistances));
          const frame = orbitFrame(node, nodes);
          const relative = entry.bodyGroup.position.clone().sub(parent);
          assert.ok(Math.abs(relative.dot(frame.z)) < 1e-8, `${node.name}: selected orbit camera plane`);
          const attribute = entry.orbit.geometry.attributes.position;
          const count = Math.min(attribute.count, entry.orbit.geometry.drawRange.count);
          const vertices = Array.from({ length: count }, (_, i) =>
            new THREE.Vector3().fromBufferAttribute(attribute, i).add(entry.orbit.position));
          for (const fraction of [0, 0.25, 0.5, 0.75]) {
            const t = node.elements.epochMs + fraction * node.elements.orbitalPeriodSec * 1000;
            const p = vector(scenePosition(nodes, id, t, trueDistances));
            const referenceParent = vector(scenePosition(nodes, node.parentId, t, trueDistances));
            const expected = p.sub(referenceParent).add(parent);
            const miss = Math.min(...vertices.map(v => v.distanceTo(expected)));
            assert.ok(miss < Math.max(1e-5, relative.length() * 1e-6), `${node.name}: full orbit misses by ${miss}`);
          }
          if (trueDistances) {
            const miss = Math.min(...vertices.map(v => v.distanceTo(entry.bodyGroup.position)));
            assert.ok(miss < 1e-10, `${node.name}: moving local detail lost body attachment`);
          }
        }
      }
    } finally { disposeSystemScene(built.group); }
  });
}
