import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityDataService, parseCommunityRequest } from '../src/community-data.js';
import { parseJsonPreservingIntegers, systemAddressString } from '../src/json-integers.js';
import { parseJournalLines } from '../src/journal-parser.js';

const input = { systemName: 'Sol', systemAddress: '10477373803', providers: ['edsm', 'spansh'] };
const system = { name: 'Sol', id64: 10477373803, bodies: [{ bodyId: 0, name: 'Sol', type: 'Star', stations: ['unused'] }] };
const response = (source, value = system) => ({ ok: true, text: async () => JSON.stringify(source === 'spansh' ? { system: value } : value) });

test('provider calls use fixed URLs, verify identity, and trim unrelated data', async () => {
  const calls = [];
  const service = createCommunityDataService({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return response(url.includes('spansh') ? 'spansh' : 'edsm');
  } });
  const result = await service.get(input);
  assert.deepEqual(calls.map((c) => c.url), ['https://www.edsm.net/api-system-v1/bodies?systemName=Sol', 'https://spansh.co.uk/api/dump/10477373803']);
  assert.equal(result.spansh.status, 'ready');
  assert.equal(result.edsm.bodies[0].stations, undefined);
  assert.ok(calls.every((c) => c.options.signal instanceof AbortSignal && c.options.redirect === 'error'));
  service.close();
});

test('provider failure is isolated; successful data is cached and concurrent calls coalesce', async () => {
  let calls = 0;
  let now = 100;
  const service = createCommunityDataService({ now: () => now, cacheMs: 1000, failureCacheMs: 100, fetchImpl: async (url) => {
    calls++;
    if (url.includes('edsm')) throw new Error('offline');
    return response('spansh');
  } });
  const [first, second] = await Promise.all([service.get(input), service.get(input)]);
  assert.equal(calls, 2);
  assert.equal(first.edsm.status, 'unavailable');
  assert.equal(first.spansh.status, 'ready');
  assert.deepEqual(first, second);
  now += 200;
  await service.get(input);
  assert.equal(calls, 3, 'only the failed provider expires early');
  now += 2000;
  await service.get(input);
  assert.equal(calls, 5);
  service.close();
});

test('timeouts abort providers independently and return a usable result', async () => {
  const service = createCommunityDataService({ timeoutMs: 10, fetchImpl: async (url, { signal }) => {
    if (url.includes('edsm')) return response('edsm');
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  const result = await service.get(input);
  assert.equal(result.edsm.status, 'ready');
  assert.equal(result.spansh.status, 'unavailable');
  service.close();
});

test('mismatched systems, malformed JSON and HTTP errors do not supply body data', async () => {
  for (const mock of [
    response('spansh', { ...system, id64: 123 }),
    response('spansh', { ...system, name: 'Different' }),
    { ok: true, text: async () => '{broken' },
    { ok: false },
  ]) {
    const service = createCommunityDataService({ fetchImpl: async () => mock });
    const result = await service.get({ ...input, providers: ['spansh'] });
    assert.equal(result.spansh.bodies.length, 0);
    assert.notEqual(result.spansh.status, 'ready');
    service.close();
  }
});

test('only requested providers run, and Spansh requires a known address', async () => {
  let calls = 0;
  const service = createCommunityDataService({ fetchImpl: async () => { calls++; return response('edsm'); } });
  const result = await service.get({ systemName: 'Sol', providers: ['spansh'] });
  assert.equal(result.spansh.status, 'missing-address');
  assert.equal(calls, 0);
  await service.get({ ...input, providers: ['edsm'] });
  assert.equal(calls, 1);
  service.close();
});

test('large integer IDs survive provider and journal parsing without rounding', () => {
  const text = '{"SystemAddress":18446744073709551615,"BodyID":3,"x":1.2,"description":"12345678901234567890 and \\"quoted\\""}';
  const parsed = parseJsonPreservingIntegers(text);
  assert.equal(parsed.SystemAddress, '18446744073709551615');
  assert.equal(parsed.BodyID, 3);
  assert.equal(parsed.x, 1.2);
  assert.equal(parseJournalLines(text)[0].SystemAddress, parsed.SystemAddress);
  assert.equal(systemAddressString(18446744073709551615), null);
  assert.equal(systemAddressString('18446744073709551616'), null);
  assert.equal(systemAddressString(parsed.SystemAddress), parsed.SystemAddress);
});

test('request validation excludes arbitrary endpoints and malformed system addresses', () => {
  for (const params of [
    'systemName=Sol&providers=https://example.org',
    'systemName=Sol&providers=spansh&systemAddress=../123',
    'systemName=Sol&providers=spansh&systemAddress=18446744073709551616',
    'systemName=&providers=edsm',
  ]) assert.throws(() => parseCommunityRequest(new URLSearchParams(params)));
});
