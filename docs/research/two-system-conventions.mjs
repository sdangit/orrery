// Exploratory post-transfer audit. Generate local directions without sky fitting.
// Uses the actual shared Kepler routine and only captured inputs.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { keplerianOffset } from '../../shared/src/kepler.js';
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const vega = read('./fixtures/vega-capture-scans.json').scans;
const plan = read('./fixtures/altair-transfer-plan.json');
const altair = plan.system.bodies.map(b => ({
  BodyID:b.bodyId, BodyName:b.name, Parents:b.parents, AxialTilt:b.axialTilt,
  SemiMajorAxis:b.semiMajorAxis == null ? null : b.semiMajorAxis*149597870700,
  Eccentricity:b.orbitalEccentricity, OrbitalInclination:b.orbitalInclination,
  AscendingNode:b.ascendingNode, Periapsis:b.argOfPeriapsis, MeanAnomaly:b.meanAnomaly,
  OrbitalPeriod:b.orbitalPeriod*86400, timestamp:b.timestamps?.meanAnomaly,
}));
const I=[[1,0,0],[0,1,0],[0,0,1]], DEG=Math.PI/180;
const mv=(a,v)=>a.map(r=>r.reduce((s,x,i)=>s+x*v[i],0));
const mm=(a,b)=>a.map(r=>b[0].map((_,i)=>r.reduce((s,x,j)=>s+x*b[j][i],0)));
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const rot=(axis,a)=>{const c=Math.cos(a),s=Math.sin(a);return axis==='x'?[[1,0,0],[0,c,-s],[0,s,c]]:[[c,-s,0],[s,c,0],[0,0,1]];};
function targets(scans, observer, ids, timestamp, cfg) {
  const byId=new Map(scans.map(b=>[b.BodyID,b])),cache=new Map(),t=Date.parse(timestamp);
  function state(id) {
    if(cache.has(id))return cache.get(id);
    const b=byId.get(id);assert(b);
    const parent=b.Parents?.[0],p=parent?state(Object.values(parent)[0]):{position:[0,0,0],frame:I};
    let v=[0,0,0],q=I;
    if(b.SemiMajorAxis!=null) {
      const [si,sn,sp]=cfg.signs;
      const e={semiMajorAxis:b.SemiMajorAxis,eccentricity:b.Eccentricity,
        inclinationDeg:si*b.OrbitalInclination,ascendingNodeDeg:sn*b.AscendingNode,
        periapsisDeg:sp*b.Periapsis,meanAnomalyDeg:cfg.phaseSign*b.MeanAnomaly,
        orbitalPeriodSec:cfg.phaseSign*b.OrbitalPeriod,epochMs:Date.parse(b.timestamp)};
      const k=keplerianOffset(e,t);v=[k.x,k.y,k.z];
      q=mm(rot('z',e.ascendingNodeDeg*DEG),rot('x',e.inclinationDeg*DEG));
      if(cfg.inherit!=='plane')q=mm(q,rot('z',e.periapsisDeg*DEG));
    }
    const position=mv(p.frame,v).map((x,i)=>x+p.position[i]);
    const tilt=rot('x',(b.AxialTilt??0)*(parent?cfg.childTiltSign:cfg.rootTiltSign));
    let frame=I;
    if(cfg.inherit!=='none')frame=mm(p.frame,q);
    // 'before' means tilt before this body's inherited orbital orientation.
    frame=cfg.tiltOrder==='after'?mm(frame,tilt):(cfg.inherit==='none'?tilt:mm(p.frame,mm(tilt,q)));
    assert(position.every(Number.isFinite));
    const result={position,frame};cache.set(id,result);return result;
  }
  const origin=state(observer).position;
  return ids.map(id=>{const v=sub(state(id).position,origin),d=Math.hypot(...v);return {name:byId.get(id).BodyName,distanceLs:d/299792458,direction:v.map(x=>x/d)};});
}
const rows=[];
for(const si of [1,-1])for(const sn of [1,-1])for(const sp of [1,-1])
for(const inherit of ['none','plane','orbit'])for(const childTiltSign of [0,1,-1])
for(const rootTiltSign of [0,1,-1])for(const tiltOrder of ['after','before'])for(const phaseSign of [1,-1]) {
  const cfg={signs:[si,sn,sp],inherit,childTiltSign,rootTiltSign,tiltOrder,phaseSign};
  rows.push({cfg,
    vega:targets(vega,12,[0,2],'2026-11-15T05:43:12Z',cfg),
    tracy:targets(vega,12,[11],'2026-11-15T05:50:28Z',cfg)[0],
    altair:[targets(altair,3,[4],'2026-11-15T06:20:13Z',cfg)[0],targets(altair,3,[0],'2026-11-15T06:22:34Z',cfg)[0]],
  });
}
// Guard the original candidate and the actual app baseline against transcription errors.
const geom=read('./vega-capture-geometry-results.json').rows.find(r=>r.timestamp==='2026-11-15T05:43:12Z');
for(const [model,match] of [[0,c=>c.signs.every(x=>x===1)&&c.inherit==='none'&&c.childTiltSign===0&&c.rootTiltSign===0&&c.phaseSign===1],
  [1,c=>String(c.signs)==='1,-1,-1'&&c.inherit==='orbit'&&c.childTiltSign===1&&c.rootTiltSign===1&&c.phaseSign===1&&c.tiltOrder==='after']]) {
  const row=rows.find(r=>match(r.cfg));assert(row);
  row.vega.forEach((v,i)=>assert(Math.hypot(...sub(v.direction,geom.models[model].targets[i].direction))<1e-12));
}
console.log(JSON.stringify({warning:'Exploratory discrete convention search after the Altair failure. No configuration is a validated fix merely because it scores well.',rows}));
