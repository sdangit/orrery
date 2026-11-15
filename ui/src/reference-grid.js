import * as THREE from 'three';
import { METRES_PER_UNIT } from './scale-modes.js';

/** Decade subdivisions anchored to system XY, with continuous level blending. */
export function gridLayout(camera, target, viewportHeight, { followView = true } = {}) {
  const z = followView ? target.z : 0;
  const distance = Math.max(1e-12, Math.hypot(camera.position.x - target.x,
    camera.position.y - target.y, camera.position.z - z));
  const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const desiredStep = height * 80 / Math.max(1, viewportHeight);
  const level = Math.log10(Math.max(1e-15, desiredStep));
  const step = 10 ** Math.floor(level);
  const snap = step * 100;
  return { step, blend: level - Math.floor(level),
    x: Math.round(target.x / snap) * snap, y: Math.round(target.y / snap) * snap, z };
}

export function gridStepLabel(step, trueDistances) {
  if (!trueDistances) return `${Number(step.toPrecision(3))} display units`;
  const metres = step * METRES_PER_UNIT;
  if (metres >= 149597870700) return `${Number((metres / 149597870700).toPrecision(3))} AU`;
  if (metres >= 299792458) return `${Number((metres / 299792458).toPrecision(3))} ls`;
  if (metres >= 1000) return `${Number((metres / 1000).toPrecision(3))} km`;
  return `${Number(metres.toPrecision(3))} m`;
}

export function createReferenceGrid() {
  // Draw a screen quad and intersect each viewing ray with the reference plane.
  // No world-space corner can cross the eye/far plane and clip away a wedge.
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      stepSize: { value: 1 }, blend: { value: 0 },
      rayForward: { value: new THREE.Vector3() },
      rayRight: { value: new THREE.Vector3() },
      rayUp: { value: new THREE.Vector3() },
      cameraGridXY: { value: new THREE.Vector2() },
      planeHeight: { value: 0 },
      clipRange: { value: new THREE.Vector2() },
      fadeDistance: { value: 1 },
      projectionDepth: { value: new THREE.Vector2() },
      color: { value: new THREE.Color('#497f9c') },
      undersideColor: { value: new THREE.Color('#9c6649') },
    },
    vertexShader: `
      varying vec2 screen;
      void main() {
        screen = position.xy;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      #ifdef USE_LOGDEPTHBUF
        uniform float logDepthBufFC;
      #endif
      uniform vec3 color;
      uniform vec3 undersideColor;
      uniform float stepSize;
      uniform float blend;
      uniform vec3 rayForward;
      uniform vec3 rayRight;
      uniform vec3 rayUp;
      uniform vec2 cameraGridXY;
      uniform float planeHeight;
      uniform vec2 clipRange;
      uniform float fadeDistance;
      uniform vec2 projectionDepth;
      varying vec2 screen;
      float lines(vec2 coordinate) {
        vec2 footprint = max(fwidth(coordinate), vec2(0.00001));
        vec2 d = abs(fract(coordinate + 0.5) - 0.5) / footprint;
        vec2 line = vec2(1.0) - smoothstep(vec2(0.35), vec2(1.0), d);
        // Filter each axis independently: a foreshortened axis must not erase
        // the other set of lines at shallow viewing angles.
        line *= vec2(1.0) - smoothstep(vec2(0.25), vec2(1.0), footprint);
        return max(line.x, line.y);
      }
      void main() {
        vec3 ray = rayForward + screen.x * rayRight + screen.y * rayUp;
        if (abs(ray.z) < 0.0000001) discard;
        // Units of the fine grid step, relative to the camera, retain precision
        // around small moons far from the system origin.
        float t = planeHeight / ray.z;
        if (t <= clipRange.x || t >= clipRange.y) discard;
        vec2 grid = cameraGridXY + ray.xy * t;
        float fine = lines(grid) * (1.0 - blend);
        float middle = lines(grid / 10.0);
        float coarse = lines(grid / 100.0) * blend;
        // Fade before the far clip and toward the horizon. This distance is
        // continuous with zoom, independent of decade/anchor transitions.
        float fade = 1.0 - smoothstep(0.65 * fadeDistance, fadeDistance, t);
        float opacity = max(fine, max(middle, coarse)) * fade * 0.32;
        if (opacity < 0.002) discard;
        float viewDepth = t * stepSize;
        #ifdef USE_LOGDEPTHBUF
          gl_FragDepth = log2(1.0 + viewDepth) * logDepthBufFC * 0.5;
        #else
          gl_FragDepth = projectionDepth.x - projectionDepth.y / viewDepth;
        #endif
        gl_FragColor = vec4(planeHeight < 0.0 ? color : undersideColor, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = 'System reference plane grid';
  mesh.frustumCulled = false; // Vertices are in clip space, not world space.
  mesh.renderOrder = -10;
  mesh.visible = false;
  return { mesh,
    update(camera, target, viewportHeight, options) {
      const layout = gridLayout(camera, target, viewportHeight, options);
      camera.updateMatrixWorld();
      const u = material.uniforms;
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
      u.rayForward.value.setFromMatrixColumn(camera.matrixWorld, 2).negate();
      u.rayRight.value.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(tangent * camera.aspect);
      u.rayUp.value.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(tangent);
      // Only the phase within a coarse cell reaches the GPU. Avoid subtracting
      // large Float32 world positions when the user zooms into a distant body.
      const period = layout.step * 100;
      const phase = v => ((v % period) + period) % period / layout.step;
      u.cameraGridXY.value.set(phase(camera.position.x), phase(camera.position.y));
      u.planeHeight.value = (layout.z - camera.position.z) / layout.step;
      u.stepSize.value = layout.step;
      u.blend.value = layout.blend;
      u.clipRange.value.set(camera.near / layout.step, camera.far / layout.step);
      const distance = Math.max(1e-12, camera.position.distanceTo(target));
      const fade = Math.min(camera.far * 0.9,
        distance * Math.max(4, 24 * tangent * camera.aspect));
      u.fadeDistance.value = fade / layout.step;
      u.projectionDepth.value.set(camera.far / (camera.far-camera.near),
        camera.far * camera.near / (camera.far-camera.near));
      // Retain the reported plane origin for inspection; the shader does not
      // transform its screen quad through this world-space matrix.
      mesh.position.set(layout.x, layout.y, layout.z);
      return layout;
    },
    dispose() { mesh.geometry.dispose(); material.dispose(); },
  };
}

export function bindGridToggle({ onChange, root = document, storage = localStorage }) {
  const toggle = root.getElementById('referenceGridToggle');
  const origin = root.getElementById('referenceGridOrigin');
  toggle.checked = storage.getItem('orrery.referenceGrid') === 'true';
  origin.value = storage.getItem('orrery.gridOrigin') === 'system' ? 'system' : 'view';
  const apply = () => onChange(toggle.checked, origin.value === 'view');
  toggle.addEventListener('change', () => {
    storage.setItem('orrery.referenceGrid', String(toggle.checked));
    apply();
  });
  origin.addEventListener('change', () => {
    storage.setItem('orrery.gridOrigin', origin.value);
    apply();
  });
  apply();
}
