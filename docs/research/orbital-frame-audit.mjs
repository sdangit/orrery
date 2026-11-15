// Research only: compare candidate frame conventions against captured arrival distances.
// Run: node docs/research/orbital-frame-audit.mjs [--json]
// No network or app-state mutations. This is not a replacement production solver.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keplerianOffset } from '../../shared/src/kepler.js';
import { absolutePosition } from './legacy-orbit-position.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/orbital-frame-snapshots.json', import.meta.url)));
const AU = 149597870700;
const C = 299792458;
const DEG = Math.PI / 180;
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const multiplyVector = (a, v) => a.map(row => row.reduce((sum, x, i) => sum + x * v[i], 0));
const multiply = (a, b) => a.map(row => b[0].map((_, i) => row.reduce((sum, x, j) => sum + x * b[j][i], 0)));
const difference = (a, b) => a.map((x, i) => x - b[i]);

function rotation(axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return axis === 'x' ? [[1, 0, 0], [0, c, -s], [0, s, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function elements(body, signs = [1, 1, 1]) {
  if (body.semiMajorAxis == null) return null;
  for (const key of ['semiMajorAxis', 'meanAnomaly', 'orbitalEccentricity', 'orbitalInclination', 'ascendingNode', 'argOfPeriapsis', 'orbitalPeriod']) {
    assert(Number.isFinite(body[key]), `${body.name}: missing ${key}`);
  }
  const epochMs = Date.parse(body.timestamps?.meanAnomaly);
  assert(Number.isFinite(epochMs), `${body.name}: missing phase epoch`);
  // The captured Sol record has a negative orbital period for retrograde Triton.
  assert(body.orbitalPeriod !== 0 && body.orbitalEccentricity >= 0 && body.orbitalEccentricity < 1);
  return {
    semiMajorAxis: body.semiMajorAxis * AU,
    eccentricity: body.orbitalEccentricity,
    inclinationDeg: body.orbitalInclination * signs[0],
    ascendingNodeDeg: body.ascendingNode * signs[1],
    periapsisDeg: body.argOfPeriapsis * signs[2],
    meanAnomalyDeg: body.meanAnomaly,
    orbitalPeriodSec: body.orbitalPeriod * 86400,
    epochMs,
  };
}

function basis(body, signs) {
  return multiply(multiply(
    rotation('z', body.ascendingNode * signs[1] * DEG),
    rotation('x', body.orbitalInclination * signs[0] * DEG),
  ), rotation('z', body.argOfPeriapsis * signs[2] * DEG));
}

const conventions = [
  { name: 'orrery-current', signs: [1, 1, 1] },
  { name: 'community-signs-common-frame', signs: [1, -1, -1] },
  { name: 'inherit-orbit', signs: [1, -1, -1], inherit: true },
  { name: 'inherit-orbit-and-tilt', signs: [1, -1, -1], inherit: true, tilt: true },
  { name: 'candidate-with-root-binary-rule', signs: [1, -1, -1], inherit: true, tilt: true, rootBinary: true },
];

function audit(system) {
  const byId = new Map(system.bodies.map(b => [b.bodyId, b]));
  const parents = new Map();
  for (const body of system.bodies) {
    let child = body.bodyId;
    for (const entry of body.parents ?? []) {
      const id = Object.values(entry)[0];
      if (parents.has(child)) assert.equal(parents.get(child), id, 'Conflicting parent chains');
      parents.set(child, id);
      child = id;
    }
  }
  const primary = system.bodies.find(b => b.mainStar);
  assert(primary, `${system.name}: no mainStar; cannot evaluate arrival reference`);

  // Root-binary hypothesis, discovered while investigating HIP 97950.
  // A matched opposite member defines the stellar pair; other root children may
  // inherit the primary's orbital basis. This rule is not yet generally validated.
  const near = (a, b, tolerance = 0.0001) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < tolerance;
  const oppositeMembers = parents.get(primary.bodyId) === 0 && !byId.has(0)
    ? system.bodies.filter(b => b !== primary && parents.get(b.bodyId) === 0
      && ['orbitalPeriod', 'orbitalEccentricity', 'orbitalInclination', 'ascendingNode'].every(k => near(b[k], primary[k]))
      && near(((b.argOfPeriapsis - primary.argOfPeriapsis) % 360 + 360) % 360, 180))
    : [];
  const pair = oppositeMembers.length === 1 ? new Set([primary.bodyId, oppositeMembers[0].bodyId]) : null;

  const nodes = new Map(system.bodies.map(b => [b.bodyId, {
    parentId: parents.get(b.bodyId) ?? null,
    elements: elements(b),
  }]));
  if (!nodes.has(0)) nodes.set(0, { parentId: null, elements: null });
  const output = { system: system.name, source: system.source_url, rootBinaryPair: pair ? [...pair] : null, models: [] };

  for (const convention of conventions) {
    const rows = [], skipped = [];
    function state(id, t, cache, seen = new Set()) {
      if (cache.has(id)) return cache.get(id);
      assert(!seen.has(id), 'Cycle in parent chain');
      seen.add(id);
      const body = byId.get(id);
      if (!body) {
        assert.equal(id, 0, `Missing ancestor ${id}`);
        return { position: [0, 0, 0], frame: I };
      }
      const orbital = elements(body, convention.signs);
      let offset = [0, 0, 0], orbitalFrame = I;
      if (orbital) {
        const v = keplerianOffset(orbital, t);
        offset = [v.x, v.y, v.z];
        assert(offset.every(Number.isFinite));
        orbitalFrame = basis(body, convention.signs);
      }
      const parentId = parents.get(id);
      const parent = parentId == null ? { position: [0, 0, 0], frame: I } : state(parentId, t, cache, seen);
      let parentFrame = parent.frame;
      if (convention.rootBinary && pair && parentId === 0 && !pair.has(id)) parentFrame = basis(primary, convention.signs);
      const position = multiplyVector(parentFrame, offset).map((x, i) => x + parent.position[i]);
      let frame = convention.inherit ? multiply(parentFrame, orbitalFrame) : I;
      if (convention.tilt) frame = multiply(frame, rotation('x', body.axialTilt ?? 0));
      const result = { position, frame };
      cache.set(id, result);
      seen.delete(id);
      return result;
    }
    for (const body of system.bodies) {
      const t = Date.parse(body.timestamps?.distanceToArrival);
      if (body === primary || !Number.isFinite(body.distanceToArrival) || !Number.isFinite(t)) continue;
      try {
        const cache = new Map();
        const p = state(body.bodyId, t, cache).position;
        const origin = state(primary.bodyId, t, cache).position;
        if (convention.name === 'orrery-current') {
          const actual = absolutePosition(nodes, body.bodyId, t);
          assert(Math.hypot(...difference(p, [actual.x, actual.y, actual.z])) < 1, 'Baseline differs from frozen pre-correction app solver');
        }
        const predicted = Math.hypot(...difference(p, origin)) / C;
        rows.push({ body: body.name, epoch: body.timestamps.distanceToArrival, observedLs: body.distanceToArrival, predictedLs: predicted, errorLs: predicted - body.distanceToArrival });
      } catch (error) {
        skipped.push({ body: body.name, error: error.message });
      }
    }
    assert(rows.length > 0, `${system.name}: no evaluated bodies`);
    // The captured fixtures are complete enough for every candidate. Fail loudly
    // if a future edit accidentally drops hard cases and improves the score.
    assert.equal(skipped.length, 0, JSON.stringify(skipped));
    const errors = rows.map(r => Math.abs(r.errorLs)).sort((a, b) => a - b);
    const n = errors.length;
    output.models.push({
      convention: convention.name, count: n, skipped,
      medianAbsoluteErrorLs: n % 2 ? errors[(n - 1) / 2] : (errors[n / 2 - 1] + errors[n / 2]) / 2,
      rmsErrorLs: Math.sqrt(errors.reduce((s, x) => s + x * x, 0) / n),
      maxAbsoluteErrorLs: errors.at(-1), rows,
    });
    if (system.name === 'Vega' && convention.rootBinary) {
      const epoch = primary.timestamps.distanceToArrival;
      const t = Date.parse(epoch), cache = new Map();
      const named = name => system.bodies.find(b => b.name === name);
      const observationPlans = ['Trikora', 'Popov Reward'].map(name => {
        const observer = named(name), p = state(observer.bodyId, t, cache).position;
        const rho = (observer.radius + 10) * 1000; // radius in km, assumed <=10 km altitude
        const targets = ['Vega', 'Vega 2', "Tracy's Havan"].map(target => {
          const v = difference(state(named(target).bodyId, t, cache).position, p);
          const distance = Math.hypot(...v);
          return { target, distanceLs: distance / C, observerOffsetBoundDeg: Math.asin(rho / distance) / DEG, unitDirection: v.map(x => x / distance) };
        });
        const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((s, x, i) => s + x * b[i], 0)))) / DEG;
        return { observerBody: name, assumedMaximumAltitudeKm: 10, targets, vegaToVega2AngleDeg: angle(targets[0].unitDirection, targets[1].unitDirection), vegaToTracyAngleDeg: angle(targets[0].unitDirection, targets[2].unitDirection) };
      });
      output.observationPlan = { epoch, warning: 'Candidate geometry and observer-offset contribution only; not an observed sky alignment or total error bound.', observationPlans };
    }
  }
  return output;
}

const report = { warning: 'Range comparisons cannot determine external sky rotation or global handedness. Candidate formulas remain experimental.', systems: fixture.systems.map(audit) };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const system of report.systems) {
    console.log(system.system, 'root pair:', system.rootBinaryPair);
    console.table(system.models.map(({ convention, count, medianAbsoluteErrorLs, rmsErrorLs, maxAbsoluteErrorLs }) => ({ convention, count, medianAbsoluteErrorLs, rmsErrorLs, maxAbsoluteErrorLs })));
  }
}
