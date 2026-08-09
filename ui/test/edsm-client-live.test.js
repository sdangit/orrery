// A genuine network test against the real EDSM API, not a mock — separate
// from edsm-client.test.js so a flaky/offline network doesn't fail the core
// unit suite. Skipped automatically if there's no network (fetch throws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEdsmBodies } from '../src/edsm-client.js';

test('fetchEdsmBodies against the real EDSM API for Sol returns real bodies', { skip: process.env.CI ? 'no network in CI' : false }, async () => {
  const bodies = await fetchEdsmBodies('Sol');
  if (bodies === null) {
    console.warn('edsm-client-live: no network reachable, skipping assertions');
    return;
  }
  assert.ok(Array.isArray(bodies));
  assert.ok(bodies.length > 5, 'Sol has many known bodies');
  const sol = bodies.find((b) => b.name === 'Sol');
  assert.ok(sol, 'expected Sol itself in the body list');
  assert.equal(sol.bodyId, 0);
  assert.equal(sol.type, 'Star');
});
