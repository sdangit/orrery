// Kepler orbit math: solves the eccentric anomaly and turns Keplerian
// elements into a 3D offset from the parent body, per the design brief's
// step list:
//
//   1. Mean anomaly M = M0 + 2*pi*(t - t0) / OrbitalPeriod
//   2. Solve Kepler: E - e*sin(E) = M  (Newton iteration)
//   3. True anomaly from E; r = a*(1 - e*cos(E))
//   4. Rotate by argument of periapsis, inclination, ascending node
//   5. (caller's job) walk the Parents chain to get an absolute position
//
// Units follow the journal directly: metres, seconds, degrees in the public
// element object; radians internally.

const TAU = 2 * Math.PI;
const DEG2RAD = Math.PI / 180;

/** Wraps an angle in radians into [0, 2*pi). */
export function normalizeRadians(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

/**
 * Mean anomaly (radians) at a given time, propagated from the element set's
 * reference epoch.
 * @param {{meanAnomalyDeg:number, orbitalPeriodSec:number, epochMs:number}} elements
 * @param {number} atEpochMs
 */
export function meanAnomalyAt(elements, atEpochMs) {
  const dtSeconds = (atEpochMs - elements.epochMs) / 1000;
  const meanMotion = TAU / elements.orbitalPeriodSec; // rad/s
  const m0 = elements.meanAnomalyDeg * DEG2RAD;
  return normalizeRadians(m0 + meanMotion * dtSeconds);
}

/**
 * Solves Kepler's equation E - e*sin(E) = M for the eccentric anomaly, via
 * Newton-Raphson. Five iterations comfortably converges for the eccentricities
 * ED systems produce (well under 1).
 * @param {number} meanAnomalyRad
 * @param {number} eccentricity
 * @param {{iterations?: number}} [options]
 */
export function solveEccentricAnomaly(meanAnomalyRad, eccentricity, { iterations = 5 } = {}) {
  const m = normalizeRadians(meanAnomalyRad);
  // First-order predictor (E ~ M + e*sin M): exact at M=0 and M=pi, and a
  // meaningfully better starting point than E=M for the higher eccentricities
  // a few ED bodies (close binaries, comets) can have.
  let e = m + eccentricity * Math.sin(m);
  for (let i = 0; i < iterations; i++) {
    const f = e - eccentricity * Math.sin(e) - m;
    const fPrime = 1 - eccentricity * Math.cos(e);
    e -= f / fPrime;
  }
  return e;
}

/** True anomaly (radians) from the eccentric anomaly. */
export function trueAnomalyFromEccentric(eccentricAnomalyRad, eccentricity) {
  const halfE = eccentricAnomalyRad / 2;
  return 2 * Math.atan2(
    Math.sqrt(1 + eccentricity) * Math.sin(halfE),
    Math.sqrt(1 - eccentricity) * Math.cos(halfE),
  );
}

/** Orbital radius (same unit as semiMajorAxis) from the eccentric anomaly. */
export function orbitalRadius(semiMajorAxis, eccentricity, eccentricAnomalyRad) {
  return semiMajorAxis * (1 - eccentricity * Math.cos(eccentricAnomalyRad));
}

/**
 * Position offset from the parent body, in the parent's reference frame.
 * Uses the standard combined perifocal-to-reference-frame rotation (Curtis,
 * "Orbital Mechanics for Engineering Students") rather than three separate
 * matrix multiplies:
 *
 *   x = r*(cosO*cos(w+v) - sinO*sin(w+v)*cosI)
 *   y = r*(sinO*cos(w+v) + cosO*sin(w+v)*cosI)
 *   z = r*sin(w+v)*sinI
 *
 * where O = ascending node, w = argument of periapsis, I = inclination, v = true anomaly.
 *
 * @param {{semiMajorAxis:number, eccentricity:number, inclinationDeg:number, periapsisDeg:number, ascendingNodeDeg:number, meanAnomalyDeg:number, orbitalPeriodSec:number, epochMs:number}} elements
 * @param {number} atEpochMs
 * @returns {{x:number, y:number, z:number, trueAnomaly:number, radius:number}}
 */
export function keplerianOffset(elements, atEpochMs) {
  const m = meanAnomalyAt(elements, atEpochMs);
  const e = solveEccentricAnomaly(m, elements.eccentricity);
  const v = trueAnomalyFromEccentric(e, elements.eccentricity);
  const r = orbitalRadius(elements.semiMajorAxis, elements.eccentricity, e);

  const inclination = elements.inclinationDeg * DEG2RAD;
  const argPeriapsis = elements.periapsisDeg * DEG2RAD;
  const ascendingNode = elements.ascendingNodeDeg * DEG2RAD;
  const argLat = argPeriapsis + v; // argument of latitude (w + v)

  const cosO = Math.cos(ascendingNode);
  const sinO = Math.sin(ascendingNode);
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  const cosArgLat = Math.cos(argLat);
  const sinArgLat = Math.sin(argLat);

  return {
    x: r * (cosO * cosArgLat - sinO * sinArgLat * cosI),
    y: r * (sinO * cosArgLat + cosO * sinArgLat * cosI),
    z: r * sinArgLat * sinI,
    trueAnomaly: v,
    radius: r,
  };
}
