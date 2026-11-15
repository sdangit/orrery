// Historical screenshot comparison at true distances. Default replays the
// frozen pre-correction baseline; --current-production uses the live code path.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { scenePosition as currentScenePosition } from '../../ui/src/scene-builder.js';
import { absolutePosition as legacyPosition } from './legacy-orbit-position.mjs';
import { METRES_PER_UNIT } from '../../ui/src/scale-modes.js';
import { keplerianOffset } from '../../shared/src/kepler.js';
// Default keeps the historical before/after research report reproducible.
// --current-production verifies today's renderer separately.
const scenePosition = process.argv.includes('--current-production') ? currentScenePosition
  : (nodes,id,t) => { const p=legacyPosition(nodes,id,t); return {x:p.x/METRES_PER_UNIT,y:p.y/METRES_PER_UNIT,z:p.z/METRES_PER_UNIT}; };
const f=JSON.parse(readFileSync(new URL('./fixtures/altair-transfer-plan.json',import.meta.url)));
const DEG=Math.PI/180,AU=149597870700;
const bodies=f.system.bodies;
const nodes=new Map(bodies.map(b=>[b.bodyId,{parentId:b.parents?.[0]?Object.values(b.parents[0])[0]:null,elements:b.semiMajorAxis==null?null:{semiMajorAxis:b.semiMajorAxis*AU,eccentricity:b.orbitalEccentricity,inclinationDeg:b.orbitalInclination,ascendingNodeDeg:b.ascendingNode,periapsisDeg:b.argOfPeriapsis,meanAnomalyDeg:b.meanAnomaly,orbitalPeriodSec:b.orbitalPeriod*86400,epochMs:Date.parse(b.timestamps.meanAnomaly)}}]));
const tilt=bodies[0].axialTilt,c=Math.cos(tilt),s=Math.sin(tilt);
const candidate=p=>[p.x,c*p.y-s*p.z,s*p.y+c*p.z].map(x=>x/AU);
const rows=['06:35:47','06:35:57','06:37:44'].map(time=>{
 const timestamp=`2026-11-15T${time}Z`,t=Date.parse(timestamp);
 return {timestamp,models:['production','candidate'].map(model=>({model,bodies:bodies.map(b=>{
  const e=nodes.get(b.bodyId).elements;
  if(model==='production') {
   const p=scenePosition(nodes,b.bodyId,t,true);
   return {id:b.bodyId,name:b.name,positionAU:[p.x,p.y,p.z].map(x=>x*METRES_PER_UNIT/AU)};
  }
  if(!e)return {id:b.bodyId,name:b.name,positionAU:[0,0,0]};
  assert.deepEqual(b.parents,[{Star:0}]);
  return {id:b.bodyId,name:b.name,positionAU:candidate(keplerianOffset({...e,ascendingNodeDeg:-e.ascendingNodeDeg,periapsisDeg:-e.periapsisDeg},t))};
 }),orbits:bodies.filter(b=>b.bodyId!==0).map(b=>{
  const e=nodes.get(b.bodyId).elements;
  return {id:b.bodyId,pointsAU:Array.from({length:361},(_,i)=>{
   const p=keplerianOffset({...e,ascendingNodeDeg:e.ascendingNodeDeg*(model==='candidate'?-1:1),periapsisDeg:e.periapsisDeg*(model==='candidate'?-1:1),meanAnomalyDeg:i,epochMs:t},t);
   return model==='candidate'?candidate(p):[p.x,p.y,p.z].map(x=>x/AU);
  })};
 })}))};
});
console.log(JSON.stringify({warning:'True-distance production scenePosition vs experimental candidate, not a running-app screenshot. Each uses the same frozen catalogue and actual capture epoch.',rows},null,2));
