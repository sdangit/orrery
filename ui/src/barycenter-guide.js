import * as THREE from 'three';

const COLOR = '#9ab6c4';

/** Screen-sized reference aids for known barycenters, never physical bodies. */
export function createBarycenterGuide() {
  const group = new THREE.Group();
  group.name = 'Barycenter guides';
  const entries = new Map();
  function remove(id) {
    const entry = entries.get(id);
    group.remove(entry.anchor);
    entry.marker.geometry.dispose();
    entry.marker.material.dispose();
    entries.delete(id);
  }
  function create(id) {
    const anchor = new THREE.Group();
    anchor.visible = false;
    anchor.userData.orbitalGroupId = id;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1,-1,0), new THREE.Vector3(1,1,0),
      new THREE.Vector3(-1,1,0), new THREE.Vector3(1,-1,0),
    ]);
    const marker = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color:COLOR, transparent:true, opacity:.85, depthTest:false, depthWrite:false,
    }));
    marker.name = 'Barycenter marker';
    marker.renderOrder = 30;
    anchor.add(marker);
    group.add(anchor);
    const entry = { anchor,marker };
    entries.set(id,entry);
    return entry;
  }
  return {
    group,
    update({ nodes, selectedId, focusedId, getPosition, camera, viewportHeight, labelScale = 1, visible = true }) {
      const wanted = new Set([...nodes].filter(([,node]) => node.kind === 'Barycentre').map(([id])=>id));
      for (const id of entries.keys()) if (!wanted.has(id)) remove(id);
      group.visible = visible;
      if (!visible) return;
      camera.updateMatrixWorld(true);
      const factor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
      const children = new Map(), positions = new Map();
      for (const [id,node] of nodes) {
        if (!wanted.has(node.parentId) || !['Star','Planet','Barycentre'].includes(node.kind)) continue;
        if (!children.has(node.parentId)) children.set(node.parentId,[]);
        children.get(node.parentId).push(id);
      }
      const project = id => {
        if (positions.has(id)) return positions.get(id);
        const position = getPosition(id);
        let value = null;
        if (position && viewportHeight > 0 && [position.x,position.y,position.z].every(Number.isFinite)) {
          const depth = -position.clone().applyMatrix4(camera.matrixWorldInverse).z;
          if (depth > camera.near && depth < camera.far) value = {position,depth,screen:position.clone().project(camera)};
        }
        positions.set(id,value);
        return value;
      };
      const spreadOut = (id, threshold) => {
        const points = (children.get(id) ?? []).map(project).filter(Boolean);
        for (let i=0;i<points.length;i++) for (let j=0;j<i;j++) {
          const a=points[i].screen,b=points[j].screen;
          const gap = Math.hypot((a.x-b.x)*camera.aspect,a.y-b.y)*viewportHeight/2;
          if (gap >= threshold) return true;
        }
        return false;
      };
      for (const id of wanted) {
        const entry = entries.get(id) ?? create(id);
        const wasVisible = entry.anchor.visible;
        entry.anchor.visible = false;
        const selected = id === selectedId, focused = id === focusedId;
        entry.marker.material.opacity = selected ? .95 : focused ? .65 : .3;
        entry.marker.renderOrder = selected ? 30 : focused ? 25 : 5;
        const projected = project(id);
        if (!projected) continue;
        const {position,depth,screen} = projected;
        entry.anchor.position.copy(position);
        if (Math.abs(screen.x)>1 || Math.abs(screen.y)>1) continue;
        // Hysteresis avoids flicker near the reveal threshold while zooming.
        if (!selected && !focused && !spreadOut(id,(wasVisible ? 18 : 24)*labelScale)) continue;
        entry.anchor.visible = true;
        const unit = depth * factor / viewportHeight * labelScale;
        entry.marker.scale.setScalar(4*unit);
        entry.marker.quaternion.copy(camera.quaternion);
      }
    },
    dispose() {
      for (const id of entries.keys()) remove(id);
      group.removeFromParent();
    },
  };
}

export function bindBarycenterToggle({ onChange, root = document, storage = localStorage }) {
  const toggle = root.getElementById('barycenterToggle');
  toggle.checked = storage.getItem('orrery.barycenters') !== 'false';
  toggle.addEventListener('change',() => {
    storage.setItem('orrery.barycenters',String(toggle.checked));
    onChange(toggle.checked);
  });
  onChange(toggle.checked);
}
