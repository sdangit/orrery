import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCommunityBodies } from '../src/community-client.js';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const input = { systemName: 'Sol', systemAddress: '10477373803', providers: ['edsm', 'spansh'] };

test('community fetch uses only the local endpoint and preserves string addresses', async () => {
  let called;
  const data = { edsm: { bodies: [], status: 'empty' }, spansh: { bodies: [{ bodyId: 0 }], status: 'ready' } };
  globalThis.fetch = async (url, options) => { called = { url, options }; return { ok: true, json: async () => data }; };
  const controller = new AbortController();
  assert.deepEqual(await fetchCommunityBodies({ ...input, systemAddress: '18446744073709551615' }, { signal: controller.signal }), data);
  assert.match(called.url, /^\/api\/community-bodies\?/);
  assert.ok(called.url.includes('18446744073709551615'));
  assert.equal(called.options.headers['X-Orrery-Community'], '1');
  assert.equal(called.options.signal, controller.signal);
});

test('disabled providers trigger no network request', async () => {
  globalThis.fetch = async () => { throw new Error('should not fetch'); };
  assert.deepEqual(await fetchCommunityBodies({ ...input, providers: [] }), {});
});

test('missing watcher, malformed response and cancellation return null', async () => {
  for (const mock of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => { throw new DOMException('Aborted', 'AbortError'); },
  ]) {
    globalThis.fetch = mock;
    assert.equal(await fetchCommunityBodies(input), null);
  }
});
