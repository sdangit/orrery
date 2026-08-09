import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEdsmBodies } from '../src/edsm-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('returns the bodies array on a successful response', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ bodies: [{ bodyId: 0, name: 'Sol' }] }),
  });
  const bodies = await fetchEdsmBodies('Sol');
  assert.deepEqual(bodies, [{ bodyId: 0, name: 'Sol' }]);
});

test('returns null on a non-ok HTTP response, not a throw', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const bodies = await fetchEdsmBodies('Some Nonexistent System');
  assert.equal(bodies, null);
});

test('returns null if fetch itself rejects (offline, DNS failure, etc)', async () => {
  globalThis.fetch = async () => { throw new Error('network unreachable'); };
  const bodies = await fetchEdsmBodies('Sol');
  assert.equal(bodies, null);
});

test('returns null on malformed JSON', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } });
  const bodies = await fetchEdsmBodies('Sol');
  assert.equal(bodies, null);
});

test('returns null when the response has no bodies array at all', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'system not found' }) });
  const bodies = await fetchEdsmBodies('Sol');
  assert.equal(bodies, null);
});

test('the system name is URL-encoded in the request', async () => {
  let requestedUrl = null;
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ bodies: [] }) };
  };
  await fetchEdsmBodies('Col 285 Sector TI-U b18-2');
  assert.ok(requestedUrl.includes(encodeURIComponent('Col 285 Sector TI-U b18-2')));
});

test('the request is wired to an AbortSignal (so a slow response can be cut off rather than hang forever)', async () => {
  let sawSignal = null;
  globalThis.fetch = async (url, options) => {
    sawSignal = options?.signal;
    return { ok: true, json: async () => ({ bodies: [] }) };
  };
  await fetchEdsmBodies('Sol');
  assert.ok(sawSignal instanceof AbortSignal);
  assert.equal(sawSignal.aborted, false);
});

test('an aborted signal is treated the same as any other failure — returns null, not a throw', async () => {
  globalThis.fetch = async (url, options) => {
    if (options.signal.aborted) throw new DOMException('aborted', 'AbortError');
    throw new DOMException('aborted', 'AbortError'); // fetchEdsmBodies's timeout would call abort(); simulate the resulting rejection directly rather than waiting 8s for it to actually fire
  };
  const bodies = await fetchEdsmBodies('Sol');
  assert.equal(bodies, null);
});
