import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindHudLayout } from '../src/hud-layout.js';

function setup(narrow = false) {
  const elements = new Map();
  let focused;
  const viewport = { addEventListener(type, fn) { this[type] = fn; } };
  const root = { defaultView: viewport, addEventListener(type, fn) { this[type] = fn; }, getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, attributes: {},
      addEventListener(type, fn) { this[type] = fn; },
      setAttribute(key, value) { this.attributes[key] = value; },
      focus() { focused = id; },
    });
    return elements.get(id);
  } };
  const storage = new Map();
  const hud = bindHudLayout({ root, isNarrow: () => narrow,
    storage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  return { hud, root, el: root.getElementById, focus: () => focused, resize(value) { narrow = value; viewport.resize(); } };
}

test('settings temporarily replaces details and live updates preserve the open drawer', () => {
  const { hud, el, focus } = setup();
  hud.selectionChanged(true, { reveal: true });
  el('settingsToggle').click();
  assert.equal(el('bodyDrawer').hidden, true);
  assert.equal(el('settingsPanel').hidden, false);
  hud.selectionChanged(true); // an incoming scan updates the selected body's data
  assert.equal(el('settingsPanel').hidden, false);
  el('closeSettingsButton').click();
  assert.equal(el('bodyDrawer').hidden, false);
  assert.equal(focus(), 'settingsToggle');
  el('closeDetailButton').click();
  hud.selectionChanged(true);
  el('settingsToggle').click();
  el('closeSettingsButton').click();
  assert.equal(el('bodyDrawer').hidden, true); // remember deliberate collapse
  assert.equal(el('bodyToggle').disabled, false); // selection was not cleared
  el('bodyToggle').click();
  assert.equal(el('bodyDrawer').hidden, false);
});

test('explicit navigation reveals the selected body and Escape dismisses the legend first', () => {
  const { hud, root, el } = setup();
  hud.selectionChanged(true);
  el('settingsToggle').click();
  el('legendToggle').click();
  assert.equal(el('settingsPanel').hidden, true);
  root.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(el('legend').hidden, true);
  assert.equal(el('settingsPanel').hidden, false);
  hud.selectionChanged(true, { reveal: true });
  assert.equal(el('settingsPanel').hidden, true);
  assert.equal(el('bodyDrawer').hidden, false);
  hud.selectionChanged(false);
  assert.equal(el('bodyDrawer').hidden, true);
  assert.equal(el('bodyToggle').disabled, true);
});

test('narrow screens show one side panel and return focus to the originating system control', () => {
  const { hud, el, focus } = setup(true);
  hud.selectionChanged(true);
  assert.equal(el('systemPanel').hidden, false);
  assert.equal(el('bodyDrawer').hidden, true);
  el('activitySettingsButton').click();
  assert.equal(el('systemPanel').hidden, true);
  assert.equal(el('settingsPanel').hidden, false);
  el('closeSettingsButton').click();
  assert.equal(el('systemPanel').hidden, false);
  assert.equal(focus(), 'activitySettingsButton');
  hud.selectionChanged(true, { reveal: true });
  assert.equal(el('systemPanel').hidden, true);
  assert.equal(el('bodyDrawer').hidden, false);
  el('systemToggle').click();
  assert.equal(el('bodyDrawer').hidden, true);
  assert.equal(el('systemPanel').hidden, false);
});

test('resizing into a narrow viewport reconciles panels already open on desktop', () => {
  const { hud, el, resize } = setup();
  hud.selectionChanged(true, { reveal: true });
  assert.equal(el('systemPanel').hidden, false);
  assert.equal(el('bodyDrawer').hidden, false);
  resize(true);
  assert.equal(el('systemPanel').hidden, true);
  assert.equal(el('bodyDrawer').hidden, false);
  resize(false);
  assert.equal(el('bodyDrawer').hidden, false);
});

test('toolbar overlays restore the previous panel on narrow screens, including stacked legend and settings', () => {
  const { hud, root, el } = setup(true);
  hud.selectionChanged(true);
  el('settingsToggle').click();
  el('legendToggle').click();
  el('closeLegendButton').click();
  assert.equal(el('settingsPanel').hidden, false);
  assert.equal(el('systemPanel').hidden, true);
  el('closeSettingsButton').click();
  assert.equal(el('systemPanel').hidden, false);
  assert.equal(el('bodyDrawer').hidden, true);
  el('legendToggle').click();
  root.keydown({ key:'Escape', preventDefault() {} });
  assert.equal(el('systemPanel').hidden, false);
  // Switching from Legend directly to Settings retains the underlying panel.
  el('legendToggle').click();
  el('settingsToggle').click();
  el('settingsToggle').click();
  assert.equal(el('systemPanel').hidden, false);
  // Starting with body details restores those instead of opening System.
  hud.selectionChanged(true, { reveal:true });
  el('settingsToggle').click();
  el('closeSettingsButton').click();
  assert.equal(el('bodyDrawer').hidden, false);
  assert.equal(el('systemPanel').hidden, true);
});

test('community-data shortcut focuses the first provider and returns to its opener', () => {
  const { el, focus } = setup(true);
  el('dataSettingsButton').click();
  assert.equal(focus(), 'edsmToggle');
  el('closeSettingsButton').click();
  assert.equal(focus(), 'dataSettingsButton');
  assert.equal(el('systemPanel').hidden, false);
});
