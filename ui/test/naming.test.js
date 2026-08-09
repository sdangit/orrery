import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortDesignator } from '../src/naming.js';

const SYSTEM = 'Col 285 Sector TI-U b18-2';

test('strips the system-name prefix off a body name', () => {
  assert.equal(shortDesignator(`${SYSTEM} A 6`, SYSTEM), 'A 6');
  assert.equal(shortDesignator(`${SYSTEM} A 12 e a`, SYSTEM), 'A 12 e a');
});

test('the primary star (bare "A" suffix) still shortens correctly', () => {
  assert.equal(shortDesignator(`${SYSTEM} A`, SYSTEM), 'A');
});

test('a hand-named body with no shared prefix (e.g. Sol -> "Earth") passes through unchanged', () => {
  assert.equal(shortDesignator('Earth', 'Sol'), 'Earth');
});

test('handles missing inputs without throwing', () => {
  assert.equal(shortDesignator(undefined, SYSTEM), undefined);
  assert.equal(shortDesignator(`${SYSTEM} A 6`, undefined), `${SYSTEM} A 6`);
});
