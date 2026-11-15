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
    extent: Math.max(height * Math.max(1, camera.aspect) * 3, snap * 2),
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
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { stepSize: { value: 1 }, extent: { value: 100 }, blend: { value: 0 },
      color: { value: new THREE.Color('#83715d') } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float stepSize;
      uniform float extent;
      varying vec2 grid;
      varying vec2 planeUV;
      void main() {
        planeUV = position.xy;
        vec3 p = vec3(position.xy * extent, 0.0);
        grid = p.xy / stepSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color;
      uniform float blend;
      varying vec2 grid;
      varying vec2 planeUV;
      float lines(vec2 coordinate) {
        vec2 footprint = max(fwidth(coordinate), vec2(0.00001));
        vec2 d = abs(fract(coordinate + 0.5) - 0.5) / footprint;
        float line = 1.0 - smoothstep(0.35, 1.0, min(d.x, d.y));
        // Suppress unresolved detail at grazing angles rather than shimmer.
        return line * (1.0 - smoothstep(0.25, 1.0, max(footprint.x, footprint.y)));
      }
      void main() {
        float fine = lines(grid) * (1.0 - blend);
        float middle = lines(grid / 10.0);
        float coarse = lines(grid / 100.0) * blend;
        float fade = 1.0 - smoothstep(0.65, 1.0, max(abs(planeUV.x), abs(planeUV.y)));
        float opacity = max(fine, max(middle, coarse)) * fade * 0.32;
        if (opacity < 0.002) discard;
        gl_FragColor = vec4(color, opacity);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = 'System reference plane grid';
  mesh.frustumCulled = false; // Shader controls its extent, not the unit quad.
  mesh.renderOrder = -10;
  mesh.visible = false;
  return { mesh,
    update(camera, target, viewportHeight, options) {
      const layout = gridLayout(camera, target, viewportHeight, options);
      mesh.position.set(layout.x, layout.y, layout.z);
      material.uniforms.stepSize.value = layout.step;
      material.uniforms.extent.value = layout.extent;
      material.uniforms.blend.value = layout.blend;
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
