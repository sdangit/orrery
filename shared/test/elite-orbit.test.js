import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eliteOrbitElements, eliteKeplerianOffset } from '../src/elite-orbit.js';
import { meanAnomalyAt } from '../src/kepler.js';
import { mergeCommunityBodies, normalizeCommunityBodies } from '../src/community-backfill.js';

const elements = Object.freeze({ semiMajorAxis: 10, eccentricity: 0,
  inclinationDeg: 0, ascendingNodeDeg: 30, periapsisDeg: 70,
  meanAnomalyDeg: 10, orbitalPeriodSec: 360, epochMs: 0 });

test('Elite circular longitude is mean anomaly minus node and periapsis', () => {
  // 10 - 30 - 70 = -90 degrees: analytically -Y, not +110 degrees.
  const p = eliteKeplerianOffset(elements, 0);
  assert.ok(Math.abs(p.x) < 1e-12);
  assert.ok(Math.abs(p.y + 10) < 1e-12);
  assert.ok(Math.abs(p.z) < 1e-12);
  const quarter = eliteKeplerianOffset(elements, 90000);
  assert.ok(Math.abs(quarter.x - 10) < 1e-12);
  assert.ok(Math.abs(quarter.y) < 1e-12);
});

test('conversion reverses orientation angles, preserving phase, clock, period and source elements', () => {
  const converted = eliteOrbitElements(elements);
  assert.deepEqual(converted, { ...elements, inclinationDeg: -elements.inclinationDeg, ascendingNodeDeg: -30, periapsisDeg: -70 });
  assert.equal(elements.ascendingNodeDeg, 30);
  // Signed period still controls retrograde motion: another quarter turn goes to -X.
  const retrograde = eliteKeplerianOffset({ ...elements, orbitalPeriodSec: -360 }, 90000);
  assert.ok(Math.abs(retrograde.x + 10) < 1e-12);
  assert.ok(Math.abs(retrograde.y) < 1e-12);
});

test('positive Elite inclination places the quarter-orbit below the reference plane', () => {
  const raw = { ...elements, inclinationDeg: 30, ascendingNodeDeg: 0, periapsisDeg: 0, meanAnomalyDeg: 90 };
  const p = eliteKeplerianOffset(raw, 0);
  assert.ok(Math.abs(p.x) < 1e-12);
  assert.ok(Math.abs(p.y - 5 * Math.sqrt(3)) < 1e-12);
  assert.ok(Math.abs(p.z + 5) < 1e-12);
  assert.equal(raw.inclinationDeg, 30);
});

const captured = JSON.parse(readFileSync(new URL('./fixtures/altair-live-orbits.json', import.meta.url)));
test('all-provider Altair merge keeps complete orbital sets and their original phase epochs', () => {
  const before = structuredClone(captured);
  const journal = new Map(captured.journalNodes.map(n => [n.id, n]));
  const { nodes, diagnostics } = mergeCommunityBodies(journal, captured.providers);
  assert.deepEqual(diagnostics, []);
  for (const id of [1, 2, 3, 4, 5]) {
    const node = nodes.get(id);
    assert.equal(node.orbitQuality, 'propagated');
    assert.equal(node.orbitSource, id === 3 ? 'journal' : 'spansh');
    const original = id === 3 ? journal.get(id).elements
      : normalizeCommunityBodies('spansh', captured.providers.spansh.bodies).find(n => n.id === id).elements;
    assert.deepEqual(node.elements, original);
    // EDSM / EDGIS have useful metadata, but no complete phase+epoch here.
    for (const source of ['edsm', 'edgis']) {
      assert.equal(normalizeCommunityBodies(source, captured.providers[source].bodies)
        .find(n => n.id === id).orbitQuality, 'approximate');
    }
  }
  assert.deepEqual(captured, before, 'merging must not rewrite provider fields');
});

test('fresh Darkes journal phase agrees with the older Spansh epoch after propagation', () => {
  const journal = captured.journalNodes.find(n => n.id === 3).elements;
  const spansh = normalizeCommunityBodies('spansh', [captured.priorSpanshDarkes])[0].elements;
  assert.notEqual(journal.epochMs, spansh.epochMs);
  const epoch = Date.parse('2026-11-15T06:50:39Z');
  const difference = Math.abs(meanAnomalyAt(journal, epoch) - meanAnomalyAt(spansh, epoch));
  assert.ok(difference * 180 / Math.PI < 0.00001);
});
