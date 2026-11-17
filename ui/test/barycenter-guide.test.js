import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createBarycenterGuide, bindBarycenterToggle } from '../src/barycenter-guide.js';
import { scenePosition } from '../src/scene-builder.js';

function setup() {
  const guide = createBarycenterGuide();
  const camera = new THREE.PerspectiveCamera(15,1.5,.01,1e9);
  camera.position.set(0,0,100);
  camera.lookAt(0,0,0);
  const nodes = new Map([[2,{kind:'Barycentre'}],[8,{kind:'Barycentre'}],[3,{kind:'Planet'}]]);
  const options = {nodes, camera, viewportHeight:1000, getPosition:()=>new THREE.Vector3()};
  return {guide,camera,nodes,options};
}

test('guides distinguish selection/focus brightness, exclude physical bodies, and release stale resources', () => {
  const {guide,options} = setup();
  guide.update({...options,selectedId:3,focusedId:'system'});
  assert.equal(guide.group.children.length,2);
  assert.ok(guide.group.children.every(x=>!x.visible),'unresolved child separation stays hidden');
  guide.update({...options,selectedId:2,focusedId:2});
  assert.equal(guide.group.children.length,2);
  const anchor = guide.group.children[0];
  assert.equal(anchor.children.length,1,'only the cross marker, without a text label');
  let disposed=0;
  for (const resource of [anchor.children[0].geometry,anchor.children[0].material]) resource.addEventListener('dispose',()=>disposed++);
  guide.update({...options,selectedId:8,focusedId:2});
  assert.equal(guide.group.children.length,2);
  const focusedOpacity=anchor.children[0].material.opacity;
  const selectedOpacity=guide.group.children[1].children[0].material.opacity;
  assert.ok(selectedOpacity>focusedOpacity);
  guide.update({...options,selectedId:3,focusedId:8});
  assert.ok(anchor.children[0].material.opacity<focusedOpacity);
  assert.equal(disposed,0,'changing selection reuses existing geometry');
  options.nodes.delete(2);
  guide.update(options);
  assert.equal(disposed,2);
  assert.deepEqual(guide.group.children.map(x=>x.userData.orbitalGroupId),[8]);
  guide.dispose();
  assert.equal(guide.group.children.length,0);
});

test('inactive guides reveal with child separation, retain hysteresis, and honor the master toggle', () => {
  const {guide,camera,options,nodes} = setup();
  nodes.set(3,{kind:'Planet',parentId:2});
  nodes.set(4,{kind:'Planet',parentId:2});
  const unit=200*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/1000;
  let separation=20;
  const getPosition=id=>new THREE.Vector3(id===3?-separation*unit/2:id===4?separation*unit/2:0,0,0);
  const update=extra=>guide.update({...options,getPosition,...extra});
  update();const anchor=guide.group.children[0];
  assert.equal(anchor.visible,false);
  separation=26;update();assert.equal(anchor.visible,true);
  separation=20;update();assert.equal(anchor.visible,true);
  separation=16;update();assert.equal(anchor.visible,false);
  update({selectedId:2});assert.equal(anchor.visible,true);
  update({focusedId:2});assert.equal(anchor.visible,true);
  update({focusedId:2,visible:false});assert.equal(guide.group.visible,false);
  update({focusedId:2});assert.equal(guide.group.visible,true);
  separation=26;update({labelScale:2});assert.equal(anchor.visible,false,'larger markers need more room');
  update({getPosition:id=>id===3?null:getPosition(id)});
  assert.equal(anchor.visible,false,'missing child positions do not fabricate separation');
  guide.dispose();
});

test('barycenter toggle defaults on and restores the saved browser preference', () => {
  const values=new Map(),changes=[];
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const toggle={addEventListener(type,fn){this[type]=fn;}};
  const root={getElementById:()=>toggle};
  const bind=()=>bindBarycenterToggle({root,storage,onChange:value=>changes.push(value)});
  bind();assert.equal(toggle.checked,true);
  toggle.checked=false;toggle.change();bind();
  assert.equal(toggle.checked,false);
  assert.deepEqual(changes,[true,false,false]);
});

test('cross stays screen-sized through zoom and rotation, respects label scale, and hides invalid/offscreen positions', () => {
  const {guide,camera,options} = setup();
  const update = extra => guide.update({...options,selectedId:2,...extra});
  update();
  const anchor = guide.group.children[0], marker=anchor.children[0];
  const originalSize=marker.scale.x;
  camera.position.set(100,0,0);camera.lookAt(0,0,0);
  update();
  assert.ok(marker.quaternion.angleTo(camera.quaternion)<1e-8);
  assert.ok(Math.abs(marker.scale.x-originalSize)<1e-12);
  camera.position.set(10,0,0);camera.lookAt(0,0,0);
  update();
  assert.ok(Math.abs(marker.scale.x/originalSize-.1)<1e-12,'constant projected size as depth changes');
  update({labelScale:2});
  assert.ok(Math.abs(marker.scale.x/originalSize-.2)<1e-12);
  for(const position of [null,new THREE.Vector3(NaN,0,0),new THREE.Vector3(20,0,0),new THREE.Vector3(0,1e5,0)]) {
    update({getPosition:()=>position});assert.equal(anchor.visible,false);
  }
  update();assert.equal(anchor.visible,true);
  guide.dispose();
});

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nusakan-orbital-group.json',import.meta.url)));
for(const trueDistances of [false,true]) test(`guide follows the existing ${trueDistances?'true-distance':'compact'} group orbit through playback`, () => {
  const {guide,camera,options} = setup();
  const nodes = new Map(fixture.nodes.map(n=>[n.id,n]));
  let time = nodes.get(2).elements.epochMs;
  const getPosition = id => {
    const p=scenePosition(nodes,id,time,trueDistances);
    return new THREE.Vector3(p.x,p.y,p.z);
  };
  let previous;
  for(const days of [0,30]) {
    time+=days*86400000;
    const position=getPosition(2);
    camera.position.copy(position).add(new THREE.Vector3(0,0,100));camera.lookAt(position);
    guide.update({...options,nodes,getPosition,selectedId:2});
    const anchor=guide.group.children[0];
    assert.equal(anchor.visible,true);
    assert.deepEqual(anchor.position,position);
    if(previous) assert.ok(previous.distanceTo(anchor.position)>.1);
    previous=anchor.position.clone();
  }
  guide.dispose();
});
