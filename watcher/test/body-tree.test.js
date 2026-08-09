import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJournalLines } from '../src/journal-parser.js';
import { buildBodyTree, resolveParentLinks } from '../src/body-tree.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleText = readFileSync(join(__dirname, 'fixtures', 'sample-journal.log'), 'utf8');
const sampleEvents = parseJournalLines(sampleText);

function buildSampleTree() {
  return buildBodyTree(sampleEvents, { systemAddress: 5064706368953, systemName: 'Col 285 Sector TI-U b18-2' });
}

test('buildBodyTree produces one node per scanned body + barycentre + root, no orphans', () => {
  const { nodes, orphans } = buildSampleTree();
  // 68 unique scanned bodies (2 stars, 57 planets, 9 belt clusters) + 9 barycentres + implicit root.
  assert.equal(nodes.size, 68 + 9 + 1);
  assert.deepEqual(orphans, []);
});

test('buildBodyTree classifies stars, planets, and belt clusters correctly', () => {
  const { nodes } = buildSampleTree();
  assert.equal(nodes.get(1).kind, 'Star');
  assert.equal(nodes.get(2).kind, 'Star');
  assert.equal(nodes.get(1).name, 'Col 285 Sector TI-U b18-2 A');
  assert.equal(nodes.get(2).name, 'Col 285 Sector TI-U b18-2 B');

  assert.equal(nodes.get(13).kind, 'Planet'); // "A 1"
  assert.equal(nodes.get(4).kind, 'BeltCluster'); // "A A Belt Cluster 1"
});

test('the two stars orbit the implicit system root directly', () => {
  const { nodes, rootId } = buildSampleTree();
  assert.equal(nodes.get(1).parentId, rootId);
  assert.equal(nodes.get(2).parentId, rootId);
  assert.ok(nodes.get(rootId).children.includes(1));
  assert.ok(nodes.get(rootId).children.includes(2));
});

test('belt clusters resolve past the synthetic Ring id straight to their star', () => {
  const { nodes } = buildSampleTree();
  // Raw Parents for BodyID 4 is [{"Ring":3},{"Star":1},{"Null":0}] — id 3 (the ring)
  // never gets its own node, so the resolved parent must be the star, id 1.
  const cluster = nodes.get(4);
  assert.equal(cluster.parentId, 1);
  assert.equal(nodes.has(3), false);
  assert.ok(nodes.get(1).children.includes(4));
});

test('a barycentre with no Parents array of its own is still placed correctly', () => {
  const { nodes } = buildSampleTree();
  // BodyID 63 is a ScanBaryCentre with no Parents field. We only know it sits
  // under planet 62 because moon 64's chain is [{"Null":63},{"Planet":62},...].
  const bary = nodes.get(63);
  assert.equal(bary.kind, 'Barycentre');
  assert.equal(bary.parentId, 62);
  assert.ok(nodes.get(62).children.includes(63));
});

test('moons orbiting a shared barycentre both resolve under it, and the barycentre orbits its planet', () => {
  const { nodes } = buildSampleTree();
  // "A 14 a" (64) and "A 14 b" (65) are a co-orbiting moon pair around barycentre 63,
  // which itself orbits planet 62 ("A 14").
  assert.equal(nodes.get(64).parentId, 63);
  assert.equal(nodes.get(65).parentId, 63);
  const bary63Children = new Set(nodes.get(63).children);
  assert.ok(bary63Children.has(64));
  assert.ok(bary63Children.has(65));
});

test('a moon of a moon resolves through two Planet levels', () => {
  const { nodes } = buildSampleTree();
  // "A 12 e a" (48) orbits "A 12 e" (47), which itself orbits "A 12" (39).
  assert.equal(nodes.get(48).parentId, 47);
  assert.equal(nodes.get(47).parentId, 39);
  assert.equal(nodes.get(39).parentId, 1);
});

test('isMoon is true only for planets with a planetary (not stellar) ancestor', () => {
  const { nodes } = buildSampleTree();
  assert.equal(nodes.get(39).isMoon, false); // "A 12" orbits the star directly
  assert.equal(nodes.get(47).isMoon, true); // "A 12 e" orbits planet 39
  assert.equal(nodes.get(48).isMoon, true); // "A 12 e a" orbits planet 47, two levels down
});

test('resolveParentLinks skips Ring entries and keeps every other hop', () => {
  const links = resolveParentLinks([
    { BodyID: 5, Parents: [{ Ring: 3 }, { Star: 1 }, { Null: 0 }] },
    { BodyID: 1, Parents: [{ Null: 0 }] },
  ]);
  assert.equal(links.get(5), 1);
  assert.equal(links.get(1), 0);
  assert.equal(links.has(3), false);
});

test('buildBodyTree reports an id as orphaned when its parent link points nowhere', () => {
  const events = [
    { event: 'Scan', timestamp: '2025-01-01T00:00:00Z', BodyID: 1, BodyName: 'Lonely', SystemAddress: 1, StarType: 'M', Parents: [{ Star: 99 }, { Null: 0 }] },
  ];
  const { nodes, orphans } = buildBodyTree(events, { systemAddress: 1 });
  assert.deepEqual(orphans, [1]);
  assert.equal(nodes.get(1).parentId, 99);
});

test('buildBodyTree keeps only the latest Scan per BodyID', () => {
  const events = [
    { event: 'Scan', timestamp: '2025-01-01T00:00:00Z', BodyID: 1, BodyName: 'Star', SystemAddress: 1, StarType: 'M', MeanAnomaly: 10, SemiMajorAxis: 1, Eccentricity: 0, OrbitalInclination: 0, Periapsis: 0, AscendingNode: 0, OrbitalPeriod: 100, Parents: [{ Null: 0 }] },
    { event: 'Scan', timestamp: '2025-01-01T01:00:00Z', BodyID: 1, BodyName: 'Star', SystemAddress: 1, StarType: 'M', MeanAnomaly: 20, SemiMajorAxis: 1, Eccentricity: 0, OrbitalInclination: 0, Periapsis: 0, AscendingNode: 0, OrbitalPeriod: 100, Parents: [{ Null: 0 }] },
  ];
  const { nodes } = buildBodyTree(events, { systemAddress: 1 });
  assert.equal(nodes.get(1).elements.meanAnomalyDeg, 20);
});

test('buildBodyTree attaches exobiology data (FSSBodySignals) to the matching body', () => {
  const events = [
    { event: 'Scan', timestamp: '2025-01-01T00:00:00Z', BodyID: 1, BodyName: 'Bio World', SystemAddress: 1, PlanetClass: 'Rocky body', Parents: [{ Null: 0 }] },
    { event: 'FSSBodySignals', timestamp: '2025-01-01T00:00:01Z', BodyID: 1, SystemAddress: 1, Signals: [{ Type: '$SAA_SignalType_Biological;', Type_Localised: 'Biological', Count: 3 }] },
  ];
  const { nodes } = buildBodyTree(events, { systemAddress: 1 });
  assert.equal(nodes.get(1).bio.signalCount, 3);
});

test('a body with no exobiology events has no bio field at all (not an empty stub)', () => {
  const events = [
    { event: 'Scan', timestamp: '2025-01-01T00:00:00Z', BodyID: 1, BodyName: 'Ordinary', SystemAddress: 1, PlanetClass: 'Rocky body', Parents: [{ Null: 0 }] },
  ];
  const { nodes } = buildBodyTree(events, { systemAddress: 1 });
  assert.equal('bio' in nodes.get(1), false);
});

test('bio data for a body with no corresponding Scan yet is silently dropped, not thrown', () => {
  const events = [
    { event: 'FSSBodySignals', timestamp: '2025-01-01T00:00:00Z', BodyID: 99, SystemAddress: 1, Signals: [{ Type: '$SAA_SignalType_Biological;', Type_Localised: 'Biological', Count: 1 }] },
  ];
  assert.doesNotThrow(() => buildBodyTree(events, { systemAddress: 1 }));
});

test('a single-star system where the primary star itself is BodyID 0 (real journal shape, no synthetic root collision)', () => {
  // Shaped exactly like a real Scan event for "LFT 682": the star has
  // BodyID:0 and no Parents field at all — it's the absolute root, nothing
  // to orbit. This is the common case, not an edge case: single-star
  // systems name their one star after the system itself with no letter
  // suffix, and the journal gives it BodyID 0 directly.
  const events = [
    {
      event: 'Scan', timestamp: '2025-01-01T00:00:00Z', ScanType: 'AutoScan',
      BodyName: 'LFT 682', BodyID: 0, StarSystem: 'LFT 682', SystemAddress: 1,
      DistanceFromArrivalLS: 0, StarType: 'M', Subclass: 3, StellarMass: 0.449219,
      Radius: 429593472, AbsoluteMagnitude: 10.362732, Age_MY: 898,
      SurfaceTemperature: 3532, Luminosity: 'V', RotationPeriod: 166830.658176,
      AxialTilt: 0, WasDiscovered: true, WasMapped: false,
      // deliberately no Parents field, matching the real event
    },
  ];
  const { rootId, nodes, orphans } = buildBodyTree(events, { systemAddress: 1, systemName: 'LFT 682' });
  assert.equal(rootId, 0);
  const star = nodes.get(0);
  assert.equal(star.kind, 'Star', 'the real star data must win over the synthetic placeholder, not be discarded');
  assert.equal(star.name, 'LFT 682');
  assert.equal(star.parentId, null);
  assert.equal(star.elements, null, 'a lone star with nothing to orbit has no SemiMajorAxis etc.');
  assert.deepEqual(orphans, []);
});

test('a planet orbiting a single-star system\'s BodyID-0 star resolves its parent correctly', () => {
  const events = [
    {
      event: 'Scan', timestamp: '2025-01-01T00:00:00Z', BodyID: 0, BodyName: 'LFT 682', SystemAddress: 1,
      StarType: 'M', WasDiscovered: true, WasMapped: false,
    },
    {
      event: 'Scan', timestamp: '2025-01-01T00:00:01Z', BodyID: 1, BodyName: 'LFT 682 1', SystemAddress: 1,
      PlanetClass: 'Rocky body', Parents: [{ Star: 0 }],
      SemiMajorAxis: 1e9, Eccentricity: 0, OrbitalInclination: 0, Periapsis: 0, AscendingNode: 0, MeanAnomaly: 0, OrbitalPeriod: 100000,
      WasDiscovered: true, WasMapped: false,
    },
  ];
  const { nodes, orphans } = buildBodyTree(events, { systemAddress: 1 });
  assert.equal(nodes.get(1).parentId, 0);
  assert.equal(nodes.get(0).kind, 'Star');
  assert.deepEqual(orphans, []);
});
