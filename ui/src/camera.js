import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_DIRECTION = new THREE.Vector3(0.57, -0.71, 0.41).normalize();

// Fit a bounding sphere against the narrower visible field of view, including
// space reserved for HUD panels. This also works in portrait windows.
export function fitDistance(camera, radius, { widthFraction = 1, heightFraction = 1 } = {}) {
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const halfAngle = Math.atan(Math.min(vertical * heightFraction, vertical * camera.aspect * widthFraction));
  return Math.max(1e-9, radius * 1.1 / Math.sin(halfAngle));
}

export function createOrbitCamera(canvas, camera, { initialRadius = 70, onDirty, onPan } = {}) {
  // Journal orbital coordinates use XY as the reference plane and Z as up.
  camera.up.set(0, 0, 1);
  camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(initialRadius);
  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 1e-9;
  controls.maxDistance = 1e12;
  controls.screenSpacePanning = true;
  // Immediate updates keep render-on-demand idle when the user stops moving.
  controls.enableDamping = false;
  controls.listenToKeyEvents(canvas);
  let programmatic = false;
  let sceneRadius = 1;
  const lastTarget = controls.target.clone();
  const lastPosition = camera.position.clone();
  const lastQuaternion = camera.quaternion.clone();

  function updateClipping() {
    const distance = camera.position.distanceTo(controls.target);
    camera.near = Math.max(1e-12, distance / 1e6);
    camera.far = Math.max(60000, distance + sceneRadius * 3);
    camera.updateProjectionMatrix();
  }
  function syncCamera() {
    if (controls.target.equals(lastTarget) && camera.position.equals(lastPosition)
        && camera.quaternion.equals(lastQuaternion)) return;
    if (!programmatic && !controls.target.equals(lastTarget)) onPan?.();
    lastTarget.copy(controls.target);
    lastPosition.copy(camera.position);
    lastQuaternion.copy(camera.quaternion);
    updateClipping();
    onDirty?.();
  }
  controls.addEventListener('change', syncCamera);
  // OrbitControls suppresses change events below a fixed world-space epsilon.
  // A visible pan around a 10 km body can be much smaller than that threshold.
  const updateControls = controls.update.bind(controls);
  controls.update = (...args) => {
    const changed = updateControls(...args);
    syncCamera();
    return changed;
  };
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

  function focus(target, distance, resetDirection = false) {
    const offset = resetDirection ? DEFAULT_DIRECTION.clone() : camera.position.clone().sub(controls.target);
    if (distance !== undefined) offset.setLength(distance);
    camera.position.copy(target).add(offset);
    controls.target.copy(target);
    // OrbitControls normalizes target relative to cursor on every update,
    // even with unlimited target radius. Keep that reference at the followed
    // body so rotation/zoom cannot round a nonzero target and look like a pan.
    controls.cursor.copy(target);
    programmatic = true;
    controls.update();
    programmatic = false;
    lastTarget.copy(controls.target);
    updateClipping();
    onDirty?.();
  }

  return {
    controls,
    focus,
    fit(bounds, visibleArea, resetDirection = false) {
      const sphere = bounds.isEmpty()
        ? new THREE.Sphere(new THREE.Vector3(), 10)
        : bounds.getBoundingSphere(new THREE.Sphere());
      sceneRadius = Math.max(sphere.radius, 1e-9);
      focus(sphere.center, fitDistance(camera, sceneRadius, visibleArea), resetDirection);
    },
  };
}
