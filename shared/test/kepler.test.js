import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solveEccentricAnomaly,
  trueAnomalyFromEccentric,
  orbitalRadius,
  meanAnomalyAt,
  keplerianOffset,
  normalizeRadians,
} from '../src/kepler.js';

test('normalizeRadians wraps into [0, 2*pi)', () => {
  assert.ok(Math.abs(normalizeRadians(-Math.PI / 2) - (1.5 * Math.PI)) < 1e-9);
  assert.ok(Math.abs(normalizeRadians(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(normalizeRadians(0)) < 1e-9);
});

test('solveEccentricAnomaly is exact for M=0 and M=pi regardless of eccentricity', () => {
  for (const e of [0, 0.1, 0.5, 0.9]) {
    assert.ok(Math.abs(solveEccentricAnomaly(0, e)) < 1e-9, `e=${e}`);
    assert.ok(Math.abs(solveEccentricAnomaly(Math.PI, e) - Math.PI) < 1e-9, `e=${e}`);
  }
});

test('solveEccentricAnomaly satisfies Kepler\'s equation to high precision', () => {
  const m = 1.234;
  const e = 0.62;
  const E = solveEccentricAnomaly(m, e);
  const residual = E - e * Math.sin(E) - m;
  assert.ok(Math.abs(residual) < 1e-8);
});

test('trueAnomalyFromEccentric maps periapsis and apoapsis correctly', () => {
  assert.ok(Math.abs(trueAnomalyFromEccentric(0, 0.4)) < 1e-9); // periapsis: E=0 -> v=0
  assert.ok(Math.abs(trueAnomalyFromEccentric(Math.PI, 0.4) - Math.PI) < 1e-9); // apoapsis: E=pi -> v=pi
});

test('orbitalRadius gives periapsis/apoapsis distances at E=0 and E=pi', () => {
  const a = 1e9;
  const e = 0.3;
  assert.ok(Math.abs(orbitalRadius(a, e, 0) - a * (1 - e)) < 1e-3);
  assert.ok(Math.abs(orbitalRadius(a, e, Math.PI) - a * (1 + e)) < 1e-3);
});

test('meanAnomalyAt returns to the same value after one full orbital period', () => {
  const elements = { meanAnomalyDeg: 40, orbitalPeriodSec: 3600, epochMs: 0 };
  const m0 = meanAnomalyAt(elements, 0);
  const mAfter = meanAnomalyAt(elements, elements.orbitalPeriodSec * 1000);
  assert.ok(Math.abs(m0 - mAfter) < 1e-9);
});

test('meanAnomalyAt advances proportionally with elapsed time', () => {
  const elements = { meanAnomalyDeg: 0, orbitalPeriodSec: 1000, epochMs: 0 };
  const quarterPeriodMs = 250 * 1000;
  const m = meanAnomalyAt(elements, quarterPeriodMs);
  assert.ok(Math.abs(m - Math.PI / 2) < 1e-9);
});

test('keplerianOffset: circular equatorial orbit sits at radius a on the x/y plane', () => {
  const elements = {
    semiMajorAxis: 1e9,
    eccentricity: 0,
    inclinationDeg: 0,
    periapsisDeg: 0,
    ascendingNodeDeg: 0,
    meanAnomalyDeg: 0,
    orbitalPeriodSec: 1000,
    epochMs: 0,
  };
  const atPeriapsis = keplerianOffset(elements, 0);
  assert.ok(Math.abs(atPeriapsis.x - 1e9) < 1);
  assert.ok(Math.abs(atPeriapsis.y) < 1);
  assert.ok(Math.abs(atPeriapsis.z) < 1);

  // A quarter period later, still in-plane (z=0), at radius a, rotated 90 degrees.
  const quarterLater = keplerianOffset(elements, 250 * 1000);
  assert.ok(Math.abs(quarterLater.x) < 1);
  assert.ok(Math.abs(quarterLater.y - 1e9) < 1);
  assert.ok(Math.abs(quarterLater.z) < 1);
});

test('keplerianOffset: nonzero inclination lifts the body out of the x/y plane at quadrature', () => {
  const elements = {
    semiMajorAxis: 1e9,
    eccentricity: 0,
    inclinationDeg: 45,
    periapsisDeg: 0,
    ascendingNodeDeg: 0,
    meanAnomalyDeg: 0,
    orbitalPeriodSec: 1000,
    epochMs: 0,
  };
  // At periapsis (on the ascending node line) inclination shouldn't move it off-plane yet.
  const atPeriapsis = keplerianOffset(elements, 0);
  assert.ok(Math.abs(atPeriapsis.z) < 1);

  // A quarter period on, the inclined orbit should have real z displacement.
  const quarterLater = keplerianOffset(elements, 250 * 1000);
  assert.ok(Math.abs(quarterLater.z) > 1e8);
});

test('keplerianOffset returned radius matches the vector magnitude', () => {
  const elements = {
    semiMajorAxis: 5e9,
    eccentricity: 0.3,
    inclinationDeg: 12,
    periapsisDeg: 200,
    ascendingNodeDeg: -50,
    meanAnomalyDeg: 75,
    orbitalPeriodSec: 86400,
    epochMs: 0,
  };
  const offset = keplerianOffset(elements, 12345 * 1000);
  const magnitude = Math.sqrt(offset.x ** 2 + offset.y ** 2 + offset.z ** 2);
  assert.ok(Math.abs(magnitude - offset.radius) < 1);
});

test('keplerianOffset stays within [a*(1-e), a*(1+e)] across a full orbit', () => {
  const a = 3e9;
  const e = 0.4;
  const elements = {
    semiMajorAxis: a,
    eccentricity: e,
    inclinationDeg: 33,
    periapsisDeg: 80,
    ascendingNodeDeg: 15,
    meanAnomalyDeg: 0,
    orbitalPeriodSec: 10000,
    epochMs: 0,
  };
  const min = a * (1 - e) - 1;
  const max = a * (1 + e) + 1;
  for (let t = 0; t <= 10000; t += 500) {
    const { radius } = keplerianOffset(elements, t * 1000);
    assert.ok(radius >= min && radius <= max, `radius ${radius} out of bounds at t=${t}`);
  }
});
