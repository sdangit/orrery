import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeControl, advance, resetToNow, warpFromSlider, formatWarp, WARP_SLIDER_MAX } from '../src/time-control.js';

test('at warp 1, simulated time advances exactly with real time', () => {
  const tc = createTimeControl(1000);
  advance(tc, 500);
  assert.equal(tc.simTimeMs, 1500);
});

test('at warp 100, simulated time advances 100x real time', () => {
  const tc = createTimeControl(0);
  tc.warp = 100;
  advance(tc, 10);
  assert.equal(tc.simTimeMs, 1000);
});

test('resetToNow snaps simulated time back to the present without touching warp', () => {
  const tc = createTimeControl(0);
  tc.warp = 5000;
  advance(tc, 100000);
  resetToNow(tc, 42);
  assert.equal(tc.simTimeMs, 42);
  assert.equal(tc.warp, 5000);
});

test('warpFromSlider maps the endpoints to 1x and 100,000x', () => {
  assert.equal(warpFromSlider(0), 1);
  assert.equal(warpFromSlider(WARP_SLIDER_MAX), 100000);
});

test('warpFromSlider is monotonically non-decreasing across the whole slider range', () => {
  let prev = 0;
  for (let v = 0; v <= WARP_SLIDER_MAX; v++) {
    const w = warpFromSlider(v);
    assert.ok(w >= prev, `warp decreased at slider=${v}`);
    prev = w;
  }
});

test('warpFromSlider gives the low range meaningful resolution (midpoint is ~316x, not ~50,000x)', () => {
  const mid = warpFromSlider(WARP_SLIDER_MAX / 2);
  assert.ok(mid < 1000, `expected a log curve; midpoint was ${mid}`);
});

test('formatWarp renders with a thousands separator and the multiplication sign', () => {
  assert.equal(formatWarp(1), '1×');
  assert.equal(formatWarp(100000), (100000).toLocaleString() + '×');
});
