import { shortDesignator } from './naming.js';

export const SYSTEM = 'system';
export const isBody = (node) => ['Star', 'Planet'].includes(node?.kind);

export function navigationLabel(node, systemName) {
  if (node.id === SYSTEM || node.kind === 'SystemBarycentre') return 'System';
  if (node.kind === 'AsteroidBelt') return node.name ? shortDesignator(node.name, systemName) : 'Asteroid belt';
  if (!isBody(node)) return `Orbital group ${node.id}`;
  return node.name ? shortDesignator(node.name, systemName) : `Body ${node.id}`;
}

/** A navigable forest even when source data has missing parents or cycles. */
export function createBodyNavigation(nodes) {
  const entries = new Map([...nodes].filter(([, n]) =>
    ['Star', 'Planet', 'Barycentre', 'AsteroidBelt'].includes(n.kind)));
  const parents = new Map();
  for (const [id, node] of entries) {
    parents.set(id, entries.has(node.parentId) ? node.parentId : SYSTEM);
  }
  // Break one edge of each cycle; all entries remain reachable from System.
  for (const id of entries.keys()) {
    const seen = new Set();
    let current = id;
    while (current !== SYSTEM) {
      if (seen.has(current)) { parents.set(current, SYSTEM); break; }
      seen.add(current);
      current = parents.get(current);
    }
  }
  const children = new Map([[SYSTEM, []]]);
  for (const id of entries.keys()) children.set(id, []);
  for (const [id, parent] of parents) children.get(parent).push(id);
  const size = (id) => entries.get(id).elements?.semiMajorAxis ?? entries.get(id).raw?.InnerRad ?? Infinity;
  for (const ids of children.values()) ids.sort((a, b) => size(a) - size(b)
    || String(a).localeCompare(String(b), undefined, { numeric: true }));
  return {
    children: (id) => children.get(id) ?? [],
    parent: (id) => parents.get(id) ?? SYSTEM,
    path(id) {
      const path = [];
      for (let current = entries.has(id) ? id : SYSTEM; current !== SYSTEM; current = parents.get(current)) path.unshift(current);
      return [SYSTEM, ...path];
    },
    siblings(id) { return id === SYSTEM ? [] : children.get(parents.get(id)) ?? []; },
    sibling(id, direction) {
      const siblings = this.siblings(id);
      return siblings.length ? siblings[(siblings.indexOf(id) + direction + siblings.length) % siblings.length] : id;
    },
    descendants(id) {
      const result = [];
      const pending = [...this.children(id)];
      while (pending.length) {
        const child = pending.shift();
        result.push(child);
        pending.push(...this.children(child));
      }
      return result;
    },
  };
}

export function renderBodyNavigation(nodes, selectedId, systemName, onNavigate) {
  const nav = createBodyNavigation(nodes);
  const id = selectedId ?? SYSTEM;
  const label = (id) => id === SYSTEM ? 'System' : navigationLabel(nodes.get(id), systemName);
  const button = (id) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'act ghost';
    el.textContent = label(id);
    el.title = nodes.get(id)?.name ?? label(id);
    el.addEventListener('click', () => onNavigate(id));
    return el;
  };
  const trail = document.getElementById('bodyBreadcrumbs');
  trail.replaceChildren();
  for (const ancestor of nav.path(id)) {
    if (trail.childElementCount) trail.append(document.createTextNode(' › '));
    const el = button(ancestor);
    if (ancestor === id) el.setAttribute('aria-current', 'location');
    trail.append(el);
  }
  const siblings = nav.siblings(id);
  for (const [element, direction] of [['previousBodyButton', -1], ['nextBodyButton', 1]]) {
    const el = document.getElementById(element);
    el.disabled = siblings.length < 2;
    el.onclick = () => onNavigate(nav.sibling(id, direction));
  }
  const up = document.getElementById('parentBodyButton');
  up.disabled = id === SYSTEM;
  up.onclick = () => onNavigate(nav.parent(id));
  document.getElementById('bodySiblingStatus').textContent = siblings.length
    ? `${siblings.indexOf(id) + 1} of ${siblings.length} siblings` : 'System overview';
  const childIds = nav.children(id);
  document.getElementById('bodyChildrenLabel').textContent = childIds.length ? `Children (${childIds.length})` : 'No children';
  const list = document.getElementById('bodyChildren');
  list.replaceChildren(...childIds.map((child) => {
    const el = button(child);
    if (nodes.get(child)?.positionIssue) {
      el.textContent += ' · position unavailable';
      el.title += ` — ${nodes.get(child).positionIssue}`;
    }
    return el;
  }));
}
