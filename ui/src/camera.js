import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_DIRECTION = new THREE.Vector3(0.57, -0.71, 0.41).normalize();

// Fit a bounding sphere against the narrower visible field of view, including
// space reserved for HUD panels. This also works in portrait windows.
export function fitDistance(camera, radius, { widthFraction = 1, heightFraction = 1 } = {}) {
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const halfAngle = Math.atan(Math.min(vertical * heightFraction, vertical * camera.aspect * widthFraction));
  return Math.max(2, radius * 1.1 / Math.sin(halfAngle));
}

export function createOrbitCamera(canvas, camera, { initialRadius = 70, onDirty, onPan } = {}) {
  // Journal orbital coordinates use XY as the reference plane and Z as up.
  camera.up.set(0, 0, 1);
  camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(initialRadius);
  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 0.5;
  controls.maxDistance = 1e12;
  controls.screenSpacePanning = true;
  // Immediate updates keep render-on-demand idle when the user stops moving.
  controls.enableDamping = false;
  controls.listenToKeyEvents(canvas);
  let programmatic = false;
  let sceneRadius = 1;
  const lastTarget = controls.target.clone();

  function updateClipping() {
    const distance = camera.position.distanceTo(controls.target);
    camera.near = Math.max(0.01, distance / 1e6);
    camera.far = Math.max(60000, distance + sceneRadius * 3);
    camera.updateProjectionMatrix();
  }
  controls.addEventListener('change', () => {
    if (!programmatic && controls.target.distanceToSquared(lastTarget) > 1e-12) onPan?.();
    lastTarget.copy(controls.target);
    updateClipping();
    onDirty?.();
  });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

  function focus(target, distance, resetDirection = false) {
    const offset = resetDirection ? DEFAULT_DIRECTION.clone() : camera.position.clone().sub(controls.target);
    if (distance !== undefined) offset.setLength(distance);
    camera.position.copy(target).add(offset);
    controls.target.copy(target);
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
      sceneRadius = Math.max(sphere.radius, 1);
      focus(sphere.center, fitDistance(camera, sceneRadius, visibleArea), resetDirection);
    },
  };
}
