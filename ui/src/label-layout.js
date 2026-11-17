const REVEAL_DISTANCE = 32;
const KEEP_DISTANCE = 24;

function overlapFraction(a, b) {
  const width = Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left));
  const height = Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  return width*height / Math.min((a.right-a.left)*(a.bottom-a.top), (b.right-b.left)*(b.bottom-b.top));
}

/** Choose readable labels in CSS-pixel space; body geometry is unaffected. */
export function visibleBodyLabels(candidates, updatables, selectedId, labelScale = 1) {
  const byId = new Map(candidates.map(c => [c.id,c]));
  const lineage = id => {
    let parentId = updatables.get(id)?.parentId, nearest = null, depth = 0;
    const visited = new Set([id]);
    while (parentId != null && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = updatables.get(parentId);
      if (!parent) break;
      if (parent.label) { nearest ??= parentId; depth++; }
      parentId = parent.parentId;
    }
    return { nearest,depth };
  };
  const ordered = candidates.map(c => ({ ...c, ...lineage(c.id),
    pinned: c.id === selectedId || updatables.get(c.id)?.kind === 'Star' }));
  ordered.sort((a,b) => Number(b.id===selectedId)-Number(a.id===selectedId)
    || Number(b.pinned)-Number(a.pinned) || a.depth-b.depth
    || Number(b.wasVisible)-Number(a.wasVisible) || a.id-b.id);
  const visible = new Set(), occupied = [];
  for (const candidate of ordered) {
    const parent = byId.get(candidate.nearest);
    if (!candidate.pinned) {
      // At group scale, show the parent before revealing its children. If
      // the parent is off-screen, local children can still be inspected.
      if (parent && (!visible.has(parent.id) || Math.hypot(candidate.bodyX-parent.bodyX,
        candidate.bodyY-parent.bodyY) < (candidate.wasVisible ? KEEP_DISTANCE : REVEAL_DISTANCE)*labelScale)) continue;
      const allowance = candidate.wasVisible ? 0.35 : 0.20;
      if (occupied.some(other => overlapFraction(candidate.rect,other.rect) > allowance)) continue;
    }
    visible.add(candidate.id);
    occupied.push(candidate);
  }
  return visible;
}

/** A plus marks nearby hidden labels, never off-screen or behind-camera bodies. */
export function collapsedLabelHosts(candidates, visible, labelScale = 1) {
  const hosts = candidates.filter(c => visible.has(c.id));
  const collapsed = new Set();
  for (const hidden of candidates) {
    if (visible.has(hidden.id)) continue;
    let host = null, distance = 48*labelScale;
    for (const candidate of hosts) {
      const gap = Math.hypot(candidate.bodyX-hidden.bodyX,candidate.bodyY-hidden.bodyY);
      if (gap < distance) { host=candidate; distance=gap; }
    }
    if (host) collapsed.add(host.id);
  }
  return collapsed;
}
