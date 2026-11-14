import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies, normalizeCommunityBodies, EARTH_GRAVITY } from '../src/community-backfill.js';
import { absolutePosition } from '../src/orbit-position.js';
import { meanAnomalyAt } from '../src/kepler.js';

const read = (source) => JSON.parse(readFileSync(new URL(`./fixtures/${source}-sol.json`, import.meta.url))).bodies;
const spansh = read('spansh');
const edsm = read('edsm');
const receivedAt = Date.parse('2026-11-14T03:16:11Z');
const providers = { spansh: { bodies: spansh, receivedAt }, edsm: { bodies: edsm, receivedAt } };
const empty = () => new Map([[0, { id: 0, kind: 'SystemBarycentre', parentId: null, elements: null }]]);

test('real Sol responses repair Pluto/Charon parent chains and yield finite positions', () => {
  const { nodes, diagnostics } = mergeCommunityBodies(empty(), providers);
  assert.deepEqual(diagnostics, []);
  assert.equal(nodes.get(31).kind, 'Barycentre');
  assert.equal(nodes.get(31).parentId, 0);
  for (const id of [32, 33]) {
    assert.equal(nodes.get(id).parentId, 31);
    assert.equal(nodes.get(id).positionQuality, 'propagated');
    assert.ok(Object.values(absolutePosition(nodes, id, receivedAt)).every(Number.isFinite));
  }
  assert.equal(nodes.get(0).kind, 'Star');
  assert.equal(nodes.get(0).isMainStar, true);
  assert.equal(nodes.get(0).isBackfill, true);
  assert.deepEqual(nodes.get(31).children, [32, 33]);
});

test('Earth uses its anomaly timestamp, not the later body updateTime or fetch time', () => {
  const earth = mergeCommunityBodies(empty(), providers).nodes.get(3);
  assert.equal(earth.elements.epochMs, Date.parse('2026-11-13T18:24:14Z'));
  assert.equal(earth.recordUpdates.spansh, Date.parse('2026-11-13T22:30:25Z'));
  assert.equal(earth.orbitSource, 'spansh');
  assert.ok(Math.abs(meanAnomalyAt(earth.elements, earth.elements.epochMs) * 180 / Math.PI - 162.248968) < 1e-8);
});

test('observed provider units normalize to metres, seconds, SI gravity and light-seconds', () => {
  const sp = normalizeCommunityBodies('spansh', spansh, receivedAt);
  const ed = normalizeCommunityBodies('edsm', edsm, receivedAt);
  const earth = sp.find((b) => b.id === 3);
  assert.ok(Math.abs(earth.elements.semiMajorAxis - 149597870700) < 200000);
  assert.equal(earth.elements.orbitalPeriodSec, spansh.find((b) => b.bodyId === 3).orbitalPeriod * 86400);
  assert.equal(earth.raw.DistanceFromArrivalLS, 506.954413);
  assert.equal(earth.raw.Radius, 6378100);
  assert.equal(earth.raw.SurfaceGravity, 0.999057713877842 * EARTH_GRAVITY);
  assert.ok(sp[0].raw.Radius > 6e8);
  const spRing = sp.find((b) => b.raw.Rings)?.raw.Rings[0];
  const edRing = ed.find((b) => b.raw.Rings)?.raw.Rings[0];
  assert.deepEqual(spRing, edRing);
  assert.equal(spRing.InnerRad, 92000000);
});

test('a missing or invalid phase timestamp never becomes a propagated position', () => {
  for (const timestamps of [undefined, {}, { meanAnomaly: 'invalid' }]) {
    const modified = spansh.map((b) => b.bodyId === 3 ? { ...b, timestamps } : b);
    const earth = mergeCommunityBodies(empty(), { spansh: { bodies: modified, receivedAt } }).nodes.get(3);
    assert.equal(earth.orbitQuality, 'approximate');
    assert.equal(earth.elements.epochMs, receivedAt);
    assert.equal(earth.elements.meanAnomalyDeg, 0);
  }
});

test('EDSM-only data stays approximate and a missing barycentre is not attached to origin', () => {
  const first = mergeCommunityBodies(empty(), { edsm: providers.edsm }, { now: 1 });
  const second = mergeCommunityBodies(empty(), { edsm: providers.edsm }, { now: 999999 });
  assert.equal(first.nodes.get(3).positionQuality, 'approximate');
  assert.deepEqual(first.nodes.get(3).elements, second.nodes.get(3).elements);
  assert.equal(first.nodes.get(32).positionQuality, 'unresolved');
  assert.throws(() => absolutePosition(first.nodes, 32, receivedAt), /Orbital elements missing for body 31/);
});

test('journal fields and complete orbital group win; community only fills missing metadata', () => {
  const original = mergeCommunityBodies(empty(), providers).nodes.get(3);
  const elements = { ...original.elements, semiMajorAxis: 12345, meanAnomalyDeg: 30 };
  const scan = { id: 3, kind: 'Planet', name: 'Journal Earth', parentId: 0, landable: false,
    elements, raw: { Parents: [{ Star: 0 }], SurfaceTemperature: 0, WasDiscovered: false, WasMapped: false } };
  const journal = empty(); journal.set(3, scan);
  const before = structuredClone(scan);
  const earth = mergeCommunityBodies(journal, providers).nodes.get(3);
  assert.deepEqual(scan, before);
  assert.deepEqual(earth.elements, elements);
  assert.equal(earth.name, 'Journal Earth');
  assert.equal(earth.raw.SurfaceTemperature, 0);
  assert.equal(earth.raw.WasDiscovered, false);
  assert.equal(earth.raw.WasMapped, false);
  assert.equal(earth.isBackfill, undefined);
  assert.equal(earth.orbitSource, 'journal');
  assert.equal(earth.fieldSources['raw.Radius'], 'spansh');
  assert.equal(earth.fieldSources['raw.SurfaceTemperature'], 'journal');
});

test('incomplete journal orbit uses a whole provider solution, never patched individual elements', () => {
  const journal = empty();
  journal.set(3, { id: 3, kind: 'Planet', parentId: 0, elements: { semiMajorAxis: 12345 }, raw: {} });
  const earth = mergeCommunityBodies(journal, providers).nodes.get(3);
  assert.equal(earth.orbitSource, 'spansh');
  assert.ok(earth.elements.semiMajorAxis > 1e11);
  assert.equal(earth.elements.epochMs, Date.parse('2026-11-13T18:24:14Z'));
});

test('unknown parents, cycles, conflicting parents and missing orbital elements are diagnosed', () => {
  const proto = spansh.find((b) => b.bodyId === 3);
  for (const [bodies, pattern] of [
    [[{ ...proto, parents: undefined }], /unknown/],
    [[{ ...proto, parents: [{ Planet: 3 }] }], /Cycle/],
    [[{ ...proto }, { ...proto, parents: [{ Star: 9 }] }], /Conflicting/],
    [[{ ...proto, orbitalPeriod: 0 }], /Orbital elements missing/],
  ]) {
    const result = mergeCommunityBodies(empty(), { spansh: { bodies, receivedAt } });
    assert.equal(result.nodes.get(3).positionQuality, 'unresolved');
    assert.match(result.nodes.get(3).positionIssue, pattern);
    assert.throws(() => absolutePosition(result.nodes, 3, receivedAt));
  }
});

test('position quality reflects approximate ancestors even if the body itself is scanned', () => {
  const approximateBarycentre = { ...spansh.find((b) => b.bodyId === 31), timestamps: {} };
  const bodies = spansh.map((b) => b.bodyId === 31 ? approximateBarycentre : b);
  const result = mergeCommunityBodies(empty(), { spansh: { bodies, receivedAt } });
  assert.equal(result.nodes.get(32).orbitQuality, 'propagated');
  assert.equal(result.nodes.get(32).positionQuality, 'approximate');
});

test('one missing provider still returns usable data; invalid IDs and NaN elements are rejected', () => {
  const bodies = [...spansh, { ...spansh[0], bodyId: null }, { ...spansh[0], bodyId: -1 }, null];
  const result = mergeCommunityBodies(empty(), { spansh: { bodies, receivedAt }, edsm: { status: 'unavailable', bodies: [] } });
  assert.equal(result.nodes.size, spansh.length);
  const invalid = normalizeCommunityBodies('spansh', [{ ...spansh[1], orbitalEccentricity: Infinity }]);
  assert.equal(invalid[0].elements, null);
});

test('negative orbital periods preserve retrograde motion instead of hiding the body', () => {
  const retrograde = { ...spansh.find((b) => b.bodyId === 3), orbitalPeriod: -5.8768539241088 };
  const { nodes } = mergeCommunityBodies(empty(), { spansh: { bodies: [spansh[0], retrograde], receivedAt } });
  const body = nodes.get(3);
  assert.equal(body.positionQuality, 'propagated');
  assert.ok(body.elements.orbitalPeriodSec < 0);
  assert.ok(Object.values(absolutePosition(nodes, 3, receivedAt)).every(Number.isFinite));
});

test('malformed parent entries are not skipped to attach the body to a distant ancestor', () => {
  const body = { ...spansh.find((b) => b.bodyId === 3), parents: [{ Planet: null }, { Star: 0 }] };
  const { nodes } = mergeCommunityBodies(empty(), { spansh: { bodies: [spansh[0], body], receivedAt } });
  assert.equal(nodes.get(3).positionIssue, 'Invalid parent chain');
  assert.throws(() => absolutePosition(nodes, 3, receivedAt), /Invalid parent/);
});
