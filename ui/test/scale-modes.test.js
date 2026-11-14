import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScaleMode, SCALE_MODES } from '../src/scale-modes.js';

test('saved scale modes take precedence while old true-distance preferences migrate', () => {
  assert.equal(resolveScaleMode(null, 'true'), 'distances');
  assert.equal(resolveScaleMode(null, 'false'), 'compact');
  assert.equal(resolveScaleMode('realistic', 'false'), 'realistic');
  assert.equal(resolveScaleMode('compact', 'true'), 'compact');
  assert.equal(resolveScaleMode('unknown'), 'compact');
  assert.equal(resolveScaleMode('__proto__'), 'compact');
  for (const settings of Object.values(SCALE_MODES)) {
    assert.ok(!settings.trueSizes || settings.trueDistances, 'physical sizes require physical distances');
  }
});
