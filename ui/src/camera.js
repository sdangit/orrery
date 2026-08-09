import * as THREE from 'three';

// Manual spherical-orbit camera, ported from ed-space-tutor.html — no
// OrbitControls dependency, per the handover doc. Calls onDirty() whenever
// user input changes the view, so the caller can drive a render-on-demand
// loop instead of a continuous requestAnimationFrame tick (GPU-polite: this
// project shares a card with the game).
export function createOrbitCamera(canvas, camera, { initialRadius = 60, onDirty } = {}) {
  const initial = { theta: 0.9, phi: 1.15, r: initialRadius };
  const state = {
    theta: initial.theta,
    phi: initial.phi,
    r: initial.r,
    target: new THREE.Vector3(0, 0, 0),
  };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function apply() {
    state.phi = Math.max(0.08, Math.min(Math.PI - 0.08, state.phi));
    camera.position.set(
      state.target.x + state.r * Math.sin(state.phi) * Math.cos(state.theta),
      state.target.y + state.r * Math.cos(state.phi),
      state.target.z + state.r * Math.sin(state.phi) * Math.sin(state.theta),
    );
    camera.lookAt(state.target);
  }

  function markDirty() {
    onDirty?.();
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    state.theta += (e.clientX - lastX) * 0.006;
    state.phi += (e.clientY - lastY) * 0.006;
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
    markDirty();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.r *= 1 + Math.sign(e.deltaY) * 0.09;
    state.r = Math.max(1, Math.min(6000, state.r));
    apply();
    markDirty();
  }, { passive: false });

  apply();

  return {
    state,
    apply,
    isDragging: () => dragging,
    focus(target, radius) {
      state.target.copy(target);
      if (radius !== undefined) state.r = radius;
      apply();
      markDirty();
    },
    /** Restores the default view: initial angles/zoom, target back at the system origin. */
    reset() {
      state.theta = initial.theta;
      state.phi = initial.phi;
      state.r = initial.r;
      state.target.set(0, 0, 0);
      apply();
      markDirty();
    },
  };
}
