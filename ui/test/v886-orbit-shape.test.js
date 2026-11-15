import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from '../src/scene-builder.js';
import { ORRERY_FOV_DEG } from '../src/camera.js';

const fixture = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/v886-vertical-parity.json', import.meta.url)));
const nodes = new Map(fixture.nodes.map(n => [n.id, n]));
const body = nodes.get(64), e = body.elements;
const a = e.semiMajorAxis / 1e9, b = a * Math.sqrt(1 - e.eccentricity ** 2);
const d = Math.PI / 180, O = -e.ascendingNodeDeg*d, i = -e.inclinationDeg*d, w = -e.periapsisDeg*d;
// Independent analytic axes and focal-sum identity; no Kepler-position helper
// is used to calculate expected samples. Tests the actual scene's GPU vertices.
const x = new THREE.Vector3(Math.cos(O)*Math.cos(w)-Math.sin(O)*Math.sin(w)*Math.cos(i),
  Math.sin(O)*Math.cos(w)+Math.cos(O)*Math.sin(w)*Math.cos(i), Math.sin(w)*Math.sin(i));
const z = new THREE.Vector3(Math.sin(O)*Math.sin(i), -Math.cos(O)*Math.sin(i), Math.cos(i));
const y = new THREE.Vector3().crossVectors(z,x);
const focus2 = x.clone().multiplyScalar(-2*a*e.eccentricity);

for (const scaleMode of ['distances', 'realistic']) {
  test(`V886 10 ${scaleMode}: rendered orbit is the recorded ellipse with the star at a focus`, () => {
    const now = Date.parse('2026-11-15T09:04:42Z');
    const scene = buildSystemScene(nodes, now, fixture.systemName, 'exploration', {}, { scaleMode });
    try {
      for (const time of [now, now+e.orbitalPeriodSec*130, now-e.orbitalPeriodSec*400]) {
        updateSystemScene(nodes, scene.updatables, time, { scaleMode });
        const line = scene.updatables.get(64).orbit;
        const star = scene.updatables.get(0).bodyGroup.position;
        const points = Array.from({ length: line.geometry.drawRange.count }, (_, index) =>
          new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position,index).add(line.position).sub(star));
        assert.ok(points[0].distanceTo(points.at(-1)) < 1e-10, 'closed orbit');
        for (const p of points) {
          const ellipse = ((p.dot(x)+a*e.eccentricity)/a)**2 + (p.dot(y)/b)**2;
          assert.ok(Math.abs(ellipse-1) < 5e-7, 'vertex must lie on the recorded ellipse');
          assert.ok(Math.abs(p.dot(z))/a < 1e-7, 'orbit must lie in its recorded plane');
          assert.ok(Math.abs(p.length()+p.distanceTo(focus2)-2*a)/a < 5e-7, 'star is a focus, not the centre');
        }
        // Straight GPU segments approximate the exact conic between vertices.
        // Bound faceting independently rather than claiming a perfect curve.
        for (let j=1;j<points.length;j++) {
          const midpoint = points[j].clone().add(points[j-1]).multiplyScalar(.5);
          const angle = Math.atan2(midpoint.dot(y)/b,(midpoint.dot(x)+a*e.eccentricity)/a);
          const conic = x.clone().multiplyScalar(a*(Math.cos(angle)-e.eccentricity)).addScaledVector(y,b*Math.sin(angle));
          assert.ok(midpoint.distanceTo(conic)/a < .001, 'full-orbit chord approximation exceeds 0.1% of a');
        }
      }
    } finally { disposeSystemScene(scene.group); }
  });
}

test('V886 10: narrow camera reproduces the captured in-game orbit outline', () => {
  const image = JSON.parse(readFileSync(new URL('../../docs/research/fixtures/v886-camera-image-points.json', import.meta.url)));
  const audit = JSON.parse(readFileSync(new URL('../../docs/research/v886-camera-projection-results.json', import.meta.url)));
  // Freeze the inner-body scale/centre; do not refit the camera or orbit here.
  const { scaleX, scaleY, centre } = audit.camera;
  const scene = buildSystemScene(nodes, Date.parse(image.timestamp), fixture.systemName, 'exploration', {}, { scaleMode: 'realistic' });
  try {
    const line = scene.updatables.get(64).orbit;
    const inverseDistance = scaleY * 2 * Math.tan(ORRERY_FOV_DEG * Math.PI / 360) / image.previewHeight;
    const points = Array.from({ length: line.geometry.drawRange.count }, (_, index) => {
      const p = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position,index).add(line.position).multiplyScalar(1e9/149597870700);
      const depth = 1-inverseDistance*p.z;
      assert.ok(depth > 0, 'orbit remains in front of the camera');
      return new THREE.Vector2(centre[0]+scaleX*p.x/depth,centre[1]-scaleY*p.y/depth);
    });
    const errors = image.outlinePoints.map(([x,y]) => {
      const observed = new THREE.Vector2(x,y);
      return Math.min(...points.slice(1).map((b,i) => {
        const a=points[i], d=b.clone().sub(a);
        const t=d.lengthSq() ? Math.max(0,Math.min(1,observed.clone().sub(a).dot(d)/d.lengthSq())) : 0;
        return observed.distanceTo(a.clone().addScaledVector(d,t));
      }));
    });
    const rms = Math.sqrt(errors.reduce((sum,e) => sum+e*e,0)/errors.length);
    assert.ok(rms < 2.5, `observed outline RMS ${rms} preview pixels`);
    assert.ok(Math.max(...errors) < 6, 'allow for obscured markers and manual extraction uncertainty');
  } finally { disposeSystemScene(scene.group); }
});
