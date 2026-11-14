import * as THREE from 'three';

/** Decorative sky at infinity: camera rotation matters, translation does not. */
export function createStarfield() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2);
  const positions = new Float32Array(1200 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const radius = Math.sqrt(1 - z * z);
    positions[i] = radius * Math.cos(theta);
    positions[i + 1] = radius * Math.sin(theta);
    positions[i + 2] = z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x554433, size: 2.5, sizeAttenuation: false,
    depthTest: false, depthWrite: false,
  })));

  return {
    render(renderer, viewCamera) {
      viewCamera.getWorldQuaternion(camera.quaternion);
      camera.fov = viewCamera.fov;
      camera.aspect = viewCamera.aspect;
      camera.zoom = viewCamera.zoom;
      camera.updateProjectionMatrix();
      // Independent clipping keeps the sky visible at both planet-close and
      // extreme system-wide zoom, even when the main camera's near plane > 1.
      renderer.render(scene, camera);
    },
  };
}
