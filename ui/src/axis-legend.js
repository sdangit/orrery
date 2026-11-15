import * as THREE from 'three';

const AXES = [
  { label: 'X', color: '#f17878', direction: new THREE.Vector3(1,0,0) },
  { label: 'Y', color: '#8bcf90', direction: new THREE.Vector3(0,1,0) },
  { label: 'Z', color: '#79b7ef', direction: new THREE.Vector3(0,0,1) },
];

/** Orthographic orientation only: pan, distance and FOV never move the legend. */
export function axisLegendDirections(camera) {
  const inverse = camera.getWorldQuaternion(new THREE.Quaternion()).invert();
  return AXES.flatMap(axis => [false,true].map(positive => {
    const direction = axis.direction.clone().multiplyScalar(positive ? 1 : -1).applyQuaternion(inverse);
    return { label: axis.label, color: axis.color, positive,
      x: direction.x, y: direction.y, depth: direction.z };
  })).sort((a,b) => a.depth-b.depth);
}

export function createAxisLegend(svg) {
  const elements = new Map();
  const make = tag => svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const axis of AXES) for (const positive of [false,true]) {
    const group=make('g'), line=make('line'), dot=make('circle'), label=make('text');
    group.setAttribute('stroke',axis.color);
    line.setAttribute('x1','48'); line.setAttribute('y1','48');
    line.setAttribute('stroke-width',positive ? '1.8' : '1');
    if (!positive) line.setAttribute('stroke-dasharray','2 3');
    dot.setAttribute('r',positive ? '4' : '2');
    dot.setAttribute('fill',positive ? axis.color : '#0b1119');
    label.textContent=positive ? axis.label : '';
    label.setAttribute('stroke','none'); label.setAttribute('fill',axis.color);
    label.setAttribute('text-anchor','middle'); label.setAttribute('dominant-baseline','central');
    group.append(line,dot,label);
    svg.append(group);
    elements.set(`${axis.label}${positive}`,{ group,line,dot,label });
  }
  return {
    update(camera) {
      for (const axis of axisLegendDirections(camera)) {
        const { group,line,dot,label }=elements.get(`${axis.label}${axis.positive}`);
        const x=48+axis.x*29,y=48-axis.y*29;
        line.setAttribute('x2',String(x)); line.setAttribute('y2',String(y));
        dot.setAttribute('cx',String(x)); dot.setAttribute('cy',String(y));
        label.setAttribute('x',String(48+axis.x*40));
        label.setAttribute('y',String(48-axis.y*40));
        group.setAttribute('opacity',axis.positive ? (axis.depth < -0.1 ? '0.65' : '1') : '0.35');
        svg.append(group); // Back-to-front ordering follows the camera.
      }
    },
  };
}
