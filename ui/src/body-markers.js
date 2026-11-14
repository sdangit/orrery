import * as THREE from 'three';

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
export function updateBodyAnnotations(updatables, camera, viewportHeight) {
  if (!(viewportHeight > 0)) return;
  camera.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const fovFactor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  for (const entry of updatables.values()) {
    if (!entry.marker) continue;
    const view = entry.bodyGroup.position.clone().applyMatrix4(camera.matrixWorldInverse);
    const depth = -view.z;
    const inFront = depth > camera.near && depth < camera.far;
    entry.label.visible = inFront;
    entry.marker.visible = false;
    if (!inFront) continue;
    const unitsPerPixel = depth * fovFactor / viewportHeight;
    entry.marker.visible = entry.radius / unitsPerPixel < 3;
    entry.marker.scale.setScalar(4 * unitsPerPixel);
    entry.marker.quaternion.copy(camera.quaternion);
    const labelHeight = 18 * unitsPerPixel;
    entry.label.scale.set(labelHeight * entry.label.userData.aspect, labelHeight, 1);
    entry.label.position.copy(up).multiplyScalar(entry.radius + 16 * unitsPerPixel);
  }
}
