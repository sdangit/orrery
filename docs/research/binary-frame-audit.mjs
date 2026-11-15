// Compare the frozen pre-binary hierarchy with today's production solver.
// node docs/research/binary-frame-audit.mjs > docs/research/binary-frame-results.json
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies, absolutePosition, keplerianOffset } from '../../shared/src/index.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const captured = read('./fixtures/orbital-frame-snapshots.json').systems;
const timb = read('../../shared/test/fixtures/spansh-timbalderis-orbits.json');
const systems = [...captured, { name: 'Timbalderis', bodies: timb.bodies, source_url: timb.source }];
const I = [[1,0,0],[0,1,0],[0,0,1]];
const mul = (a,b) => a.map(r => b[0].map((_,i) => r.reduce((s,x,j) => s+x*b[j][i],0)));
const mv = (a,v) => a.map(r => r.reduce((s,x,j) => s+x*v[j],0));
function rotation(axis,a) {
  const c=Math.cos(a),s=Math.sin(a);
  return axis==='x'?[[1,0,0],[0,c,-s],[0,s,c]]:[[c,-s,0],[s,c,0],[0,0,1]];
}
function before(nodes,id,t) {
  if(id==null) return {p:[0,0,0],f:I};
  const n=nodes.get(id),parent=before(nodes,n.parentId,t),e=n.elements,d=Math.PI/180;
  const v=e?keplerianOffset({...e,inclinationDeg:-e.inclinationDeg,
    ascendingNodeDeg:-e.ascendingNodeDeg,periapsisDeg:-e.periapsisDeg},t):{x:0,y:0,z:0};
  const p=mv(parent.f,[v.x,v.y,v.z]).map((x,i)=>x+parent.p[i]);
  let f=parent.f;
  if(e)f=mul(f,mul(mul(rotation('z',-e.ascendingNodeDeg*d),rotation('x',-e.inclinationDeg*d)),rotation('z',-e.periapsisDeg*d)));
  if(n.parentId!=null||e)f=mul(f,rotation('x',-(n.raw?.AxialTilt??0)));
  return {p,f};
}
const output=systems.map(system=>{
  const {nodes,diagnostics}=mergeCommunityBodies(new Map(),{spansh:{bodies:system.bodies}});
  if(diagnostics.length)throw new Error(diagnostics.join('\n'));
  const main=system.bodies.find(b=>b.mainStar).bodyId;
  const rows=system.bodies.filter(b=>!b.mainStar&&Number.isFinite(b.distanceToArrival)&&Number.isFinite(Date.parse(b.timestamps?.distanceToArrival))).map(b=>{
    const t=Date.parse(b.timestamps.distanceToArrival),p=absolutePosition(nodes,b.bodyId,t),o=absolutePosition(nodes,main,t);
    const a=before(nodes,b.bodyId,t).p,z=before(nodes,main,t).p;
    const predictedLs=Math.hypot(p.x-o.x,p.y-o.y,p.z-o.z)/299792458;
    const beforeLs=Math.hypot(...a.map((x,i)=>x-z[i]))/299792458;
    return {id:b.bodyId,name:b.name,epoch:b.timestamps.distanceToArrival,observedLs:b.distanceToArrival,
      beforeErrorLs:beforeLs-b.distanceToArrival,afterErrorLs:predictedLs-b.distanceToArrival,
      displacementMetres:Math.hypot(p.x-a[0],p.y-a[1],p.z-a[2])};
  });
  return {system:system.name,source:system.source_url,count:rows.length,
    beforeMaxErrorLs:Math.max(...rows.map(r=>Math.abs(r.beforeErrorLs))),
    afterMaxErrorLs:Math.max(...rows.map(r=>Math.abs(r.afterErrorLs))),rows};
});
console.log(JSON.stringify({warning:'Scalar ranges do not establish absolute 3D/galactic orientation. Before model freezes the post-parity, pre-binary hierarchy.',systems:output},null,2));
