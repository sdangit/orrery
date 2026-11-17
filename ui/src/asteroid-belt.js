import * as THREE from 'three';
import { compressDistance, parentOrbitFrame, transformVector, validBeltRadii } from '@orrery/shared';
import { METRES_PER_UNIT } from './scale-modes.js';

/** A schematic annulus: radial divisions are decoration, not cluster positions. */
export function buildAsteroidBelt(nodes, node, trueDistances) {
  if (!validBeltRadii(node.raw)) return null;
  const scale = metres => trueDistances ? metres / METRES_PER_UNIT : compressDistance(metres);
  const inner = scale(node.raw.InnerRad), outer = scale(node.raw.OuterRad);
  // No independent belt inclination is supplied. Use the same inherited plane
  // as the host's orbiting children, pending further in-game validation.
  const frame = parentOrbitFrame(nodes, node.id);
  const vertices = [];
  const point = (r, angle) => {
    const p = transformVector(frame, { x: r * Math.cos(angle), y: r * Math.sin(angle), z: 0 });
    vertices.push(p.x, p.y, p.z);
  };
  const segments = 2048;
  for (const r of [inner, outer]) {
    for (let i = 0; i < segments; i++) {
      point(r, i * Math.PI * 2 / segments);
      point(r, (i + 1) * Math.PI * 2 / segments);
    }
  }
  for (let i = 0; i < 48; i++) {
    point(inner, i * Math.PI * 2 / 48);
    point(outer, i * Math.PI * 2 / 48);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const band = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0xb17b4a, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  band.userData.beltId = node.id;
  band.userData.outerRadius = outer;
  return band;
}
