import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEdsmPlanetClass, mapEdsmTerraformState } from '../src/edsm-mapping.js';

test('mapEdsmPlanetClass maps every subType directly confirmed against the real Sol API response', () => {
  assert.equal(mapEdsmPlanetClass('Earth-like world'), 'Earthlike body');
  assert.equal(mapEdsmPlanetClass('Metal-rich body'), 'Metal rich body');
  assert.equal(mapEdsmPlanetClass('High metal content world'), 'High metal content body');
  assert.equal(mapEdsmPlanetClass('Rocky body'), 'Rocky body');
  assert.equal(mapEdsmPlanetClass('Icy body'), 'Icy body');
  assert.equal(mapEdsmPlanetClass('Rocky Ice world'), 'Rocky ice body');
  assert.equal(mapEdsmPlanetClass('Class I gas giant'), 'Sudarsky class I gas giant');
});

test('mapEdsmPlanetClass maps the two high-value classes not directly observed but sourced from EDSM\'s own stats page', () => {
  assert.equal(mapEdsmPlanetClass('Water world'), 'Water world');
  assert.equal(mapEdsmPlanetClass('Ammonia world'), 'Ammonia world');
});

test('mapEdsmPlanetClass maps gas giant classes II-V by the same "drop Sudarsky" pattern as class I', () => {
  assert.equal(mapEdsmPlanetClass('Class II gas giant'), 'Sudarsky class II gas giant');
  assert.equal(mapEdsmPlanetClass('Class V gas giant'), 'Sudarsky class V gas giant');
});

test('mapEdsmPlanetClass returns undefined (not a guess) for an unmapped subType', () => {
  assert.equal(mapEdsmPlanetClass('Some Unknown EDSM SubType'), undefined);
  assert.equal(mapEdsmPlanetClass(undefined), undefined);
});

test('mapEdsmTerraformState maps "Not terraformable" (confirmed real value) to empty string', () => {
  assert.equal(mapEdsmTerraformState('Not terraformable'), '');
});

test('mapEdsmTerraformState treats missing/undefined the same as not terraformable', () => {
  assert.equal(mapEdsmTerraformState(undefined), '');
});

test('mapEdsmTerraformState passes through any other (terraformable) value as-is', () => {
  assert.equal(mapEdsmTerraformState('Terraformable'), 'Terraformable');
});
