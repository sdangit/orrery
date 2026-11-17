import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeLabel, labelPixelRatio, refreshLabelTextures } from '../src/labels.js';
import { updateBodyAnnotations } from '../src/body-markers.js';

test('DPI changes increase texture resolution without changing label dimensions and dispose replaced textures', () => {
  const label=makeLabel('Vega 2 a','#fff',{pixelRatio:1});
  const initial=label.material.map, width=initial.image.width, scale=label.scale.clone();
  let disposed=false;initial.addEventListener('dispose',()=>disposed=true);
  const entries=new Map([[1,{label}]]);
  refreshLabelTextures(entries,2);
  assert.equal(label.material.map.image.width,width*2);assert.deepEqual(label.scale,scale);assert.equal(disposed,true);
  const current=label.material.map;refreshLabelTextures(entries,2);assert.equal(label.material.map,current);
  assert.equal(labelPixelRatio(2,2),4);assert.equal(labelPixelRatio(3,3),4);
});

test('chosen label size affects projected text and collision spacing without changing bodies or camera', () => {
  const entries=new Map();
  for (const [id,x] of [[0,0],[1,1.5]]) {
    const label=makeLabel(id?'Child':'Star','#fff');label.userData.aspect=label.scale.x/label.scale.y;
    const bodyGroup=new THREE.Group();bodyGroup.position.set(x,0,0);
    entries.set(id,{label,bodyGroup,kind:id?'Planet':'Star',parentId:id?0:null,radius:0});
  }
  const camera=new THREE.PerspectiveCamera(15,1,1e-6,1e6);camera.position.set(0,0,100);camera.lookAt(0,0,0);
  updateBodyAnnotations(entries,camera,1000,{labelScale:1});
  const initial=entries.get(1).label.scale.y;
  assert.equal(entries.get(1).label.visible,true);
  const cameraPosition=camera.position.clone(),bodyPosition=entries.get(1).bodyGroup.position.clone();
  updateBodyAnnotations(entries,camera,1000,{labelScale:3});
  assert.equal(entries.get(1).label.visible,false,'larger text needs more room');
  assert.ok(Math.abs(entries.get(1).label.scale.y/initial-3)<1e-12);
  assert.deepEqual(camera.position,cameraPosition);assert.deepEqual(entries.get(1).bodyGroup.position,bodyPosition);
  updateBodyAnnotations(entries,camera,1000,{labelScale:3,selectedId:1});
  assert.equal(entries.get(1).label.visible,true,'selection remains labelled at larger sizes');
});
