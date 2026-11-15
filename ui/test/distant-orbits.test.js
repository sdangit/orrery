import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeCommunityBodies, eliteKeplerianOffset, parentOrbitFrame, transformVector } from '@orrery/shared';
import { buildSystemScene, updateSystemScene, disposeSystemScene } from '../src/scene-builder.js';

const spansh = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/spansh-sol-distant.json', import.meta.url)));
const { nodes } = mergeCommunityBodies(new Map(), { spansh });
const now = Date.parse('2026-11-14T08:40:00Z');
for (const id of [45, 46]) test(`${nodes.get(id).name}: orbit stays attached at physical zoom through rotation and playback`, () => {
  const built = buildSystemScene(nodes, now, 'Sol', 'exploration', {}, { scaleMode: 'realistic' });
  const entry = built.updatables.get(id);
  assert.equal(built.group.children.filter(o => o.userData.orbitBodyId === id).length, 1);
  const period = nodes.get(id).elements.orbitalPeriodSec * 1000;
  for (const fraction of [0, 0.000001, 0.17, 0.99, -0.3]) {
    updateSystemScene(nodes, built.updatables, now + fraction * period, { scaleMode: 'realistic' });
    const points = entry.orbit.geometry.attributes.position;
    let closest;
    let error = Infinity;
    for (let i = 0; i < points.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(points, i);
      const distance = point.clone().add(entry.orbit.position).distanceTo(entry.bodyGroup.position);
      if (distance < error) { error = distance; closest = point; }
    }
    assert.ok(error < entry.radius / 100, `orbit misses the body by ${error / entry.radius} radii`);
    // Model-view matrices and attributes arrive at the GPU as 32-bit floats.
    // Test the body-local origin and the orbit's closest vertex under the same
    // rounding, at several camera angles. World-space CPU checks alone miss this.
    for (const direction of [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,1), new THREE.Vector3(-1,0.2,-0.8)]) {
      const camera = new THREE.PerspectiveCamera(55, 1.6, entry.radius / 100, 1e6);
      camera.position.copy(entry.bodyGroup.position).addScaledVector(direction.normalize(), entry.radius * 6);
      camera.lookAt(entry.bodyGroup.position);
      camera.updateMatrixWorld();
      built.group.updateMatrixWorld(true);
      const gpuPoint = (object, point) => {
        const mv = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        mv.elements = Array.from(new Float32Array(mv.elements));
        return point.clone().applyMatrix4(mv).applyMatrix4(camera.projectionMatrix);
      };
      const body = gpuPoint(entry.mesh, new THREE.Vector3());
      const orbit = gpuPoint(entry.orbit, closest);
      assert.ok(Math.hypot(body.x - orbit.x, body.y - orbit.y) * 1000 < 0.1, 'GPU rounding separates orbit and body');
    }
  }
  disposeSystemScene(built.group);
});

test('rebasing a distant orbit preserves its full trajectory around a moving parent', () => {
  const nested = new Map(nodes);
  nested.set(45, { ...nodes.get(45), parentId: 46 });
  const built = buildSystemScene(nested, now, 'Sol', 'exploration', {}, { scaleMode: 'realistic' });
  const entry = built.updatables.get(45);
  const elements = nested.get(45).elements;
  for (const time of [now, now + 1e13, now - 1e13]) {
    updateSystemScene(nested, built.updatables, time, { scaleMode: 'realistic' });
    const parent = built.updatables.get(46).bodyGroup.position;
    const vertices = entry.orbit.geometry.attributes.position;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const offset = transformVector(parentOrbitFrame(nested, 45),
        eliteKeplerianOffset(elements, elements.epochMs + fraction * elements.orbitalPeriodSec * 1000));
      const expected = new THREE.Vector3(offset.x, offset.y, offset.z).multiplyScalar(1e-9).add(parent);
      let nearest = Infinity;
      for (let i = 0; i < vertices.count; i++) nearest = Math.min(nearest,
        new THREE.Vector3().fromBufferAttribute(vertices, i).add(entry.orbit.position).distanceTo(expected));
      assert.ok(nearest < elements.semiMajorAxis / 1e9 * 1e-6, 'rebasing must not translate or deform the orbit');
    }
  }
  disposeSystemScene(built.group);
});

const vega = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/edsm-vega-tracy.json', import.meta.url)));
const vegaNodes = mergeCommunityBodies(new Map(), { edsm: { ...vega, receivedAt: now } }).nodes;
for (const scaleMode of ['realistic', 'distances']) test(`Tracy's Havan: ${scaleMode} orbit tangent stays smooth across sample boundaries`, () => {
  const built = buildSystemScene(vegaNodes, now, 'Vega', 'exploration', {}, { scaleMode });
  const entry = built.updatables.get(11);
  const elements = vegaNodes.get(11).elements;
  const period = elements.orbitalPeriodSec * 1000;
  // Straddle the coarse polygon's corners, including the wrap back to zero.
  for (const boundary of [0, 1 / 96, 25 / 96, 1]) {
    const directions = [];
    for (const fraction of [boundary - 1e-7, boundary + 1e-7]) {
      const time = elements.epochMs + fraction * period;
      updateSystemScene(vegaNodes, built.updatables, time, { scaleMode });
      const vertices = entry.orbit.geometry.attributes.position;
      const count = Math.min(vertices.count, entry.orbit.geometry.drawRange.count);
      let nearest = -1;
      let error = Infinity;
      for (let i = 0; i < count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(vertices, i).add(entry.orbit.position);
        const distance = p.distanceTo(entry.bodyGroup.position);
        if (distance < error) { nearest = i; error = distance; }
      }
      assert.ok(error < entry.radius * 1e-5, 'the body must stay on the line');
      const anchor = new THREE.Vector3().fromBufferAttribute(vertices, nearest);
      const next = new THREE.Vector3().fromBufferAttribute(vertices, nearest + 1);
      const tangent = next.sub(anchor).normalize();
      const before = eliteKeplerianOffset(elements, time - period * 1e-8);
      const after = eliteKeplerianOffset(elements, time + period * 1e-8);
      const expected = new THREE.Vector3(after.x - before.x, after.y - before.y, after.z - before.z).normalize();
      assert.ok(tangent.angleTo(expected) < 0.001,
        `near-body tangent error ${THREE.MathUtils.radToDeg(tangent.angleTo(expected))} degrees`);
      directions.push(tangent);
      assert.ok(count < 200, 'local refinement should not require thousands of vertices per orbit');
    }
    assert.ok(directions[0].angleTo(directions[1]) < 0.001, 'crossing a coarse sample must not snap the visible line');
  }
  disposeSystemScene(built.group);
});
