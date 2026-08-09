import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyIcon, starColor, planetColor } from '../src/body-visuals.js';

test('a star gets the star icon regardless of subtype', () => {
  assert.equal(bodyIcon({ kind: 'Star' }), '✦');
});

test('a non-landable, non-moon planet gets the plain planet icon', () => {
  assert.equal(bodyIcon({ kind: 'Planet', isMoon: false, landable: false }), '○');
});

test('a landable, non-moon planet gets the landable planet icon', () => {
  assert.equal(bodyIcon({ kind: 'Planet', isMoon: false, landable: true }), '◉');
});

test('a non-landable moon gets a distinct, smaller-looking icon than a non-landable planet', () => {
  const moonIcon = bodyIcon({ kind: 'Planet', isMoon: true, landable: false });
  const planetIcon = bodyIcon({ kind: 'Planet', isMoon: false, landable: false });
  assert.notEqual(moonIcon, planetIcon);
});

test('a landable moon gets a distinct icon from a landable planet', () => {
  const moonIcon = bodyIcon({ kind: 'Planet', isMoon: true, landable: true });
  const planetIcon = bodyIcon({ kind: 'Planet', isMoon: false, landable: true });
  assert.notEqual(moonIcon, planetIcon);
});

test('a body kind that is neither Star nor Planet (Barycentre, BeltCluster) gets no icon', () => {
  assert.equal(bodyIcon({ kind: 'Barycentre' }), '');
  assert.equal(bodyIcon({ kind: 'BeltCluster' }), '');
});

test('landable status of null/undefined is treated the same as false (not landable)', () => {
  assert.equal(bodyIcon({ kind: 'Planet', isMoon: false, landable: null }), '○');
  assert.equal(bodyIcon({ kind: 'Planet', isMoon: false }), '○');
});

test('starColor falls back to the default for an unlisted star type', () => {
  assert.equal(typeof starColor('ZZ'), 'number');
});

test('planetColor falls back to the default for an unlisted planet class', () => {
  assert.equal(typeof planetColor('Some Unknown Class'), 'number');
});
