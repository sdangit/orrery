import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapEdgisBodies, mergeCommunityBodies } from '@orrery/shared';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from '../src/scene-builder.js';
import { primaryStarId } from '../src/primary-star.js';

const receivedAt = Date.parse('2026-11-15T01:27:00Z');
const providers = Object.fromEntries(['edgis', 'spansh', 'edsm'].map((source) => {
  const fixture = JSON.parse(readFileSync(new URL(`../../shared/test/fixtures/${source}-lft509.json`, import.meta.url)));
  return [source, { bodies: source === 'edgis' ? mapEdgisBodies(fixture) : fixture.bodies, receivedAt }];
}));
const { nodes } = mergeCommunityBodies(new Map(), providers);

for (const scaleMode of ['compact', 'distances', 'realistic']) {
  test(`LFT 509 renders all bodies and centers on Ross 54 in ${scaleMode} scale`, () => {
    const built = buildSystemScene(nodes, receivedAt, 'LFT 509', 'exploration', {}, { scaleMode });
    try {
      assert.equal(primaryStarId(nodes), 2);
      assert.ok(built.updatables.has(primaryStarId(nodes)));
      const physical = [...nodes.values()].filter((n) => ['Star', 'Planet'].includes(n.kind));
      assert.equal(physical.length, 29);
      for (const time of [receivedAt, receivedAt + 1e12]) {
        updateSystemScene(nodes, built.updatables, time, { scaleMode });
        for (const node of physical) {
          const entry = built.updatables.get(node.id);
          assert.ok(entry, `${node.name} must render`);
          assert.ok(entry.bodyGroup.position.toArray().every(Number.isFinite), node.name);
        }
      }
    } finally { disposeSystemScene(built.group); }
  });
}
