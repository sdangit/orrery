// Independent research replay of fresh journal distances, with no fitted angles.
// node docs/research/vega-parent-frame-audit.mjs > docs/research/vega-parent-frame-results.json
import { readFileSync } from 'node:fs';
import { keplerianOffset } from '../../shared/src/kepler.js';
// Freeze the pre-parity-correction basis for historical report reproduction.
const eliteKeplerianOffset = (e, t) => keplerianOffset({ ...e,
  ascendingNodeDeg: -e.ascendingNodeDeg, periapsisDeg: -e.periapsisDeg }, t);

const fixture = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/vega-journal-orbits.json', import.meta.url)));
const nodes = new Map(fixture.nodes.map(n => [n.id, n]));
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const mul = (a, b) => a.map(row => b[0].map((_, k) => row.reduce((s, x, j) => s + x * b[j][k], 0)));
const vector = (m, v) => m.map(row => row.reduce((s, x, i) => s + x * v[i], 0));
const rot = (axis, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return axis === 'x' ? [[1, 0, 0], [0, c, -s], [0, s, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]];
};
function state(id, t, model) {
  if (id == null) return { p: [0, 0, 0], frame: I };
  const n = nodes.get(id), e = n.elements;
  const parent = state(n.parentId, t, model);
  const v = e ? eliteKeplerianOffset(e, t) : { x: 0, y: 0, z: 0 };
  const offset = vector(parent.frame, [v.x, v.y, v.z]);
  const p = parent.p.map((x, i) => x + offset[i]);
  let frame = parent.frame;
  if (model !== 'common' && (model !== 'planet-only' || n.kind === 'Planet')) {
    if (e) {
      const d = Math.PI / 180;
      frame = mul(frame, mul(mul(rot('z', -e.ascendingNodeDeg * d), rot('x', e.inclinationDeg * d)), rot('z', -e.periapsisDeg * d)));
    }
    // Root tilt is a common rigid rotation; omit it to retain the app's gauge.
    if (n.parentId != null && model !== 'orbit-only') frame = mul(frame, rot('x', n.raw.AxialTilt ?? 0));
  }
  return { p, frame, offset };
}
const models = ['common', 'orbit-only', 'planet-only', 'orbit-and-tilt'].map(model => ({
  model,
  rows: fixture.nodes.filter(n => n.elements && ['Star', 'Planet'].includes(n.kind)).map(n => {
    const t = Date.parse(n.raw.timestamp);
    const predictedLs = Math.hypot(...state(n.id, t, model).p) / 299792458;
    const errorKm = (predictedLs - n.raw.DistanceFromArrivalLS) * 299792.458;
    const offset = state(n.id, Date.parse(fixture.capturedAt), model).offset;
    return { id: n.id, name: n.name, epoch: n.raw.timestamp, observedLs: n.raw.DistanceFromArrivalLS,
      predictedLs, errorKm, systemXYAzimuthDeg: Math.atan2(offset[1], offset[0]) * 180 / Math.PI };
  }),
}));
console.log(JSON.stringify({ warning: 'XY azimuth is not a measured screen clock angle. Scalar distances do not establish the full 3D or galactic orientation.', capturedAt: fixture.capturedAt, models }, null, 2));
