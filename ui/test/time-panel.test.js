import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeControl, advance } from '../src/time-control.js';
import { bindTimePanel } from '../src/time-panel.js';

function setup() {
  const elements = new Map();
  const root = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', disabled: false, attributes: {},
      addEventListener(event, fn) { this[event] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
    });
    return elements.get(id);
  } };
  const tc = createTimeControl(Date.parse('2026-11-13T00:00:00Z'));
  let selected;
  let renders = 0;
  const panel = bindTimePanel(tc, { root, getSelectedNode: () => selected, onChange: () => renders++ });
  panel.refresh();
  return { tc, panel, el: root.getElementById, select(node) { selected = node; panel.refresh(); }, renders: () => renders };
}

test('selecting another body or refreshing data does not replace the time reference', () => {
  const ui = setup();
  assert.equal(ui.el('useTimeReferenceButton').disabled, true);
  const node = { id: 1, name: 'Outer body', elements: { orbitalPeriodSec: 922.1 * 86400 } };
  ui.select(node);
  assert.equal(ui.el('useTimeReferenceButton').disabled, false);
  ui.el('useTimeReferenceButton').click();
  ui.select({ id: 2, name: 'Moon', elements: { orbitalPeriodSec: 86400 } });
  assert.equal(ui.el('timeReference').textContent, 'Outer body');
  ui.select(null);
  assert.equal(ui.tc.reference.id, 1);
  assert.equal(ui.el('timeReference').textContent, 'Outer body');
  assert.equal(ui.el('useTimeReferenceButton').disabled, true);
});

test('playback buttons update speed, direction, pause and reset together', () => {
  const ui = setup();
  ui.select({ id: 0, name: 'Star', elements: { orbitalPeriodSec: 86400 } });
  ui.el('useTimeReferenceButton').click();
  ui.el('fasterTimeButton').click();
  assert.equal(ui.el('playbackSpeed').textContent, '2×');
  assert.equal(ui.el('playbackDescription').textContent, '1 reference orbit / 15 real seconds');
  ui.el('slowerTimeButton').click();
  assert.equal(ui.el('playbackSpeed').textContent, '1×');
  ui.el('reverseTimeButton').click();
  assert.equal(ui.el('timeStatus').textContent, 'Reverse');
  ui.el('pauseTimeButton').click();
  assert.equal(ui.el('timeStatus').textContent, 'Paused');
  assert.equal(ui.el('pauseTimeButton').textContent, 'Resume');
  ui.el('nowButton').click();
  assert.equal(ui.el('timeStatus').textContent, 'Live');
  assert.equal(ui.el('timeReference').textContent, 'Real-time seconds');
  assert.equal(ui.el('playbackSpeed').textContent, '1×');
  assert.equal(ui.tc.direction, 1);
  assert.equal(ui.tc.paused, false);
  assert.equal(ui.renders(), 6);
});

test('clock updates independently of scene renders and stops while paused', () => {
  const ui = setup();
  advance(ui.tc, 1000);
  ui.panel.tick(1000);
  assert.equal(ui.el('edClock').textContent, '3312-11-13 00:00:01 UTC');
  assert.equal(ui.renders(), 0);
  ui.el('pauseTimeButton').click();
  advance(ui.tc, 5000);
  ui.panel.tick(6000);
  assert.equal(ui.el('edClock').textContent, '3312-11-13 00:00:01 UTC');
});
