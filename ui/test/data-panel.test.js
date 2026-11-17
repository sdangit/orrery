import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDetailPanel } from '../src/data-panel.js';

function setup() {
  const nodes = new Map();
  const make = () => ({ textContent: '', hidden: false, title: '', replaceChildren() {}, appendChild() {} });
  globalThis.document = { createElement: make, getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, make());
    return nodes.get(id);
  } };
  return (id) => document.getElementById(id);
}

test('belt details show extent and assumed plane, then restore ordinary body sections', () => {
  const el = setup();
  renderDetailPanel({ id: 'belt:0:a', name: 'Asteroid Belt', kind: 'AsteroidBelt',
    raw: { InnerRad: 308170000000, OuterRad: 489190000000, RingClass: 'eRingClass_Rocky' } }, 'Sol');
  assert.equal(el('detailKind').textContent, 'Asteroid belt (Rocky)');
  assert.equal(el('detailBeltInner').textContent, '308170000 km');
  assert.equal(el('detailBeltOuter').textContent, '489190000 km');
  assert.match(el('detailPosition').textContent, /assumed plane/);
  assert.equal(el('detailExplorationSection').hidden, true);
  assert.equal(el('detailRadiusRow').hidden, true);
  renderDetailPanel({ id: 0, kind: 'Star', raw: {} }, 'Sol');
  assert.equal(el('detailBeltInnerRow').hidden, true);
  assert.equal(el('detailExplorationSection').hidden, false);
  assert.equal(el('detailRadiusRow').hidden, false);
});

test('details separate orbital epoch, database freshness, ancestry quality and personal scan status', () => {
  const el = setup();
  renderDetailPanel({ id: 3, name: 'Earth', kind: 'Planet', sources: ['journal', 'spansh'],
    orbitSource: 'journal', orbitQuality: 'propagated', positionQuality: 'approximate', positionSources: ['journal', 'edsm'],
    elements: { epochMs: Date.parse('2026-01-01T00:00:00Z'), orbitalPeriodSec: -86400 },
    recordUpdates: { spansh: Date.parse('2026-02-01T12:00:00Z') },
    raw: { SurfaceGravity: 9.80665, WasMapped: false, WasDiscovered: false },
  }, 'Sol');
  assert.equal(el('detailBackfillNotice').hidden, true);
  assert.equal(el('detailSources').textContent, 'Journal + Spansh');
  assert.equal(el('detailPosition').textContent, 'Approximate phase / orientation');
  assert.equal(el('detailOrbitEpoch').textContent, '2026-01-01 00:00:00');
  assert.equal(el('detailRecordUpdated').textContent, 'Spansh: 2026-02-01 12:00:00');
  assert.equal(el('detailGravity').textContent, '1.00 G');
  assert.equal(el('detailPeriod').textContent, '24.0 h (retrograde)');
  assert.equal(el('detailMapped').textContent, 'NO — FIRST MAPPING');
});

test('illustrative community epochs are not presented as known orbital phase timestamps', () => {
  const el = setup();
  renderDetailPanel({ id: 3, name: 'Earth', kind: 'Planet', isBackfill: true,
    sources: ['edsm'], orbitSource: 'edsm', orbitQuality: 'approximate', positionQuality: 'approximate',
    elements: { epochMs: Date.now(), orbitalPeriodSec: 86400 }, raw: {},
  }, 'Sol');
  assert.equal(el('detailBackfillNotice').hidden, false);
  assert.equal(el('detailOrbitEpoch').textContent, 'Unknown (illustrative phase)');
});

test('EDGIS binary phase inference is disclosed separately from record freshness', () => {
  const el = setup();
  renderDetailPanel({ id: 2, name: 'Ross 54', kind: 'Star', isBackfill: true,
    sources: ['edgis'], orbitSource: 'edgis', orbitQuality: 'approximate', positionQuality: 'approximate',
    phaseReferenceBodyId: 1, elements: { epochMs: 0, orbitalPeriodSec: 86400 },
    recordUpdates: { edgis: Date.parse('2026-10-29T23:54:41Z') }, raw: {},
  }, 'LFT 509');
  assert.equal(el('detailSources').textContent, 'EDGIS');
  assert.equal(el('detailOrbitSource').textContent, 'EDGIS');
  assert.equal(el('detailOrbitEpoch').textContent, 'Estimated from binary companion (body 1)');
  assert.equal(el('detailRecordUpdated').textContent, 'EDGIS: 2026-10-29 23:54:41');
});
