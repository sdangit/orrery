import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackfillNodes } from '../src/edsm-backfill.js';
import { displayPosition } from '../src/display-position.js';

// Real EDSM API responses (systemName=Sol), captured while building this
// feature — see TECHNICAL.md. Sol's star has bodyId:0 and
// parents:null (matches the journal's own single-star-system convention);
// Earth is bodyId:3, orbiting it.
const REAL_SOL_STAR = {
  id: 3794, bodyId: 0, name: 'Sol', type: 'Star', subType: 'G (White-Yellow) Star', parents: null,
  distanceToArrival: 0, solarMasses: 1, surfaceTemperature: 5778,
  orbitalPeriod: null, semiMajorAxis: null, orbitalEccentricity: null, orbitalInclination: null, argOfPeriapsis: null,
};
const REAL_EARTH = {
  id: 7497, bodyId: 3, name: 'Earth', type: 'Planet', subType: 'Earth-like world', parents: [{ Star: 0 }],
  distanceToArrival: 494, isLandable: false, gravity: 0.9999686429450564, earthMasses: 1, radius: 6378.1,
  surfaceTemperature: 288, terraformingState: 'Not terraformable',
  orbitalPeriod: 365.2563732531366, semiMajorAxis: 1.0000007212129391, orbitalEccentricity: 0.0167,
  orbitalInclination: 0, argOfPeriapsis: 114.207832,
};
const REAL_MERCURY = {
  id: 11236, bodyId: 1, name: 'Mercury', type: 'Planet', subType: 'Metal-rich body', parents: [{ Star: 0 }],
  distanceToArrival: 178, isLandable: true, gravity: 0.37588835103398993, earthMasses: 0.055, radius: 2439.7,
  surfaceTemperature: 401, terraformingState: 'Not terraformable',
  orbitalPeriod: 87.96910030974537, semiMajorAxis: 0.3870983647295857, orbitalEccentricity: 0.2056,
  orbitalInclination: 7, argOfPeriapsis: 29.124,
};

test('an empty existing tree gets every renderable EDSM body added as backfill', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  assert.equal(merged.size, 2);
  assert.equal(merged.get(0).isBackfill, true);
  assert.equal(merged.get(3).isBackfill, true);
});

test('real scan data is never overwritten by a backfill body with the same id', () => {
  const existing = new Map([[0, { id: 0, kind: 'Star', name: 'Real Sol Scan', isBackfill: undefined }]]);
  const merged = buildBackfillNodes(existing, [REAL_SOL_STAR, REAL_EARTH]);
  assert.equal(merged.get(0).name, 'Real Sol Scan', 'the real node must survive untouched');
  assert.equal(merged.get(0).isBackfill, undefined);
  assert.equal(merged.get(3).isBackfill, true, 'Earth was not already known, so it should still be backfilled');
});

test('the root star (EDSM parents:null) gets parentId null, matching a real single-star Scan', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR]);
  assert.equal(merged.get(0).parentId, null);
});

test('a planet\'s parentId resolves from EDSM\'s parents array', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  assert.equal(merged.get(3).parentId, 0);
});

test('the root star (no semiMajorAxis/orbitalPeriod) gets null elements, not NaN/Infinity math', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR]);
  assert.equal(merged.get(0).elements, null);
});

test('a planet\'s elements are converted to the project\'s units (AU->m, days->s) with ascendingNode/meanAnomaly fixed at 0', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  const elements = merged.get(3).elements;
  assert.ok(Math.abs(elements.semiMajorAxis - 1.495978707e11) < 1e7, 'Earth is ~1 AU out, converted to metres');
  assert.ok(Math.abs(elements.orbitalPeriodSec - 365.2563732531366 * 86400) < 1);
  assert.equal(elements.ascendingNodeDeg, 0);
  assert.equal(elements.meanAnomalyDeg, 0);
  assert.equal(elements.eccentricity, 0.0167);
});

test('Earth\'s real subType maps to the journal\'s Earthlike body PlanetClass, correctly triggering high-value spotlight-relevant data', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  assert.equal(merged.get(3).raw.PlanetClass, 'Earthlike body');
});

test('Earth\'s "Not terraformable" maps to empty TerraformState (no false terraformable spotlight)', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  assert.equal(merged.get(3).raw.TerraformState, '');
});

test('backfill bodies never claim WasMapped:false (would falsely trigger the first-mapping spotlight)', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  assert.notEqual(merged.get(3).raw.WasMapped, false);
});

test('backfill bodies are always WasDiscovered:true (known to EDSM, never a false first-discovery spotlight)', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH]);
  assert.equal(merged.get(3).raw.WasDiscovered, true);
});

test('the star\'s StarType is derived from EDSM\'s descriptive subType (leading spectral-class letter)', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR]);
  assert.equal(merged.get(0).raw.StarType, 'G');
});

test('real physical fields (radius km->m, gravity, mass, distance) are converted onto raw', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_MERCURY]);
  const mercury = merged.get(1);
  assert.equal(mercury.raw.Radius, 2439.7 * 1000);
  assert.equal(mercury.raw.SurfaceGravity, 0.37588835103398993);
  assert.equal(mercury.raw.MassEM, 0.055);
  assert.equal(mercury.raw.DistanceFromArrivalLS, 178);
  assert.equal(mercury.landable, true);
});

test('a backfilled body is directly usable with the project\'s own position math (displayPosition)', () => {
  const merged = buildBackfillNodes(new Map(), [REAL_SOL_STAR, REAL_EARTH, REAL_MERCURY]);
  const now = Date.now();
  const earthPos = displayPosition(merged, 3, now);
  const mercuryPos = displayPosition(merged, 1, now);
  for (const pos of [earthPos, mercuryPos]) {
    assert.ok(Number.isFinite(pos.x));
    assert.ok(Number.isFinite(pos.y));
    assert.ok(Number.isFinite(pos.z));
  }
  // Earth's real semi-major axis (~1 AU) is larger than Mercury's (~0.39 AU),
  // so even with compression the display distance from the star should
  // still order the same way.
  const starPos = displayPosition(merged, 0, now);
  const earthDist = Math.hypot(earthPos.x - starPos.x, earthPos.y - starPos.y, earthPos.z - starPos.z);
  const mercuryDist = Math.hypot(mercuryPos.x - starPos.x, mercuryPos.y - starPos.y, mercuryPos.z - starPos.z);
  assert.ok(earthDist > mercuryDist);
});

test('a body of an unrenderable EDSM type (e.g. anything not Star/Planet) is skipped, not crashed on', () => {
  const weirdBody = { bodyId: 99, name: 'Something Weird', type: 'SomeOtherType', parents: [{ Star: 0 }] };
  assert.doesNotThrow(() => buildBackfillNodes(new Map(), [weirdBody]));
  const merged = buildBackfillNodes(new Map(), [weirdBody]);
  assert.equal(merged.has(99), false);
});
