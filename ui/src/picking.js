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
  return hit ? pickables.get(hit.object) : null;
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
