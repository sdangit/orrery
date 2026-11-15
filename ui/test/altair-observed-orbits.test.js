import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies } from '@orrery/shared';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from '../src/scene-builder.js';
import { METRES_PER_UNIT } from '../src/scale-modes.js';

const input = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/altair-live-orbits.json', import.meta.url)));
const captured = JSON.parse(readFileSync(new URL('./fixtures/altair-observed-orrery.json', import.meta.url)));
const { nodes } = mergeCommunityBodies(new Map(input.journalNodes.map(n => [n.id, n])), input.providers);
const AU = 149597870700;
function project(position, camera, width, height) {
  assert.ok(camera.inverseDepth > 0, 'positive camera depth must not absorb an orbital reflection');
  const v = position.toArray().map(x => x * METRES_PER_UNIT / AU);
  const q = camera.rotation.map(row => row.reduce((sum, x, i) => sum + x * v[i], 0));
  const d = 1 + camera.inverseDepth * q[2];
  return [width / 1600, height / 1000].map((factor, i) =>
    factor * (camera.scale * q[i] / d + camera.translation[i]));
}

for (const scaleMode of ['distances', 'realistic']) test(`${scaleMode}: all observed Altair bodies match in-game captures using a frozen camera`, () => {
  const built = buildSystemScene(nodes, Date.parse(captured.views[0].timestamp), 'Altair', 'exploration', {}, { scaleMode });
  try {
    for (const view of captured.views) {
      updateSystemScene(nodes, built.updatables, Date.parse(view.timestamp), { scaleMode });
      for (const observation of view.observed) {
        const entry = built.updatables.get(observation.id);
        assert.ok(entry, `Missing body ${observation.id}`);
        const p = project(entry.bodyGroup.position, view.camera, view.width, view.height);
        const error = Math.hypot(...p.map((x, i) => x - observation.pointPx[i]));
        assert.ok(error < 3, `${nodes.get(observation.id).name} at ${view.timestamp}: ${error.toFixed(2)} pixel error`);
      }
    }
  } finally { disposeSystemScene(built.group); }
});
