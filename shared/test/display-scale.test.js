import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressDistance, compressRadius, compressOffset } from '../src/display-scale.js';

test('compressDistance maps 0 to 0', () => {
  assert.equal(compressDistance(0), 0);
});

test('compressDistance is strictly increasing (order-preserving) across the real range this project sees', () => {
  // ~1e6 m (tight moon orbit) up to ~5e12 m (this project's own wide binary separation).
  const samples = [1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 5e11, 1e12, 5e12];
  let prev = -Infinity;
  for (const metres of samples) {
    const d = compressDistance(metres);
    assert.ok(d > prev, `expected compressDistance(${metres})=${d} > previous ${prev}`);
    prev = d;
  }
});

test('compressDistance squashes six orders of magnitude of real range into a small display range', () => {
  const small = compressDistance(1e6);
  const huge = compressDistance(5e12);
  // The real ratio is 5e6:1; the display ratio should be nowhere close to that.
  assert.ok(huge / Math.max(small, 1e-9) < 50, `display ratio ${huge / small} was not compressed`);
});

test('compressDistance rejects negative distances', () => {
  assert.throws(() => compressDistance(-1), RangeError);
});

test('compressOffset preserves direction while compressing magnitude', () => {
  const offset = { x: 3e9, y: 0, z: 4e9 }; // 3-4-5 triangle, magnitude 5e9
  const compressed = compressOffset(offset);
  const realMag = Math.hypot(offset.x, offset.y, offset.z);
  const compressedMag = Math.hypot(compressed.x, compressed.y, compressed.z);
  assert.ok(compressedMag < realMag, 'compressed magnitude should be smaller');
  // direction unchanged: x:z ratio should still be 3:4
  assert.ok(Math.abs(compressed.x / compressed.z - offset.x / offset.z) < 1e-9);
});

test('compressOffset of a zero vector is a zero vector', () => {
  const compressed = compressOffset({ x: 0, y: 0, z: 0 });
  assert.deepEqual(compressed, { x: 0, y: 0, z: 0 });
});

test('custom options change the curve without breaking monotonicity', () => {
  const a = compressDistance(1e10, { gain: 4 });
  const b = compressDistance(1e10, { gain: 16 });
  assert.ok(b > a, 'higher gain should push the same real distance further out');
});

test('compressRadius is monotonic and keeps small real bodies visibly nonzero', () => {
  const moon = compressRadius(5e5); // ~500 km, a small moon
  const planet = compressRadius(6e6); // ~6000 km, Earth-ish
  const star = compressRadius(3e8); // ~300,000 km, a star
  assert.ok(moon > 0, 'even a small moon should render as a visible sphere');
  assert.ok(moon < planet);
  assert.ok(planet < star);
});

test('compressRadius rejects negative radii', () => {
  assert.throws(() => compressRadius(-1), RangeError);
});
