// Synthetic geometry experiment only; no in-game image measurements are supplied.
// Run: node docs/research/observer-calibration-demo.mjs
import assert from 'node:assert/strict';
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = a => Math.hypot(...a);
const unit = a => a.map(x => x / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const transpose = a => a[0].map((_, i) => a.map(r => r[i]));
const mv = (a, v) => a.map(r => dot(r, v));
const mm = (a, b) => a.map(r => transpose(b).map(c => dot(r, c)));
const angularErrorDeg = (a, b) => Math.atan2(norm(cross(unit(a), unit(b))), dot(unit(a), unit(b))) * 180 / Math.PI;
function rotation(axis, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return axis === 'x' ? [[1, 0, 0], [0, c, -s], [0, s, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}
function solve3(matrix, rhs) {
  const a = matrix.map((r, i) => [...r, rhs[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    assert(Math.abs(a[pivot][col]) > 1e-12, 'Range geometry is singular');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    a[col] = a[col].map(x => x / scale);
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const k = a[row][col];
      a[row] = a[row].map((x, j) => x - k * a[col][j]);
    }
  }
  return a.map(r => r[3]);
}
function positionFromRanges(anchors, ranges) {
  const a0 = anchors[0];
  return solve3(anchors.slice(1).map(a => sub(a, a0).map(x => 2 * x)), anchors.slice(1).map((a, i) => dot(a, a) - dot(a0, a0) + ranges[0] ** 2 - ranges[i + 1] ** 2));
}
function triad(a, b) {
  const x = unit(a), z = unit(cross(a, b)), y = cross(z, x);
  assert(norm(cross(a, b)) > 1e-8, 'Bearings too closely aligned');
  return transpose([x, y, z]);
}
function frameFromBearings(local, sky) {
  return mm(triad(sky[0], sky[1]), transpose(triad(local[0], local[1])));
}
const anchors = [[0, 0, 0], [500, 0, 0], [0, 800, 0], [200, 300, 400]]; // light seconds
const knownQ = mm(mm(rotation('z', 0.7), rotation('x', -0.4)), rotation('z', 0.2));
const captures = [];
for (const truePosition of [[120, -90, 150], [-80, 60, -110]]) {
  const ranges = anchors.map(a => norm(sub(a, truePosition)));
  const skyBearings = anchors.map(a => mv(knownQ, unit(sub(a, truePosition))));
  const inferredPosition = positionFromRanges(anchors, ranges);
  const inferredLocal = anchors.map(a => unit(sub(a, inferredPosition)));
  const inferredQ = frameFromBearings(inferredLocal, skyBearings);
  const heldOutErrors = [2, 3].map(i => angularErrorDeg(mv(inferredQ, inferredLocal[i]), skyBearings[i]));
  const positionError = norm(sub(inferredPosition, truePosition));
  assert(positionError < 1e-9);
  assert(Math.max(...heldOutErrors) < 1e-9);
  captures.push({ truePositionLs: truePosition, recoveredPositionLs: inferredPosition, positionErrorLs: positionError, heldOutAngularErrorsDeg: heldOutErrors });
}
const rangeNoise = [0.01, -0.01, 0.01, -0.01]; // assumed, not measured HUD precision
const noiseCases = [400, 0.1].map(height => {
  const points = anchors.map(a => [...a]); points[3][2] = height;
  const position = [120, -90, 150];
  const ranges = points.map((a, i) => norm(sub(a, position)) + rangeNoise[i]);
  const inferred = positionFromRanges(points, ranges);
  return { fourthAnchorHeightLs: height, assumedRangeErrorsLs: rangeNoise, positionErrorLs: norm(sub(inferred, position)) };
});
const flat = anchors.map(a => [a[0], a[1], 0]);
assert.throws(() => positionFromRanges(flat, flat.map(a => norm(sub(a, [120, -90, 150])))), /singular/);
const bound = (offsetKm, targetDistanceKm) => Math.asin(offsetKm / targetDistanceKm) * 180 / Math.PI;
console.log(JSON.stringify({
  warning: 'Synthetic demonstration of observability, not an Elite calibration or validated HUD precision model.',
  assumedKnownInputs: ['Body positions at the capture time', 'Four centre-to-centre observer ranges', 'Body bearings in a known galactic frame'],
  captureResults: captures,
  geometrySensitivity: noiseCases,
  coplanarRangeGeometry: 'Rejected as singular; four coplanar centres cannot distinguish mirrored observer heights using ranges alone.',
  nearMoonBounds: [1e6, 149597870.7].map(d => ({ observerOffsetKm: 1000, targetDistanceKm: d, angularBoundDeg: bound(1000, d) })),
  farSkyParallaxBounds: [{ au: 1, ly: 1 }, { au: 100, ly: 1 }, { au: 100, ly: 4 }].map(({ au, ly }) => ({ observerOffsetAu: au, targetDistanceLy: ly, angularBoundDeg: bound(au * 149597870.7, ly * 9460730472580.8) })),
}, null, 2));
