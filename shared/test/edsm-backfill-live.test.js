// A genuine network test against the real EDSM API, using this project's own
// demo system — not a mock. Separate from edsm-backfill.test.js so a flaky/
// offline network doesn't fail the core unit suite. Skips its assertions
// (with a warning, not a failure) if the network is unreachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildBackfillNodes } from '../src/edsm-backfill.js';
import { displayPosition } from '../src/display-position.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoSystem = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'ui', 'src', 'data', 'demo-system.json'), 'utf8'),
);

test('EDSM backfill merges cleanly against this project\'s own real demo system', { skip: process.env.ORRERY_LIVE_API_TESTS !== '1' }, async () => {
  let response;
  try {
    response = await fetch(`https://www.edsm.net/api-system-v1/bodies?systemName=${encodeURIComponent(demoSystem.systemName)}`);
  } catch {
    console.warn('edsm-backfill-live: no network reachable, skipping assertions');
    return;
  }
  if (!response.ok) {
    console.warn('edsm-backfill-live: EDSM request failed, skipping assertions');
    return;
  }
  const { bodies: edsmBodies } = await response.json();
  assert.ok(Array.isArray(edsmBodies) && edsmBodies.length > 0, 'expected EDSM to know this real system');

  const scannedNodes = new Map(demoSystem.nodes.map((n) => [n.id, n]));
  const merged = buildBackfillNodes(scannedNodes, edsmBodies);

  // Every real scanned node must survive completely untouched.
  for (const [id, node] of scannedNodes) {
    assert.equal(merged.get(id).name, node.name);
    assert.deepEqual(merged.get(id).elements, node.elements);
    for (const [key, value] of Object.entries(node.raw ?? {})) assert.deepEqual(merged.get(id).raw[key], value);
  }

  // The primary star's position must always resolve (it's the root of the
  // chain everything else builds on). Other bodies' positions may legitimately
  // throw if EDSM references a parent not present in this response — that's
  // the same "orphan" tolerance the renderer already handles (see
  // scene-builder.js's try/catch), not something this data layer must prevent.
  const now = Date.now();
  assert.doesNotThrow(() => displayPosition(merged, 1, now));

  let resolvable = 0;
  for (const id of merged.keys()) {
    try {
      displayPosition(merged, id, now);
      resolvable += 1;
    } catch {
      // tolerated — see comment above
    }
  }
  assert.ok(resolvable > merged.size * 0.9, `expected the vast majority of ${merged.size} bodies to resolve a position; only ${resolvable} did`);
});
