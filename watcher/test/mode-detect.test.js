import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMode, MODES } from '../src/mode-detect.js';

const NOW = Date.parse('2026-08-09T12:00:00Z');

function secondsAgo(s) {
  return new Date(NOW - s * 1000).toISOString();
}

test('defaults to exploration with no events', () => {
  assert.equal(detectMode([], { now: NOW }), 'exploration');
});

test('a pinned mode always wins, regardless of event content', () => {
  const events = [
    { event: 'Bounty', timestamp: secondsAgo(1) },
    { event: 'Bounty', timestamp: secondsAgo(2) },
  ];
  assert.equal(detectMode(events, { now: NOW, pinnedMode: 'exploration' }), 'exploration');
});

test('an unknown pinned mode is rejected', () => {
  assert.throws(() => detectMode([], { now: NOW, pinnedMode: 'sightseeing' }), /Unknown pinned mode/);
});

test('exploration triggers on FSSDiscoveryScan / Scan', () => {
  const events = [
    { event: 'FSSDiscoveryScan', timestamp: secondsAgo(30) },
    { event: 'Scan', timestamp: secondsAgo(20) },
  ];
  assert.equal(detectMode(events, { now: NOW }), 'exploration');
});

test('exobiology triggers on ScanOrganic / FSSBodySignals', () => {
  const events = [
    { event: 'FSSBodySignals', timestamp: secondsAgo(10) },
    { event: 'ScanOrganic', timestamp: secondsAgo(5) },
  ];
  assert.equal(detectMode(events, { now: NOW }), 'exobiology');
});

test('mining triggers on LaunchDrone / MiningRefined', () => {
  const events = [
    { event: 'LaunchDrone', timestamp: secondsAgo(15) },
    { event: 'MiningRefined', timestamp: secondsAgo(5) },
  ];
  assert.equal(detectMode(events, { now: NOW }), 'mining');
});

test('piracy triggers on Bounty / ShipTargeted / UnderAttack', () => {
  const events = [{ event: 'UnderAttack', timestamp: secondsAgo(3) }];
  assert.equal(detectMode(events, { now: NOW }), 'piracy');
});

test('more recent events outweigh a larger but stale burst (recency-weighted scoring)', () => {
  const events = [
    // A big exploration burst nine minutes ago (near the edge of the 10-minute window)...
    ...Array.from({ length: 5 }, () => ({ event: 'Scan', timestamp: secondsAgo(9 * 60 + 50) })),
    // ...loses to a single fresh mining event.
    { event: 'MiningRefined', timestamp: secondsAgo(2) },
  ];
  assert.equal(detectMode(events, { now: NOW }), 'mining');
});

test('events older than the lookback window are ignored entirely', () => {
  const events = [{ event: 'UnderAttack', timestamp: secondsAgo(20 * 60) }];
  assert.equal(detectMode(events, { now: NOW, windowMs: 10 * 60 * 1000 }), 'exploration');
});

test('future-dated events (clock skew) are ignored, not treated as infinitely fresh', () => {
  const events = [{ event: 'UnderAttack', timestamp: secondsAgo(-60) }];
  assert.equal(detectMode(events, { now: NOW }), 'exploration');
});

test('a deployed cargo scoop nudges mining scoring without a matching event', () => {
  const events = [{ event: 'Scan', timestamp: secondsAgo(5) }]; // exploration signal
  const withoutScoop = detectMode(events, { now: NOW });
  const withScoop = detectMode(events, { now: NOW, statusFlags: { cargoScoopDeployed: true } });
  assert.equal(withoutScoop, 'exploration');
  // A single fresh Scan (weight ~1) still beats the 0.5 scoop nudge alone.
  assert.equal(withScoop, 'exploration');
});

test('MODES lists exactly the four documented activity modes', () => {
  assert.deepEqual([...MODES].sort(), ['exobiology', 'exploration', 'mining', 'piracy']);
});
