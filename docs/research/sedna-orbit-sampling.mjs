// Compare actual scene/GPU curves with an independent dense eccentric-anomaly ellipse.
// Uses frozen Sol provider data; no camera or orbital parameters are fitted.
import '../../ui/test/dom-shim.js';
import {readFileSync} from 'node:fs';
import {mergeCommunityBodies,eliteOrbitalFrame,compressOffset,eliteKeplerianOffset} from '../../shared/src/index.js';
import {buildSystemScene,disposeSystemScene} from '../../ui/src/scene-builder.js';
const spansh=JSON.parse(readFileSync(new URL('../../shared/test/fixtures/spansh-sol-distant.json',import.meta.url)));
const {nodes}=mergeCommunityBodies(new Map(),{spansh}); const node=nodes.get(45),e=node.elements,a=e.semiMajorAxis,b=a*Math.sqrt(1-e.eccentricity**2),frame=eliteOrbitalFrame(e);
const result=[];
for(const scaleMode of ['compact','distances','realistic']) {
 const physical=scaleMode!=='compact',scale=physical?a/1e9:compressOffset({x:a,y:0,z:0}).x;
 const built=buildSystemScene(nodes,Date.parse('2026-11-15T20:00:00Z'),'Sol','exploration',{}, {scaleMode});const entry=built.updatables.get(45),line=entry.orbit;
 const points=[];for(let i=0;i<Math.min(line.geometry.drawRange.count,line.geometry.attributes.position.count);i++){
 const at=line.geometry.attributes.position;const p=[at.getX(i)+line.position.x,at.getY(i)+line.position.y,at.getZ(i)+line.position.z];points.push([0,1,2].map(k=>frame.reduce((sum,row,j)=>sum+row[k]*p[j],0)));}
 const legacy=Array.from({length:97},(_,i)=>{const p=eliteKeplerianOffset(e,e.epochMs+i/96*e.orbitalPeriodSec*1000);const v=physical?{x:p.x/1e9,y:p.y/1e9,z:p.z/1e9}:compressOffset(p);return [0,1,2].map(k=>frame.reduce((sum,row,j)=>sum+row[k]*[v.x,v.y,v.z][j],0));});
 function audit(vertices){let max=0,inner=0;for(let i=0;i<8192;i++){const E=i/8192*2*Math.PI,p0={x:a*(Math.cos(E)-e.eccentricity),y:b*Math.sin(E),z:0},p=physical?[p0.x/1e9,p0.y/1e9,0]:Object.values(compressOffset(p0));let closest=Infinity;for(let j=1;j<vertices.length;j++){const start=vertices[j-1],end=vertices[j],d=end.map((v,k)=>v-start[k]),q=p.map((v,k)=>v-start[k]);const dot=d.reduce((s,v,k)=>s+v*q[k],0),dd=d.reduce((s,v)=>s+v*v,0),t=dd?Math.max(0,Math.min(1,dot/dd)):0;closest=Math.min(closest,Math.hypot(...q.map((v,k)=>v-t*d[k])));}max=Math.max(max,closest/scale);if(p0.x>0)inner=Math.max(inner,closest/scale);}return {maxRelativeError:max,innerRelativeError:inner};}
 result.push({scaleMode,vertices:points.length,legacy:audit(legacy),refined:audit(points)});disposeSystemScene(built.group);
}
console.log(JSON.stringify(result,null,2));
