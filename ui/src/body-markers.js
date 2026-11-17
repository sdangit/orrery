import * as THREE from 'three';
import { visibleBodyLabels, collapsedLabelHosts } from './label-layout.js';

// An open diamond marks a location, never a physical body silhouette.
export function makeBodyMarker(color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0),
  ]);
  const marker = new THREE.LineLoop(geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  marker.visible = false;
  return marker;
}

// Called only when a frame is already needed; sizes are in CSS pixels, not
// drawing-buffer pixels, so zoom and Retina scaling do not change readability.
export function updateBodyAnnotations(updatables, camera, viewportHeight, { selectedId = null, labelScale = 1 } = {}) {
  if (!(viewportHeight > 0)) return;
  camera.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const fovFactor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const viewportWidth = viewportHeight * camera.aspect;
  const candidates = [];
  for (const [id,entry] of updatables) {
    if (!entry.label) continue; // Orbital groups have paths but no annotations.
    const view = entry.bodyGroup.position.clone().applyMatrix4(camera.matrixWorldInverse);
    const depth = -view.z;
    const inFront = depth > camera.near && depth < camera.far;
    entry.label.visible = false;
    if (entry.labelHint) entry.labelHint.visible = false;
    if (entry.marker) entry.marker.visible = false;
    if (!inFront) continue;
    const unitsPerPixel = depth * fovFactor / viewportHeight;
    if (entry.marker) {
      entry.marker.visible = entry.radius / unitsPerPixel < 3;
      entry.marker.scale.setScalar(4 * unitsPerPixel);
      entry.marker.quaternion.copy(camera.quaternion);
    }
    // Readability is independent of body scaling; only physical-size bodies
    // need a location marker, but all modes need screen-sized labels.
    const labelHeight = 18 * labelScale * unitsPerPixel;
    entry.label.scale.set(labelHeight * entry.label.userData.aspect, labelHeight, 1);
    entry.label.position.copy(up).multiplyScalar(entry.radius + 16 * labelScale * unitsPerPixel);
    if (entry.labelHint) {
      const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
      entry.labelHint.scale.set(20*labelScale*unitsPerPixel*entry.labelHint.userData.aspect,20*labelScale*unitsPerPixel,1);
      entry.labelHint.position.copy(entry.label.position).addScaledVector(right,
        (9*entry.label.userData.aspect+9)*labelScale*unitsPerPixel);
    }
    const centre = entry.bodyGroup.position.clone().add(entry.label.position).project(camera);
    const body = entry.bodyGroup.position.clone().project(camera);
    const x = (centre.x+1)*viewportWidth/2, y = (1-centre.y)*viewportHeight/2;
    const width = 18*labelScale*entry.label.userData.aspect;
    // Reserve a little room for the cluster hint, avoiding relayout when it appears.
    const rect = { left:x-width/2, right:x+width/2+16*labelScale, top:y-9*labelScale, bottom:y+9*labelScale };
    if (rect.right<0 || rect.left>viewportWidth || rect.bottom<0 || rect.top>viewportHeight) continue;
    candidates.push({ id,rect,bodyX:(body.x+1)*viewportWidth/2,bodyY:(1-body.y)*viewportHeight/2,
      wasVisible:entry.label.userData.layoutVisible === true });
  }
  const visible = visibleBodyLabels(candidates,updatables,selectedId,labelScale);
  const collapsed = collapsedLabelHosts(candidates,visible,labelScale);
  for (const [id,entry] of updatables) {
    if (!entry.label) continue;
    entry.label.visible = visible.has(id);
    entry.label.userData.layoutVisible = entry.label.visible;
    entry.label.renderOrder = id===selectedId ? 20 : entry.kind==='Star' ? 10 : 0;
    if (entry.labelHint) {
      entry.labelHint.visible = entry.label.visible && collapsed.has(id);
      entry.labelHint.renderOrder = entry.label.renderOrder+1;
    }
  }
}
