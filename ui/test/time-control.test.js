import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meanAnomalyAt } from '@orrery/shared';
import {
  createTimeControl, advance, resetToNow, useTimeReference, orbitalPeriod,
  playbackRate, changePlaybackSpeed, togglePause, reverseTime,
  formatEdDateTime, playbackDescription, DATE_LIMIT_MS,
} from '../src/time-control.js';

const body = (days, id = 1) => ({ id, name: `Body ${id}`, elements: { orbitalPeriodSec: days * 86400 } });
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('live clock tracks wall time even after a suspended frame loop', () => {
  const tc = createTimeControl(1000);
  advance(tc, 500);
  assert.equal(tc.simTimeMs, 1500);
  advance(tc, 16, 900000);
  assert.equal(tc.simTimeMs, 900000);
});

for (const days of [922.1, 10000000]) {
  test(`${days}-day orbit takes 30 seconds at reference speed and 15 at double speed`, () => {
    const tc = createTimeControl(0);
    useTimeReference(tc, body(days));
    advance(tc, 30000);
    near(tc.simTimeMs / 1000, days * 86400, 0.001);
    changePlaybackSpeed(tc, 2);
    advance(tc, 15000);
    near(tc.simTimeMs / 1000, 2 * days * 86400, 0.001);
    assert.equal(playbackDescription(tc), '1 reference orbit / 15 real seconds');
  });
}

test('the same clock preserves relative orbital periods through the real Kepler solver', () => {
  const tc = createTimeControl(0);
  useTimeReference(tc, body(922.1));
  advance(tc, 7500);
  const elements = { orbitalPeriodSec: 922.1 * 86400, epochMs: 0, meanAnomalyDeg: 0 };
  near(meanAnomalyAt(elements, tc.simTimeMs), Math.PI / 2);
  near(meanAnomalyAt({ ...elements, orbitalPeriodSec: elements.orbitalPeriodSec / 2 }, tc.simTimeMs), Math.PI);
});

test('pause freezes time and resume retains reference, multiplier, and direction', () => {
  const tc = createTimeControl(1000);
  useTimeReference(tc, body(100));
  changePlaybackSpeed(tc, 0.5);
  reverseTime(tc);
  const rate = playbackRate(tc);
  togglePause(tc);
  advance(tc, 10000);
  assert.equal(tc.simTimeMs, 1000);
  assert.equal(playbackRate(tc), 0);
  togglePause(tc);
  assert.equal(playbackRate(tc), rate);
  advance(tc, 1000);
  assert.equal(tc.simTimeMs, 1000 + rate * 1000);
});

test('reverse retraces time, including dates before the Unix epoch', () => {
  const tc = createTimeControl(0);
  useTimeReference(tc, body(10000000));
  advance(tc, 30000);
  reverseTime(tc);
  advance(tc, 30000);
  assert.equal(tc.simTimeMs, 0);
  advance(tc, 1000);
  assert.ok(tc.simTimeMs < 0);
});

test('return to live resets every playback setting', () => {
  const tc = createTimeControl(0);
  useTimeReference(tc, body(100));
  changePlaybackSpeed(tc, 16);
  reverseTime(tc);
  togglePause(tc);
  resetToNow(tc, 42);
  assert.deepEqual(tc, createTimeControl(42));
});

test('reference captures period and name; choosing a replacement preserves the current instant', () => {
  const tc = createTimeControl(123);
  const node = body(922.1, 0);
  assert.equal(useTimeReference(tc, node), true);
  node.elements.orbitalPeriodSec = 1;
  node.name = 'Changed';
  assert.equal(tc.reference.periodSec, 922.1 * 86400);
  assert.equal(tc.reference.id, 0);
  assert.equal(tc.reference.name, 'Body 0');
  changePlaybackSpeed(tc, 4);
  reverseTime(tc);
  togglePause(tc);
  useTimeReference(tc, body(10, 2));
  assert.equal(tc.simTimeMs, 123);
  assert.equal(tc.multiplier, 1);
  assert.equal(tc.direction, 1);
  assert.equal(tc.paused, false);
});

test('missing, zero and non-finite periods cannot start playback', () => {
  const tc = createTimeControl(123);
  for (const period of [undefined, null, 0, Infinity, NaN, '86400']) {
    const node = { elements: { orbitalPeriodSec: period } };
    assert.equal(orbitalPeriod(node), null);
    assert.equal(useTimeReference(tc, node), false);
  }
  assert.equal(orbitalPeriod(null), null);
  assert.deepEqual(tc, createTimeControl(123));
});

test('ED clock converts only the UTC year, including timezone and year boundaries', () => {
  assert.equal(formatEdDateTime(Date.parse('2026-11-13T14:05:09Z')), '3312-11-13 14:05:09 UTC');
  assert.equal(formatEdDateTime(Date.parse('2026-12-31T20:00:00-08:00')), '3313-01-01 04:00:00 UTC');
  assert.equal(formatEdDateTime(Date.parse('2024-02-29T12:34:56Z')), '3310-02-29 12:34:56 UTC');
  assert.equal(formatEdDateTime(Date.parse('2024-03-01T00:00:00Z')), '3310-03-01 00:00:00 UTC');
  assert.equal(formatEdDateTime(Date.parse('+030000-01-01T00:00:00Z')), '31286-01-01 00:00:00 UTC');
});

test('extreme playback pauses at the supported date boundary and can reverse away', () => {
  const tc = createTimeControl(DATE_LIMIT_MS - 100);
  useTimeReference(tc, body(10000000));
  advance(tc, 30000);
  assert.equal(tc.simTimeMs, DATE_LIMIT_MS);
  assert.equal(tc.paused, true);
  assert.notEqual(formatEdDateTime(tc.simTimeMs), 'Date unavailable');
  reverseTime(tc);
  togglePause(tc);
  advance(tc, 1000);
  assert.ok(tc.simTimeMs < DATE_LIMIT_MS);
  assert.equal(tc.paused, false);
});

test('invalid speed factors and elapsed intervals cannot corrupt the clock', () => {
  const tc = createTimeControl(123);
  useTimeReference(tc, body(10));
  for (const factor of [NaN, Infinity, -1, 0]) changePlaybackSpeed(tc, factor);
  assert.equal(tc.multiplier, 1);
  for (const dt of [NaN, Infinity, -100]) advance(tc, dt);
  assert.equal(tc.simTimeMs, 123);
});


test('retrograde reference periods use their magnitude without reversing the shared clock', () => {
  const tc = createTimeControl(0);
  useTimeReference(tc, body(-10));
  advance(tc, 30000);
  assert.equal(tc.simTimeMs, 10 * 86400 * 1000);
  assert.equal(tc.direction, 1);
});
