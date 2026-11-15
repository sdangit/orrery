// Research-only prediction from recorded journal scans, not a sky-frame solution.
// Run: node docs/research/vega-capture-geometry.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { keplerianOffset } from '../../shared/src/kepler.js';
import { absolutePosition } from './legacy-orbit-position.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/vega-capture-scans.json', import.meta.url)));
const bodies = new Map(fixture.scans.map(b => [b.BodyID, b]));
const productionNodes = new Map(fixture.scans.map(b => [b.BodyID, {
  parentId: b.Parents?.[0] ? Object.values(b.Parents[0])[0] : null,
  elements: b.SemiMajorAxis == null ? null : {
    semiMajorAxis: b.SemiMajorAxis, eccentricity: b.Eccentricity,
    inclinationDeg: b.OrbitalInclination, ascendingNodeDeg: b.AscendingNode,
    periapsisDeg: b.Periapsis, meanAnomalyDeg: b.MeanAnomaly,
    orbitalPeriodSec: b.OrbitalPeriod, epochMs: Date.parse(b.timestamp),
  },
}]));
const I = [[1,0,0],[0,1,0],[0,0,1]], deg = Math.PI / 180;
const mv = (a,v) => a.map(r => r.reduce((s,x,i) => s+x*v[i],0));
const mm = (a,b) => a.map(r => b[0].map((_,i) => r.reduce((s,x,j) => s+x*b[j][i],0)));
const sub = (a,b) => a.map((x,i) => x-b[i]);
function rot(axis,a) {
  const c=Math.cos(a),s=Math.sin(a);
  return axis==='x' ? [[1,0,0],[0,c,-s],[0,s,c]] : [[c,-s,0],[s,c,0],[0,0,1]];
}
function state(id,t,candidate) {
  const b=bodies.get(id);
  if(!b) throw Error(`Missing body ${id}`);
  let v=[0,0,0],q=I;
  if(b.SemiMajorAxis!=null) {
    const sign=candidate ? -1 : 1;
    const e={semiMajorAxis:b.SemiMajorAxis,eccentricity:b.Eccentricity,
      inclinationDeg:b.OrbitalInclination,ascendingNodeDeg:sign*b.AscendingNode,
      periapsisDeg:sign*b.Periapsis,meanAnomalyDeg:b.MeanAnomaly,
      orbitalPeriodSec:b.OrbitalPeriod,epochMs:Date.parse(b.timestamp)};
    const p=keplerianOffset(e,t);v=[p.x,p.y,p.z];
    q=mm(mm(rot('z',e.ascendingNodeDeg*deg),rot('x',e.inclinationDeg*deg)),rot('z',e.periapsisDeg*deg));
  }
  const parent=b.Parents?.[0];
  const p=parent ? state(Object.values(parent)[0],t,candidate) : {position:[0,0,0],frame:I};
  return {position:mv(p.frame,v).map((x,i)=>x+p.position[i]),
    frame:candidate ? mm(mm(p.frame,q),rot('x',b.AxialTilt??0)) : I};
}
const times=['05:19:52','05:20:05','05:20:15','05:20:42','05:22:12','05:22:33','05:22:54',
  '05:32:17','05:33:17','05:33:59','05:34:37','05:36:36','05:43:12','05:50:28'];
const altitudesM=[970,970,970,970,7750,7750,7750,6270,6270,6260,6260,6260,700,400];
const rows=times.map((time,index)=>{
  const timestamp=`2026-11-15T${time}Z`,t=Date.parse(timestamp);
  for (const id of bodies.keys()) {
    const actual = absolutePosition(productionNodes, id, t);
    assert(Math.hypot(...sub(state(id,t,false).position, [actual.x,actual.y,actual.z])) < 1,
      'Baseline must reproduce the production solver to within one metre');
  }
  return {timestamp,models:[false,true].map(candidate=>{
    const origin=state(12,t,candidate).position;
    const targets=[0,2,11].map(id=>{
      const v=sub(state(id,t,candidate).position,origin),d=Math.hypot(...v);
      return {name:bodies.get(id).BodyName,distanceLs:d/299792458,direction:v.map(x=>x/d),
        observerOffsetBoundDeg:Math.asin((bodies.get(12).Radius+altitudesM[index])/d)/deg};
    });
    return {convention:candidate?'candidate-inherit-orbit-and-tilt':'orrery-current',targets,
      vegaSeparationDeg:Math.acos(targets[0].direction.reduce((s,x,i)=>s+x*targets[1].direction[i],0))/deg};
  })};
});
const separation=(h1,p1,h2,p2)=>Math.acos(Math.sin(p1*deg)*Math.sin(p2*deg)+Math.cos(p1*deg)*Math.cos(p2*deg)*Math.cos((h1-h2)*deg))/deg;
console.log(JSON.stringify({warning:'Near-body centre approximation. HUD clock plus local screenshot date identifies UTC date. No global orientation is inferred.',rows,
  independentRoundedHudCheck:{vega2:{heading:54,pitch:33},vega:{heading:26,pitch:46},separationDeg:separation(54,33,26,46),
  caveat:'Integer readouts and slight target centring offsets limit angular precision; views are 37 seconds apart.'}},null,2));
