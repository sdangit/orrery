// Research-only, frozen Vega-to-Altair transfer prediction; no camera fitting.
// Run with an optional actual capture UTC timestamp as the first argument.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { keplerianOffset } from '../../shared/src/kepler.js';

const f = JSON.parse(readFileSync(new URL('./fixtures/altair-transfer-plan.json', import.meta.url)));
// Optional provenance check only: retain the frozen matrix and orbital formula.
// Default output remains the original, pre-capture catalogue prediction.
const freshJournal = process.argv.includes('--fresh-journal');
if (freshJournal) {
  const journal = JSON.parse(readFileSync(new URL('./fixtures/altair-capture-journal.json', import.meta.url)));
  for (const scan of journal.scans) {
    const body = f.system.bodies.find(b => b.bodyId === scan.BodyID);
    assert(body && scan.SystemAddress === f.system.id64);
    Object.assign(body, {
      semiMajorAxis: scan.SemiMajorAxis / 149597870700,
      orbitalEccentricity: scan.Eccentricity,
      orbitalInclination: scan.OrbitalInclination,
      ascendingNode: scan.AscendingNode,
      argOfPeriapsis: scan.Periapsis,
      meanAnomaly: scan.MeanAnomaly,
      orbitalPeriod: scan.OrbitalPeriod / 86400,
      axialTilt: scan.AxialTilt,
      timestamps: { ...body.timestamps, meanAnomaly: scan.timestamp },
    });
  }
}
const timestamp = process.argv[2] ?? f.planningEpoch;
const t = Date.parse(timestamp);
assert(Number.isFinite(t), 'Supply an ISO capture timestamp');
const DEG = Math.PI / 180;
const mv = (a, v) => a.map(r => r.reduce((s, x, i) => s + x * v[i], 0));
const sub = (a, b) => a.map((x, i) => x - b[i]);
const unit = v => v.map(x => x / Math.hypot(...v));
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((s, x, i) => s + x*b[i], 0)))) / DEG;
const bodies = f.system.bodies;
const primary = bodies.find(b => b.mainStar);
assert(primary && primary.bodyId === 0 && !primary.parents?.length);
const tilt = primary.axialTilt ?? 0;
const frame = [[1,0,0],[0,Math.cos(tilt),-Math.sin(tilt)],[0,Math.sin(tilt),Math.cos(tilt)]];

function position(body) {
  if (body === primary) return [0,0,0];
  // This deliberately simple test system has no nested bodies or barycentres.
  // Fail if a future catalogue update changes that, rather than silently guessing.
  assert.deepEqual(body.parents, [{ Star: 0 }]);
  for (const k of ['semiMajorAxis','orbitalEccentricity','orbitalInclination','ascendingNode','argOfPeriapsis','meanAnomaly','orbitalPeriod']) {
    assert(Number.isFinite(body[k]), `${body.name}: missing ${k}`);
  }
  const epochMs = Date.parse(body.timestamps?.meanAnomaly);
  assert(Number.isFinite(epochMs));
  const p = keplerianOffset({
    semiMajorAxis: body.semiMajorAxis * 149597870700,
    eccentricity: body.orbitalEccentricity,
    inclinationDeg: body.orbitalInclination,
    ascendingNodeDeg: -body.ascendingNode,
    periapsisDeg: -body.argOfPeriapsis,
    meanAnomalyDeg: body.meanAnomaly,
    orbitalPeriodSec: body.orbitalPeriod * 86400,
    epochMs,
  }, t);
  const v = mv(frame, [p.x,p.y,p.z]);
  assert(v.every(Number.isFinite));
  return v;
}

const observer = bodies.find(b => b.bodyId === f.observerBodyId);
assert(observer?.isLandable && observer.radius > 0);
const o = position(observer);
const origin = ['x','y','z'].map(k => f.system.coords[k]);
const external = f.externalReferences.map(r => ({
  name: r.name, role: r.role,
  galacticDirection: unit(sub(r.coords, origin)),
  distanceLy: Math.hypot(...sub(r.coords, origin)),
}));
const targets = f.localTargetBodyIds.map(id => {
  const b = bodies.find(b => b.bodyId === id);
  assert(b);
  const v = sub(position(b), o), distance = Math.hypot(...v), local = unit(v);
  const gal = mv(f.frozenCandidateLocalToGalactic, local);
  assert(Math.abs(Math.hypot(...gal)-1) < 1e-10);
  return { name: b.name, distanceLs: distance / 299792458,
    candidateLocalDirection: local, predictedGalacticDirection: gal,
    observerOffsetBoundDeg: Math.asin((observer.radius + f.maximumAltitudeKm)*1000/distance) / DEG,
    predictedExternalSeparations: external.map(r => ({name:r.name, degrees:angle(gal,r.galacticDirection)})),
  };
});
const references = external.map(r => r.galacticDirection);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const n = unit(cross(references[0],references[1]));
const thirdOutOfPlane = Math.asin(Math.abs(n.reduce((s,x,i)=>s+x*references[2][i],0))) / DEG;
console.log(JSON.stringify({
  ...(freshJournal ? { inputVariant: 'Fresh Darkes Hollow journal scan; all other inputs and frozen matrix unchanged' } : {}),
  warning:'Unvalidated transfer hypothesis. Values are predictions using the frozen Vega matrix, not observed Altair alignment. Recompute at each actual capture timestamp without changing that matrix.',
  timestamp, system:f.system.name, observer:observer.name,
  maximumAltitudeKm:f.maximumAltitudeKm, frozenMatrix:f.frozenCandidateLocalToGalactic,
  targets, localTargetSeparationDeg:angle(targets[0].candidateLocalDirection,targets[1].candidateLocalDirection),
  externalReferences:external,
  externalPairAngles:external.flatMap((a,i)=>external.slice(i+1).map(b=>({a:a.name,b:b.name,degrees:angle(a.galacticDirection,b.galacticDirection)}))),
  siriusMirrorPredictionSeparationDeg:2*thirdOutOfPlane,
},null,2));
