import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyModeHighlight, reserveLevelLabel } from '../src/mode-highlight.js';

// Real journal enum values carry a "Resources" suffix, confirmed against the
// project's own fixture ("ReserveLevel":"PristineResources") — not the bare
// "Pristine"/"Major" names players use colloquially.
const ringed = (reserveLevel) => ({ raw: { Rings: [{ Name: 'A Ring', RingClass: 'eRingClass_Rocky' }], ReserveLevel: reserveLevel } });
const unringed = { raw: { PlanetClass: 'Rocky body' } };

test('a ringed body is highlighted in mining mode', () => {
  const result = classifyModeHighlight(ringed('CommonResources'), 'mining');
  assert.equal(result.highlighted, true);
  assert.ok(result.reasons.includes('ringed'));
});

test('an unringed body is never highlighted in mining mode', () => {
  assert.deepEqual(classifyModeHighlight(unringed, 'mining'), { highlighted: false, reasons: [] });
});

test('PristineResources and MajorResources get the good-reserve reason; the rest do not', () => {
  for (const level of ['PristineResources', 'MajorResources']) {
    assert.ok(classifyModeHighlight(ringed(level), 'mining').reasons.includes('good-reserve'), level);
  }
  for (const level of ['CommonResources', 'LowResources', 'DepletedResources']) {
    assert.ok(!classifyModeHighlight(ringed(level), 'mining').reasons.includes('good-reserve'), level);
  }
});

test('the reserve level appears as a lowercase, suffix-stripped reason tag', () => {
  assert.ok(classifyModeHighlight(ringed('PristineResources'), 'mining').reasons.includes('reserve-pristine'));
});

test('mining highlighting is a no-op outside mining mode', () => {
  for (const mode of ['exploration', 'exobiology', 'piracy']) {
    assert.deepEqual(classifyModeHighlight(ringed('PristineResources'), mode), { highlighted: false, reasons: [] });
  }
});

test('a body with no raw event at all does not throw', () => {
  assert.deepEqual(classifyModeHighlight({}, 'mining'), { highlighted: false, reasons: [] });
});

test('reserveLevelLabel strips the "Resources" suffix', () => {
  assert.equal(reserveLevelLabel('PristineResources'), 'Pristine');
  assert.equal(reserveLevelLabel('DepletedResources'), 'Depleted');
});

test('reserveLevelLabel passes through undefined/null unchanged', () => {
  assert.equal(reserveLevelLabel(undefined), undefined);
  assert.equal(reserveLevelLabel(null), null);
});

const bioNode = (overrides) => ({ bio: { signalCount: 1, genuses: [], samples: [], ...overrides } });

test('a body with bio signals is highlighted in exobiology mode', () => {
  const result = classifyModeHighlight(bioNode({ signalCount: 3 }), 'exobiology');
  assert.equal(result.highlighted, true);
  assert.ok(result.reasons.includes('has-bio-signals'));
});

test('a body with no bio field at all is never highlighted in exobiology mode', () => {
  assert.deepEqual(classifyModeHighlight({}, 'exobiology'), { highlighted: false, reasons: [] });
});

test('a body with bio field but zero signal count is not highlighted', () => {
  assert.deepEqual(classifyModeHighlight(bioNode({ signalCount: 0 }), 'exobiology'), { highlighted: false, reasons: [] });
});

test('known genuses (post-SAASignalsFound) add the genus-known reason', () => {
  const result = classifyModeHighlight(bioNode({ signalCount: 2, genuses: ['Tubus'] }), 'exobiology');
  assert.ok(result.reasons.includes('genus-known'));
});

test('no genus-known reason before SAASignalsFound has reported one', () => {
  const result = classifyModeHighlight(bioNode({ signalCount: 2, genuses: [] }), 'exobiology');
  assert.ok(!result.reasons.includes('genus-known'));
});

test('an in-progress sample set gets sampling-in-progress, not fully-sampled', () => {
  const node = bioNode({ samples: [{ genus: 'Tubus', species: 'Tubus Conifer', scansLogged: 2, complete: false }] });
  const result = classifyModeHighlight(node, 'exobiology');
  assert.ok(result.reasons.includes('sampling-in-progress'));
  assert.ok(!result.reasons.includes('fully-sampled'));
});

test('a fully-completed sample set (all species complete) gets fully-sampled', () => {
  const node = bioNode({ samples: [{ genus: 'Tubus', species: 'Tubus Conifer', scansLogged: 3, complete: true }] });
  const result = classifyModeHighlight(node, 'exobiology');
  assert.ok(result.reasons.includes('fully-sampled'));
});

test('multiple species, one still in progress: overall reason is sampling-in-progress, not fully-sampled', () => {
  const node = bioNode({
    samples: [
      { genus: 'Tubus', species: 'Tubus Conifer', scansLogged: 3, complete: true },
      { genus: 'Fonticulus', species: 'Fonticulus Campestris', scansLogged: 1, complete: false },
    ],
  });
  const result = classifyModeHighlight(node, 'exobiology');
  assert.ok(result.reasons.includes('sampling-in-progress'));
  assert.ok(!result.reasons.includes('fully-sampled'));
});

test('exobiology highlighting is a no-op outside exobiology mode', () => {
  for (const mode of ['exploration', 'mining', 'piracy']) {
    assert.deepEqual(classifyModeHighlight(bioNode({ signalCount: 5 }), mode), { highlighted: false, reasons: [] });
  }
});
