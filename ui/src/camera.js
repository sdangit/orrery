import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { DEFAULT_DIRECTION } from './view-presets.js';

// V886 paired screenshots support a narrow map camera (~15° vertical), not
// the former 55° view, which exaggerated depth on steeply inclined orbits.
// See docs/research/v886-camera-projection-results.json for the measured fit.
export const ORRERY_FOV_DEG = 15;

// Fit a bounding sphere against the narrower visible field of view, including
// space reserved for HUD panels. This also works in portrait windows.
export function fitDistance(camera, radius, { widthFraction = 1, heightFraction = 1 } = {}) {
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const halfAngle = Math.atan(Math.min(vertical * heightFraction, vertical * camera.aspect * widthFraction));
  return Math.max(1e-9, radius * 1.1 / Math.sin(halfAngle));
}

export function createOrbitCamera(canvas, camera, { initialRadius = 70, onDirty, onPan, onOrientationChange } = {}) {
  // Journal orbital coordinates use XY as the reference plane and Z as up.
  camera.up.set(0, 0, 1);
  camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(initialRadius);
  let controls;
  let programmatic = false;
  let sceneRadius = 1;
  const lastTarget = new THREE.Vector3();
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
    if (!programmatic && camera.quaternion.angleTo(lastQuaternion) > 1e-7) onOrientationChange?.();
    lastTarget.copy(controls.target);
    lastPosition.copy(camera.position);
    lastQuaternion.copy(camera.quaternion);
    updateClipping();
    onDirty?.();
  }
  function installControls(target) {
    // OrbitControls caches its up-axis transform in the constructor. Recreate
    // through its public API when a preset changes up, avoiding private fields.
    controls?.dispose();
    const position = camera.position.clone();
    controls = new OrbitControls(camera, canvas);
    camera.position.copy(position);
    controls.minDistance = 1e-9;
    controls.maxDistance = 1e12;
    controls.screenSpacePanning = true;
    controls.enableDamping = false;
    controls.target.copy(target);
    controls.cursor.copy(target);
    controls.update();
    controls.listenToKeyEvents(canvas);
    controls.addEventListener('change', syncCamera);
    // Catch sub-epsilon movements around physically small bodies too.
    const updateControls = controls.update.bind(controls);
    controls.update = (...args) => {
      const changed = updateControls(...args);
      syncCamera();
      return changed;
    };
    lastTarget.copy(target);
    lastPosition.copy(camera.position);
    lastQuaternion.copy(camera.quaternion);
  }
  installControls(new THREE.Vector3());
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

  function focus(target, distance, resetDirection = false) {
    const offset = resetDirection ? DEFAULT_DIRECTION.clone() : camera.position.clone().sub(controls.target);
    if (distance !== undefined) offset.setLength(distance);
    camera.position.copy(target).add(offset);
    if (resetDirection) {
      camera.up.set(0, 0, 1);
      installControls(target);
    }
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
    get controls() { return controls; },
    focus,
    orient({ direction, up }) {
      const target = controls.target.clone();
      const distance = camera.position.distanceTo(target);
      camera.up.copy(up).normalize();
      camera.position.copy(target).addScaledVector(direction.clone().normalize(), distance);
      installControls(target);
      updateClipping();
      onDirty?.();
    },
    fit(bounds, visibleArea, resetDirection = false) {
      const sphere = bounds.isEmpty()
        ? new THREE.Sphere(new THREE.Vector3(), 10)
        : bounds.getBoundingSphere(new THREE.Sphere());
      sceneRadius = Math.max(sphere.radius, 1e-9);
      focus(sphere.center, fitDistance(camera, sceneRadius, visibleArea), resetDirection);
    },
  };
}
