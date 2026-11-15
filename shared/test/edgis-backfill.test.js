import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapEdgisBodies, mergeCommunityBodies, normalizeCommunityBodies, absolutePosition } from '../src/index.js';

const read = (source) => JSON.parse(readFileSync(new URL(`./fixtures/${source}-lft509.json`, import.meta.url)));
const receivedAt = Date.parse('2026-11-15T01:27:00Z');
const native = read('edgis');
const providers = Object.fromEntries(['edsm', 'spansh', 'edgis'].map((source) => [source, {
  bodies: source === 'edgis' ? mapEdgisBodies(native) : read(source).bodies, receivedAt,
}]));

test('EDGIS native units, journal enums, barycentres and rings map without synthetic bodies', () => {
  const nodes = normalizeCommunityBodies('edgis', providers.edgis.bodies, receivedAt);
  const ross = nodes.find((n) => n.id === 2);
  assert.equal(nodes.length, 31); // 29 physical bodies + 2 barycentres
  assert.equal(ross.raw.Radius, 402107136);
  assert.equal(ross.raw.StarType, 'M');
  assert.equal(ross.raw.DistanceFromArrivalLS, 0);
  assert.equal(ross.raw.AxialTilt, 0.21691);
  assert.ok(Math.abs(ross.elements.semiMajorAxis - 1669457614421.8445) < 0.001);
  assert.ok(Math.abs(ross.elements.orbitalPeriodSec - 4264774024.486542) < 0.000001);
  assert.equal(nodes.find((n) => n.id === 11).raw.PlanetClass, 'Sudarsky class I gas giant');
  assert.equal(nodes.find((n) => n.id === 10).raw.PlanetClass, 'Rocky ice body');
  assert.equal(nodes.find((n) => n.id === 11).raw.Rings.length, 2);
  assert.equal(nodes.find((n) => n.id === 11).raw.Rings[0].InnerRad, 102020000);
  assert.equal(nodes.find((n) => n.id === 16).kind, 'Barycentre');
});

test('all providers retain signed axial tilt in radians; a journal zero wins', () => {
  for (const source of ['spansh', 'edgis', 'edsm']) {
    const body = providers[source].bodies.find(b => b.axialTilt < 0);
    assert.ok(body, source);
    const normalized = normalizeCommunityBodies(source, [body], receivedAt)[0];
    assert.equal(normalized.raw.AxialTilt, body.axialTilt);
  }
  const journal = new Map([[2, { id: 2, kind: 'Star', parentId: 0, raw: { Parents: [{ Null: 0 }], AxialTilt: 0 } }]]);
  const merged = mergeCommunityBodies(journal, providers).nodes.get(2);
  assert.equal(merged.raw.AxialTilt, 0);
  assert.equal(merged.fieldSources['raw.AxialTilt'], 'journal');
  assert.equal(normalizeCommunityBodies('spansh', [{ bodyId: 1, type: 'Planet', axialTilt: NaN }])[0].raw.AxialTilt, undefined);
});

test('EDGIS record freshness never becomes a measured phase epoch', () => {
  const ross = normalizeCommunityBodies('edgis', providers.edgis.bodies, receivedAt).find((n) => n.id === 2);
  assert.equal(ross.orbitQuality, 'approximate');
  assert.equal(ross.elements.epochMs, receivedAt);
  assert.equal(ross.elements.meanAnomalyDeg, 166.236227);
  assert.equal(ross.recordUpdatedAt, Date.parse('2026-10-29T23:54:41Z'));
  const repeat = mergeCommunityBodies(new Map(), { edgis: providers.edgis }, { now: receivedAt + 100000 });
  assert.deepEqual(repeat.nodes.get(2).elements, ross.elements);
});

test('LFT 509 gains its missing arrival star and every body can be positioned', () => {
  const before = mergeCommunityBodies(new Map(), { edsm: providers.edsm, spansh: providers.spansh });
  assert.equal(before.nodes.has(2), false);
  assert.equal(before.nodes.get(26).positionQuality, 'unresolved');
  const { nodes, diagnostics } = mergeCommunityBodies(new Map(), providers);
  assert.deepEqual(diagnostics, []);
  assert.equal(nodes.get(2).name, 'Ross 54');
  assert.equal(nodes.get(2).parentId, 0);
  assert.equal(nodes.get(26).parentId, 2);
  assert.equal(nodes.get(2).phaseReferenceBodyId, 1);
  assert.equal(nodes.get(2).orbitQuality, 'approximate');
  assert.equal(nodes.get(26).positionQuality, 'approximate');
  assert.equal(nodes.get(1).orbitSource, 'spansh');
  for (const t of [receivedAt, receivedAt + 1e12, receivedAt - 1e12]) {
    for (const node of nodes.values()) {
      assert.ok(Object.values(absolutePosition(nodes, node.id, t)).every(Number.isFinite), node.name);
    }
    const a = absolutePosition(nodes, 1, t), b = absolutePosition(nodes, 2, t);
    const dot = (a.x*b.x + a.y*b.y + a.z*b.z) / Math.hypot(a.x,a.y,a.z) / Math.hypot(b.x,b.y,b.z);
    assert.ok(dot < -0.99999999, 'binary components stay on opposite sides of the barycentre');
  }
});

test('journal data wins and EDGIS does not replace a known phase or infer an unrelated orbit', () => {
  const base = mergeCommunityBodies(new Map(), providers).nodes.get(2);
  const elements = { ...base.elements, meanAnomalyDeg: 20, epochMs: receivedAt };
  const journal = new Map([[2, { id: 2, kind: 'Star', name: 'Scanned Ross', parentId: 0,
    elements, raw: { Parents: [{ Null: 0 }], Radius: 12345, WasDiscovered: false } }]]);
  const merged = mergeCommunityBodies(journal, providers).nodes.get(2);
  assert.equal(merged.orbitSource, 'journal');
  assert.deepEqual(merged.elements, elements);
  assert.equal(merged.raw.Radius, 12345);
  assert.equal(merged.raw.WasDiscovered, false);
  assert.equal(merged.phaseReferenceBodyId, undefined);
  for (const change of [{ argOfPeriapsis: 10 }, { orbitalPeriod: 200 }, { ascendingNode: undefined }]) {
    const edgis = { ...providers.edgis, bodies: providers.edgis.bodies.map((b) => b.bodyId === 2 ? { ...b, ...change } : b) };
    const ross = mergeCommunityBodies(new Map(), { ...providers, edgis }).nodes.get(2);
    assert.equal(ross.phaseReferenceBodyId, undefined);
    assert.equal(ross.elements.epochMs, receivedAt);
  }
});
