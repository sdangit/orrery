import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies } from '@orrery/shared';
import { createBodyNavigation, SYSTEM } from '../src/body-navigation.js';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from '../src/scene-builder.js';
const read=(source,key)=>JSON.parse(readFileSync(new URL(`../../shared/test/fixtures/${source}-${key}.json`,import.meta.url)));
const at=Date.parse('2026-11-14T07:40:00Z');
for(const [key,count,groups,depth] of [['bleia',173,11,5],['hip97950',40,4,3]]) {
  const edsm={...read('edsm',key),receivedAt:at};
  const spansh={...read('spansh',key),receivedAt:at};
  test(`${key}: both providers agree on physical bodies; Spansh supplies orbital groups`,()=>{
    assert.equal(edsm.bodies.length,count);
    assert.equal(spansh.bodies.filter(b=>b.type==='Barycentre').length,groups);
    assert.deepEqual(new Set(edsm.bodies.map(b=>b.bodyId)), new Set(spansh.bodies.filter(b=>b.type!=='Barycentre').map(b=>b.bodyId)));
    assert.equal(Math.max(...edsm.bodies.map(b=>b.parents?.length??0)),depth);
  });
  test(`${key}: every body and group is reachable, with complete parent navigation`,()=>{
    const {nodes,diagnostics}=mergeCommunityBodies(new Map(),{edsm,spansh});
    assert.deepEqual(diagnostics,[]);
    const nav=createBodyNavigation(nodes);
    assert.equal(nav.descendants(SYSTEM).length,count+groups);
    for(const id of nav.descendants(SYSTEM)) {
      const path=nav.path(id);
      assert.equal(path.at(-1),id);
      assert.ok(path.length<=depth+2);
      for(let i=1;i<path.length;i++) assert.ok(nav.children(path[i-1]).includes(path[i]));
      const siblings=nav.siblings(id);
      let current=id;
      const visited=new Set();
      for(let i=0;i<siblings.length;i++){visited.add(current);current=nav.sibling(current,1)}
      assert.equal(current,id);
      assert.equal(visited.size,siblings.length);
    }
  });
  test(`${key}: EDSM alone retains navigable missing groups without invented positions`,()=>{
    const {nodes,diagnostics}=mergeCommunityBodies(new Map(),{edsm});
    assert.ok(diagnostics.length>0);
    const nav=createBodyNavigation(nodes);
    for(const body of edsm.bodies) assert.ok(nav.descendants(SYSTEM).includes(body.bodyId));
    for(const node of nodes.values()) if(node.inferred && node.id!==0) {
      assert.equal(node.elements,null);
      assert.equal(node.positionQuality,'unresolved');
    }
  });
  for(const scaleMode of ['compact','distances','realistic']) test(`${key}: ${scaleMode} renders all ${count} bodies through time warp`,()=>{
    const {nodes}=mergeCommunityBodies(new Map(),{edsm,spansh});
    const built=buildSystemScene(nodes,at,edsm.systemName,'exploration',{}, {scaleMode});
    assert.equal(built.pickables.size,count);
    for(const time of [at,at+1e12,at-1e12]) {
      updateSystemScene(nodes,built.updatables,time,{scaleMode});
      built.group.traverse(obj=>assert.ok(obj.position.toArray().every(Number.isFinite)));
      for(const entry of built.updatables.values()) assert.ok(entry.radius>=0);
    }
    disposeSystemScene(built.group);
  });
}
