import { orbitFrame, SYSTEM_FRAME, viewOrientation } from './view-presets.js';

const PRESETS = { top: 'Top', front: 'Front', side: 'Side', angled: 'Angled' };

export function bindViewPanel({ getSelectedNode, getNodes, onApply, root = document }) {
  const el = id => root.getElementById(id);
  const toggle = el('viewToggle');
  const panel = el('viewMenu');
  const reference = el('viewReference');
  let active = { preset: 'angled', reference: 'system' };
  function close({ focus = false } = {}) {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (focus) toggle.focus();
  }
  function refresh() {
    const node = getSelectedNode();
    const available = Boolean(orbitFrame(node, getNodes?.()));
    el('selectedOrbitOption').disabled = !available;
    if (!available) reference.value = 'system';
    el('viewReferenceNote').textContent = reference.value === 'selected'
      ? `${node.name ?? 'Selected body'}${node.orbitQuality === 'approximate' ? ' · displayed orientation is approximate' : ''}`
      : available ? 'System XY reference plane. Select an orbit to use its own plane.'
        : 'System XY reference plane. Select a body with orbital data to use its plane.';
    for (const preset of Object.keys(PRESETS)) {
      const pressed = active?.preset === preset && active.reference === reference.value
        && (reference.value === 'system' || active.bodyId === node?.id);
      el(`view${PRESETS[preset]}Button`).setAttribute('aria-pressed', String(pressed));
    }
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    refresh();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    reference.focus();
  });
  el('closeViewButton').addEventListener('click', () => close({ focus: true }));
  reference.addEventListener('change', refresh);
  for (const [preset, label] of Object.entries(PRESETS)) {
    el(`view${label}Button`).addEventListener('click', () => {
      const node = getSelectedNode();
      const selected = reference.value === 'selected';
      const frame = selected ? orbitFrame(node, getNodes?.()) : SYSTEM_FRAME;
      if (!frame) { refresh(); return; }
      onApply(viewOrientation(preset, frame));
      active = { preset, reference: reference.value, bodyId: selected ? node.id : null };
      el('viewOrientationStatus').textContent = `${label} · ${selected ? node.name ?? 'Selected orbit' : 'System reference plane'}`;
      refresh();
      close({ focus: true });
    });
  }
  root.addEventListener('pointerdown', event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { close({ focus: true }); event.preventDefault(); }
  }, { capture: true });
  refresh();
  return {
    refresh,
    custom() { active = null; el('viewOrientationStatus').textContent = 'Custom orientation'; refresh(); },
    reset() {
      active = { preset: 'angled', reference: 'system' };
      reference.value = 'system';
      el('viewOrientationStatus').textContent = 'Angled · System reference plane';
      refresh();
    },
  };
}
