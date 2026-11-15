import * as THREE from 'three';

/** Unrestricted screen-relative rotation; pan/zoom stay with OrbitControls. */
export function bindFreeRotation(canvas, camera, getControls) {
  const pointers = new Map();
  const axis = new THREE.Vector3(), offset = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  function down(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY,
      rotate: event.pointerType === 'touch' || (event.button === 0
        && !event.shiftKey && !event.ctrlKey && !event.metaKey) });
  }
  function move(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const controls = getControls();
    // Two-finger gestures belong entirely to the existing pinch/pan handler.
    if (!controls.enabled || !pointer.rotate || pointers.size !== 1 || (!dx && !dy)) return;
    const angle = Math.hypot(dx,dy) * 2*Math.PI / Math.max(1,canvas.clientHeight);
    axis.set(-dy,-dx,0).normalize().applyQuaternion(camera.quaternion);
    rotation.setFromAxisAngle(axis,angle);
    offset.copy(camera.position).sub(controls.target).applyQuaternion(rotation);
    camera.position.copy(controls.target).add(offset);
    camera.up.applyQuaternion(rotation).normalize();
    // No polar-angle deltas enter OrbitControls. Its update only reconciles
    // the new pose and dispatches the normal dirty/follow notifications.
    controls.update();
  }
  function up(event) { pointers.delete(event.pointerId); }
  canvas.addEventListener('pointerdown',down);
  canvas.addEventListener('pointermove',move);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,up);
  return () => {
    canvas.removeEventListener('pointerdown',down);
    canvas.removeEventListener('pointermove',move);
    for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.removeEventListener(type,up);
    pointers.clear();
  };
}
