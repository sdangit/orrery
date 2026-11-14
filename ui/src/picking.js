import * as THREE from 'three';

// Pointer coordinates are CSS pixels, independent of the Retina drawing buffer.
export function pointerToNdc(clientX, clientY, rect) {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

export function pickBody(clientX, clientY, canvas, camera, scene, pickables) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  // Input can arrive before the next capped render; use current world matrices.
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointerToNdc(clientX, clientY, rect), camera);
  const hit = raycaster.intersectObjects([...pickables.keys()], false)[0];
  if (hit) return pickables.get(hit.object);
  // Give tiny/unknown-radius bodies a generous screen-space click target.
  // Physical geometry wins above; markers behind visible bodies cannot steal hits.
  let closest = null;
  for (const [mesh, id] of pickables) {
    const minimum = mesh.userData.minPickPixels;
    if (!minimum) continue;
    const world = mesh.getWorldPosition(new THREE.Vector3());
    const depth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const projected = world.project(camera);
    if (depth <= camera.near || depth >= camera.far || Math.abs(projected.z) > 1) continue;
    const x = rect.left + (projected.x + 1) * rect.width / 2;
    const y = rect.top + (1 - projected.y) * rect.height / 2;
    const distance = Math.hypot(clientX - x, clientY - y);
    if (distance > minimum) continue;
    if (!closest || distance < closest.distance - 0.01
        || (Math.abs(distance - closest.distance) <= 0.01 && depth < closest.depth)) {
      closest = { id, distance, depth };
    }
  }
  return closest?.id ?? null;
}

// Select on a primary click/tap only, never at the end of an orbit/pan/pinch.
export function bindBodySelection(canvas, onSelect) {
  let candidate = null;
  const activePointers = new Set();
  canvas.addEventListener('pointerdown', (event) => {
    activePointers.add(event.pointerId);
    candidate = activePointers.size === 1 && event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  }, true);
  canvas.addEventListener('pointermove', (event) => {
    if (candidate?.id === event.pointerId && Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 5) candidate = null;
  }, true);
  canvas.addEventListener('pointerup', (event) => {
    const click = candidate;
    candidate = null;
    activePointers.delete(event.pointerId);
    if (click?.id === event.pointerId && !event.shiftKey && !event.ctrlKey && !event.metaKey && Math.hypot(event.clientX - click.x, event.clientY - click.y) <= 5) {
      onSelect(event.clientX, event.clientY);
    }
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      candidate = null;
      activePointers.delete(event.pointerId);
    }, true);
  }
}
