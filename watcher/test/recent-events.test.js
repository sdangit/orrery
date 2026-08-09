import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecentEventsBuffer } from '../src/recent-events.js';

function evt(event, timestamp) {
  return { event, timestamp };
}

test('getRecent returns everything added within the window', () => {
  const buffer = createRecentEventsBuffer({ windowMs: 10000 });
  const now = Date.parse('2026-01-01T00:00:10Z');
  buffer.add([evt('Bounty', '2026-01-01T00:00:05Z'), evt('Scan', '2026-01-01T00:00:08Z')]);
  assert.equal(buffer.getRecent(now).length, 2);
});

test('events older than the window are trimmed out', () => {
  const buffer = createRecentEventsBuffer({ windowMs: 10000 });
  buffer.add([evt('Bounty', '2026-01-01T00:00:00Z')]); // will be 20s old
  const now = Date.parse('2026-01-01T00:00:20Z');
  assert.equal(buffer.getRecent(now).length, 0);
});

test('trimming is sticky — once aged out, an event does not reappear on a later call with an older `now`', () => {
  const buffer = createRecentEventsBuffer({ windowMs: 10000 });
  buffer.add([evt('Bounty', '2026-01-01T00:00:00Z')]);
  buffer.getRecent(Date.parse('2026-01-01T00:00:20Z')); // trims it out
  assert.equal(buffer.getRecent(Date.parse('2026-01-01T00:00:05Z')).length, 0);
});

test('accumulates across multiple add() calls, mirroring incremental polling', () => {
  const buffer = createRecentEventsBuffer({ windowMs: 60000 });
  buffer.add([evt('FSDJump', '2026-01-01T00:00:00Z')]);
  buffer.add([evt('Scan', '2026-01-01T00:00:01Z')]);
  buffer.add([evt('Bounty', '2026-01-01T00:00:02Z')]);
  const recent = buffer.getRecent(Date.parse('2026-01-01T00:00:03Z'));
  assert.deepEqual(recent.map((e) => e.event), ['FSDJump', 'Scan', 'Bounty']);
});

test('an event with an unparsable timestamp is dropped rather than kept forever', () => {
  const buffer = createRecentEventsBuffer({ windowMs: 10000 });
  buffer.add([evt('Scan', 'not-a-timestamp')]);
  assert.equal(buffer.getRecent(Date.now()).length, 0);
});
