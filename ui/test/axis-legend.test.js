import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { axisLegendDirections } from '../src/axis-legend.js';

test('axis legend matches top/bottom orientation and ignores camera pan, zoom and FOV', () => {
  const camera=new THREE.PerspectiveCamera(15,1.5,.001,1e9);
  camera.position.set(0,0,100); camera.up.set(0,1,0); camera.lookAt(0,0,0);
  const axes=axisLegendDirections(camera);
  const positive=label=>axes.find(a=>a.label===label&&a.positive);
  assert.ok(positive('X').x>.999999 && positive('Y').y>.999999 && positive('Z').depth>.999999);
  camera.position.set(1e6,-3e6,1);camera.fov=55;camera.updateProjectionMatrix();
  assert.deepEqual(axisLegendDirections(camera),axes);
  camera.position.set(0,0,-100);camera.lookAt(0,0,0);
  const below=axisLegendDirections(camera);
  assert.ok(below.find(a=>a.label==='Z'&&a.positive).depth<-.999999);
  for (const label of ['X','Y','Z']) {
    const pair=below.filter(a=>a.label===label);
    assert.ok(Math.abs(pair[0].x+pair[1].x)+Math.abs(pair[0].y+pair[1].y)+Math.abs(pair[0].depth+pair[1].depth)<1e-10);
  }
});
