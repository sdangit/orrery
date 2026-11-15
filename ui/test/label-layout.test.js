import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { visibleBodyLabels, collapsedLabelHosts } from '../src/label-layout.js';
import { updateBodyAnnotations, makeBodyMarker } from '../src/body-markers.js';
import { makeLabel } from '../src/labels.js';

const entries = new Map([
  [0,{ kind:'Star',parentId:null,label:{} }],
  [1,{ kind:'Planet',parentId:0,label:{} }],
  [2,{ kind:'Planet',parentId:1,label:{} }],
  [3,{ kind:'Planet',parentId:0,label:{} }],
]);
const candidate = (id,x,y=100,wasVisible=false,width=50) => ({ id,bodyX:x,bodyY:y,wasVisible,
  rect:{ left:x-width/2,right:x+width/2,top:y-9,bottom:y+9 } });

test('zoom reveals parent then moons; plus moves to the remaining collapsed group and disappears', () => {
  for (const [points,expected,pluses] of [
    [[candidate(0,0),candidate(1,8),candidate(2,12)],[0],[0]],
    [[candidate(0,0),candidate(1,100),candidate(2,112)],[0,1],[1]],
    [[candidate(0,0),candidate(1,100),candidate(2,180)],[0,1,2],[]],
  ]) {
    const visible=visibleBodyLabels(points,entries,null);
    assert.deepEqual([...visible],expected);
    assert.deepEqual([...collapsedLabelHosts(points,visible)],pluses);
  }
});

test('both stars in a crowded binary stay labelled; selection overrides child decluttering', () => {
  const binary=new Map(entries);
  binary.set(4,{ kind:'Barycentre',parentId:null,label:null });
  binary.set(0,{ kind:'Star',parentId:4,label:{} });
  binary.set(5,{ kind:'Star',parentId:4,label:{} });
  const points=[candidate(0,100),candidate(5,103),candidate(1,105),candidate(2,106)];
  const visible=visibleBodyLabels(points,binary,2);
  assert.deepEqual([...visible],[2,0,5]);
  assert.equal(visible.has(1),false);
});

test('invisible barycentres do not prevent readable children and absent off-screen parents do not suppress local labels', () => {
  const grouped=new Map(entries);
  grouped.set(4,{ kind:'Barycentre',parentId:0,label:null });
  grouped.set(1,{ kind:'Planet',parentId:4,label:{} });
  assert.deepEqual([...visibleBodyLabels([candidate(0,0),candidate(1,100)],grouped,null)],[0,1]);
  assert.deepEqual([...visibleBodyLabels([candidate(1,100),candidate(2,180)],grouped,null)],[1,2]);
});

test('small sibling overlap is allowed, but substantial overlap is suppressed deterministically', () => {
  for (const [x,expected] of [[145,true],[120,false]]) {
    const points=[candidate(0,0),candidate(1,100),candidate(3,x)];
    assert.equal(visibleBodyLabels(points,entries,null).has(3),expected);
    assert.equal(visibleBodyLabels([...points].reverse(),entries,null).has(3),expected);
  }
});

test('separate reveal/hide thresholds prevent labels flickering around the distance boundary', () => {
  let previous=false;
  for (const [distance,expected] of [[35,true],[28,true],[23,false],[28,false],[33,true]]) {
    const points=[candidate(0,0,100,true,12),candidate(1,distance,100,previous,12)];
    previous=visibleBodyLabels(points,entries,null).has(1);
    assert.equal(previous,expected,`parent separation ${distance}px`);
  }
});

test('actual annotation projection declutters labels and hints while keeping hidden bodies and markers pickable', () => {
  const updatables=new Map();
  for (const [id,x] of [[0,0],[1,1],[2,1.1]]) {
    const bodyGroup=new THREE.Group();bodyGroup.position.set(x,0,0);
    const label=makeLabel(`Body ${id}`,'#fff'),labelHint=makeLabel('+','#fff');
    for (const sprite of [label,labelHint]) sprite.userData.aspect=sprite.scale.x/sprite.scale.y;
    updatables.set(id,{ bodyGroup,label,labelHint,radius:.00001,marker:makeBodyMarker('#fff'),
      kind:id===0?'Star':'Planet',parentId:id===0?null:id-1 });
  }
  const camera=new THREE.PerspectiveCamera(15,1.5,1e-6,1e9);
  camera.position.set(0,0,1000);camera.lookAt(0,0,0);
  updateBodyAnnotations(updatables,camera,1000);
  assert.equal(updatables.get(0).label.visible,true);
  assert.equal(updatables.get(0).labelHint.visible,true);
  assert.equal(updatables.get(1).label.visible,false);
  assert.equal(updatables.get(1).marker.visible,true);
  assert.equal(updatables.get(1).bodyGroup.visible,true);
  camera.position.set(1.1,0,5);camera.lookAt(1.1,0,0);
  updateBodyAnnotations(updatables,camera,1000);
  assert.equal(updatables.get(2).label.visible,true);
  assert.equal(updatables.get(1).labelHint.visible,false);
  camera.lookAt(1.1,0,10);
  updateBodyAnnotations(updatables,camera,1000,{ selectedId:1 });
  for (const entry of updatables.values()) {
    assert.equal(entry.label.visible,false);
    assert.equal(entry.labelHint.visible,false);
  }
});
