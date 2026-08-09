import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySpotlight } from '../src/spotlight.js';

test('an ordinary already-discovered, already-mapped planet is not spotlighted', () => {
  const node = { kind: 'Planet', raw: { WasDiscovered: true, WasMapped: true, PlanetClass: 'Icy body', TerraformState: '' } };
  assert.deepEqual(classifySpotlight(node), { spotlighted: false, reasons: [] });
});

test('a body with no raw event (e.g. the implicit root) is not spotlighted', () => {
  assert.deepEqual(classifySpotlight({ kind: 'SystemBarycentre' }), { spotlighted: false, reasons: [] });
});

test('first discovery is flagged for any body kind that carries WasDiscovered', () => {
  for (const kind of ['Star', 'Planet', 'BeltCluster']) {
    const node = { kind, raw: { WasDiscovered: false, WasMapped: true } };
    const result = classifySpotlight(node);
    assert.equal(result.spotlighted, true);
    assert.ok(result.reasons.includes('first-discovery'), `kind=${kind}`);
  }
});

test('first mapping is flagged only for planets, not stars or belt clusters', () => {
  const planet = classifySpotlight({ kind: 'Planet', raw: { WasDiscovered: true, WasMapped: false } });
  assert.ok(planet.reasons.includes('first-mapping'));

  const star = classifySpotlight({ kind: 'Star', raw: { WasDiscovered: true, WasMapped: false } });
  assert.ok(!star.reasons.includes('first-mapping'), 'a star cannot be SAA-mapped, so this should not fire');
  assert.equal(star.spotlighted, false);

  const cluster = classifySpotlight({ kind: 'BeltCluster', raw: { WasDiscovered: true, WasMapped: false } });
  assert.ok(!cluster.reasons.includes('first-mapping'), 'belt clusters are never mappable');
});

test('Earthlike/Water/Ammonia worlds are flagged as high-value regardless of discovery status', () => {
  for (const planetClass of ['Earthlike body', 'Water world', 'Ammonia world']) {
    const node = { kind: 'Planet', raw: { WasDiscovered: true, WasMapped: true, PlanetClass: planetClass } };
    const result = classifySpotlight(node);
    assert.equal(result.spotlighted, true);
    assert.ok(result.reasons.includes('high-value-world'), planetClass);
  }
});

test('a non-empty TerraformState is flagged as terraformable', () => {
  const node = { kind: 'Planet', raw: { WasDiscovered: true, WasMapped: true, PlanetClass: 'Rocky body', TerraformState: 'Terraformable' } };
  const result = classifySpotlight(node);
  assert.equal(result.spotlighted, true);
  assert.deepEqual(result.reasons, ['terraformable']);
});

test('an empty TerraformState string does not count as terraformable', () => {
  const node = { kind: 'Planet', raw: { WasDiscovered: true, WasMapped: true, PlanetClass: 'Rocky body', TerraformState: '' } };
  assert.equal(classifySpotlight(node).spotlighted, false);
});

test('reasons can stack: an undiscovered, unmapped Earthlike world gets all three', () => {
  const node = { kind: 'Planet', raw: { WasDiscovered: false, WasMapped: false, PlanetClass: 'Earthlike body' } };
  const result = classifySpotlight(node);
  assert.equal(result.reasons.length, 3);
  assert.deepEqual(new Set(result.reasons), new Set(['first-discovery', 'first-mapping', 'high-value-world']));
});
