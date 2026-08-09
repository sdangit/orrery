import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBioData, BIOLOGICAL_SIGNAL_TYPE } from '../src/bio-signals.js';

// Synthetic events shaped per the verified schemas (elite-journal.readthedocs.io,
// schemas.edomh.nl) — this project's own real journal fixture has FSSBodySignals/
// SAASignalsFound examples but with Geological/Human signals, not Biological, and
// has no ScanOrganic examples at all.

function fssBodySignals(bodyId, systemAddress, signals) {
  return { event: 'FSSBodySignals', timestamp: '2026-01-01T00:00:00Z', BodyID: bodyId, SystemAddress: systemAddress, Signals: signals };
}

function saaSignalsFound(bodyId, systemAddress, signals, genuses = []) {
  return { event: 'SAASignalsFound', timestamp: '2026-01-01T00:00:01Z', BodyID: bodyId, SystemAddress: systemAddress, Signals: signals, Genuses: genuses };
}

function scanOrganic(bodyId, systemAddress, scanType, genus, species) {
  return {
    event: 'ScanOrganic', timestamp: '2026-01-01T00:00:02Z', Body: bodyId, SystemAddress: systemAddress,
    ScanType: scanType, Genus: `$Codex_Ent_${genus}_Genus_Name;`, Genus_Localised: genus,
    Species: `$Codex_Ent_${species}_Name;`, Species_Localised: species,
  };
}

test('a body with only geological signals gets no bio entry at all', () => {
  const events = [fssBodySignals(10, 1, [{ Type: '$SAA_SignalType_Geological;', Type_Localised: 'Geological', Count: 2 }])];
  const bio = extractBioData(events, 1);
  assert.equal(bio.has(10), false);
});

test('FSSBodySignals with a Biological entry sets the signal count', () => {
  const events = [fssBodySignals(10, 1, [{ Type: BIOLOGICAL_SIGNAL_TYPE, Type_Localised: 'Biological', Count: 3 }])];
  const bio = extractBioData(events, 1);
  assert.equal(bio.get(10).signalCount, 3);
  assert.deepEqual(bio.get(10).genuses, []); // no genus prediction before SAASignalsFound
});

test('SAASignalsFound overrides the count and adds genus names', () => {
  const events = [
    fssBodySignals(10, 1, [{ Type: BIOLOGICAL_SIGNAL_TYPE, Type_Localised: 'Biological', Count: 3 }]),
    saaSignalsFound(10, 1, [{ Type: BIOLOGICAL_SIGNAL_TYPE, Type_Localised: 'Biological', Count: 2 }], [
      { Genus: '$Codex_Ent_Tubus_Genus_Name;', Genus_Localised: 'Tubus' },
      { Genus: '$Codex_Ent_Bacterial_Genus_Name;', Genus_Localised: 'Bacterium' },
    ]),
  ];
  const bio = extractBioData(events, 1);
  assert.equal(bio.get(10).signalCount, 2, 'SAASignalsFound is the more authoritative post-DSS count');
  assert.deepEqual(bio.get(10).genuses, ['Tubus', 'Bacterium']);
});

test('ScanOrganic tracks sample progress per species, incrementing scansLogged', () => {
  const events = [
    scanOrganic(10, 1, 'Log', 'Tubus', 'Tubus Conifer'),
    scanOrganic(10, 1, 'Sample', 'Tubus', 'Tubus Conifer'),
  ];
  const bio = extractBioData(events, 1);
  const sample = bio.get(10).samples.find((s) => s.species === 'Tubus Conifer');
  assert.equal(sample.scansLogged, 2);
  assert.equal(sample.complete, false);
});

test('a ScanType of Analyse marks the sample complete (the third and final scan)', () => {
  const events = [
    scanOrganic(10, 1, 'Log', 'Tubus', 'Tubus Conifer'),
    scanOrganic(10, 1, 'Sample', 'Tubus', 'Tubus Conifer'),
    scanOrganic(10, 1, 'Analyse', 'Tubus', 'Tubus Conifer'),
  ];
  const bio = extractBioData(events, 1);
  const sample = bio.get(10).samples.find((s) => s.species === 'Tubus Conifer');
  assert.equal(sample.scansLogged, 3);
  assert.equal(sample.complete, true);
});

test('multiple species on the same body are tracked independently', () => {
  const events = [
    scanOrganic(10, 1, 'Log', 'Tubus', 'Tubus Conifer'),
    scanOrganic(10, 1, 'Log', 'Fonticulus', 'Fonticulus Campestris'),
  ];
  const bio = extractBioData(events, 1);
  assert.equal(bio.get(10).samples.length, 2);
});

test('events for a different SystemAddress are ignored', () => {
  const events = [fssBodySignals(10, 999, [{ Type: BIOLOGICAL_SIGNAL_TYPE, Type_Localised: 'Biological', Count: 3 }])];
  const bio = extractBioData(events, 1);
  assert.equal(bio.has(10), false);
});

test('extractBioData with no systemAddress filter processes everything', () => {
  const events = [fssBodySignals(10, 1, [{ Type: BIOLOGICAL_SIGNAL_TYPE, Type_Localised: 'Biological', Count: 1 }])];
  const bio = extractBioData(events);
  assert.equal(bio.get(10).signalCount, 1);
});

test('ScanOrganic uses the "Body" field, not "BodyID" — the one real gotcha this schema has', () => {
  const evt = scanOrganic(42, 1, 'Log', 'Tubus', 'Tubus Conifer');
  assert.ok('Body' in evt);
  assert.ok(!('BodyID' in evt));
  const bio = extractBioData([evt], 1);
  assert.ok(bio.has(42));
});
