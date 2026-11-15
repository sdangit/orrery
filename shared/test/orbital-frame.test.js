import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { absolutePosition, displayPosition, compressDistance, mergeCommunityBodies } from '../src/index.js';
import { elements } from './helpers/synthetic-tree.js';

function close(p, expected, tolerance = 1e-8) {
  assert.ok(Math.hypot(p.x - expected[0], p.y - expected[1], p.z - expected[2]) < tolerance, JSON.stringify(p));
}

test('nested frames compose orbital orientation and axial tilt in order, including barycentres', () => {
  const circular = overrides => elements({ eccentricity: 0, inclinationDeg: 0,
    ascendingNodeDeg: 0, periapsisDeg: 0, meanAnomalyDeg: 0, ...overrides });
  const nodes = new Map([
    [0, { id: 0, parentId: null, raw: { AxialTilt: 0.6 } }],
    [1, { id: 1, parentId: 0, elements: circular({ semiMajorAxis: 100, periapsisDeg: -90 }), raw: { AxialTilt: Math.PI / 2 } }],
    [2, { id: 2, kind: 'Barycentre', parentId: 1, elements: circular({ semiMajorAxis: 10, meanAnomalyDeg: 90 }) }],
    [3, { id: 3, parentId: 2, elements: circular({ semiMajorAxis: 1, meanAnomalyDeg: 90 }) }],
  ]);
  // Parent Rz(90) Rx(-90) maps local +X to +Y and local +Y to -Z.
  // Mean anomaly moves a body; it must NOT rotate its children's basis.
  close(absolutePosition(nodes, 1, 0), [0, 100, 0]);
  close(absolutePosition(nodes, 2, 0), [0, 100, -10]);
  close(absolutePosition(nodes, 3, 0), [0, 100, -11]);
  close(displayPosition(nodes, 3, 0), [0, compressDistance(100), -compressDistance(10) - compressDistance(1)]);
  // A second level of tilt cancels the first. Child now lies along local +Y.
  nodes.get(2).raw = { AxialTilt: -Math.PI / 2 };
  close(absolutePosition(nodes, 3, 0), [-1, 100, -10]);
});

const parity = JSON.parse(readFileSync(new URL('./fixtures/v886-vertical-parity.json', import.meta.url)));
test('V886 Centauri reflection preserves XY and all nested relative distances during playback', () => {
  const nodes = new Map(parity.nodes.map(n => [n.id, n]));
  for (const sample of parity.samples) {
    const prior = new Map(sample.beforePositions.map(p => [p.id, p]));
    for (const n of nodes.values()) {
      const p = absolutePosition(nodes, n.id, sample.epochMs), old = prior.get(n.id);
      close(p, [old.x, old.y, -old.z], 0.001);
      if (n.parentId == null) continue;
      const parent = absolutePosition(nodes, n.parentId, sample.epochMs), oldParent = prior.get(n.parentId);
      const distance = Math.hypot(p.x-parent.x, p.y-parent.y, p.z-parent.z);
      const previousDistance = Math.hypot(old.x-oldParent.x, old.y-oldParent.y, old.z-oldParent.z);
      assert.ok(Math.abs(distance - previousDistance) < 0.001, n.name);
    }
  }
  const body10 = parity.nodes.find(n => n.name === 'V886 Centauri 10');
  assert.equal(body10.id, 64); // Display designation 10 is not journal BodyID 10.
  assert.ok(absolutePosition(nodes, body10.id, parity.samples[0].epochMs).z < 0);
});

const vega = JSON.parse(readFileSync(new URL('./fixtures/vega-journal-orbits.json', import.meta.url)));
test('fresh Vega Scan ranges match Trikora and all bodies around Vega 2', () => {
  const nodes = new Map(vega.nodes.map(n => [n.id, n]));
  const before = structuredClone(vega);
  for (const id of [4, 5, 6, 7, 8, 9, 12]) {
    const n = nodes.get(id);
    const p = absolutePosition(nodes, id, Date.parse(n.raw.timestamp));
    const errorKm = Math.abs(Math.hypot(p.x, p.y, p.z) / 1000 - n.raw.DistanceFromArrivalLS * 299792.458);
    // Vega 2 itself carries ~151 km range rounding/element error. The moon's
    // error should not grow to the 43,000–467,000 km common-frame discrepancy.
    assert.ok(errorKm < (id === 12 ? 3 : 155), `${n.name}: ${errorKm} km`);
  }
  assert.deepEqual(vega, before);
});

const catalogue = JSON.parse(readFileSync(new URL('../../docs/research/fixtures/orbital-frame-snapshots.json', import.meta.url)));
const limitsLs = { Sol: 0.009, 'HIP 97950': 0.002, 'Bleia Dryiae XJ-R e4-1': 0.1, 'Epsilon Indi': 0.002,
  '61 Cygni': 0.0003, 'LHS 3447': 0.00002, Vega: 0.0007 };
for (const system of catalogue.systems.filter(s => s.name in limitsLs)) {
  test(`${system.name}: production hierarchy reproduces recorded arrival ranges`, () => {
    const { nodes, diagnostics } = mergeCommunityBodies(new Map(), { spansh: { bodies: system.bodies } });
    assert.deepEqual(diagnostics, []);
    const primaryId = system.bodies.find(b => b.mainStar).bodyId;
    for (const b of system.bodies) {
      const t = Date.parse(b.timestamps?.distanceToArrival);
      if (b.bodyId === primaryId || !Number.isFinite(t) || !Number.isFinite(b.distanceToArrival)) continue;
      const p = absolutePosition(nodes, b.bodyId, t), star = absolutePosition(nodes, primaryId, t);
      const predicted = Math.hypot(p.x - star.x, p.y - star.y, p.z - star.z) / 299792458;
      assert.ok(Math.abs(predicted - b.distanceToArrival) < limitsLs[system.name], `${b.name}: ${predicted - b.distanceToArrival} ls`);
    }
  });
}
