import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeCommunityBodies, eliteOrbitalFrame, compressOffset } from '@orrery/shared';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from '../src/scene-builder.js';

const spansh = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/spansh-sol-distant.json',import.meta.url)));
const { nodes } = mergeCommunityBodies(new Map(),{ spansh });
const node = nodes.get(45), e = node.elements;
const frame = eliteOrbitalFrame(e);

for (const scaleMode of ['compact','distances','realistic']) test(`Sedna ${scaleMode}: entire curve resolves periapsis even while the body is elsewhere`, () => {
  const physical = scaleMode !== 'compact';
  const a = e.semiMajorAxis, b = a*Math.sqrt(1-e.eccentricity**2);
  const scale = physical ? a/1e9 : compressOffset({ x:a,y:0,z:0 }).x;
  // Mean anomaly 180 degrees: local body refinement is at the outer end,
  // so it cannot hide inadequate sampling of the inner swing.
  const time = e.epochMs + (180-e.meanAnomalyDeg)/360*e.orbitalPeriodSec*1000;
  const built = buildSystemScene(nodes,time,'Sol','exploration',{}, { scaleMode });
  try {
    const line = built.updatables.get(45).orbit;
    const attribute = line.geometry.attributes.position;
    const count = Math.min(line.geometry.drawRange.count,attribute.count);
    assert.ok(count < 600,'Sedna should need hundreds, not thousands, of vertices');
    const vertices = Array.from({ length:count },(_,i) => {
      const p = new THREE.Vector3().fromBufferAttribute(attribute,i).add(line.position);
      const v = p.toArray();
      // Undo the orbit orientation to compare with an analytic 2D ellipse.
      return [0,1,2].map(k => frame.reduce((sum,row,j) => sum+row[k]*v[j],0));
    });
    let worst = 0;
    for (let i=0;i<4096;i++) {
      const E=i/4096*2*Math.PI;
      const raw={ x:a*(Math.cos(E)-e.eccentricity),y:b*Math.sin(E),z:0 };
      const point=physical ? [raw.x/1e9,raw.y/1e9,0] : Object.values(compressOffset(raw));
      let closest=Infinity;
      for (let j=1;j<vertices.length;j++) {
        const start=vertices[j-1],end=vertices[j];
        const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2];
        const qx=point[0]-start[0],qy=point[1]-start[1],qz=point[2]-start[2];
        const lengthSq=dx*dx+dy*dy+dz*dz;
        const t=lengthSq ? Math.max(0,Math.min(1,(qx*dx+qy*dy+qz*dz)/lengthSq)) : 0;
        closest=Math.min(closest,Math.hypot(qx-t*dx,qy-t*dy,qz-t*dz));
      }
      worst=Math.max(worst,closest/scale);
    }
    assert.ok(worst<1.1e-4,`curve deviation ${worst} exceeds 0.011% of displayed semimajor-axis scale`);
    if (physical) {
      updateSystemScene(nodes,built.updatables,time+e.orbitalPeriodSec*310,{ scaleMode });
      assert.equal(line.geometry.attributes.position,attribute,'playback must reuse the allocated GPU buffer');
      assert.ok(line.geometry.drawRange.count<=attribute.count);
    }
  } finally { disposeSystemScene(built.group); }
});
