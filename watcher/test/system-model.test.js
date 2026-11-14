import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemModel } from '../src/system-model.js';

function fsdJump(systemName, systemAddress, overrides = {}) {
  return {
    event: 'FSDJump',
    timestamp: '2026-01-01T00:00:00Z',
    StarSystem: systemName,
    SystemAddress: systemAddress,
    StarPos: [0, 0, 0],
    ...overrides,
  };
}

function scan(bodyId, systemAddress, overrides = {}) {
  return {
    event: 'Scan',
    timestamp: '2026-01-01T00:00:01Z',
    BodyID: bodyId,
    BodyName: `Test ${bodyId}`,
    SystemAddress: systemAddress,
    StarType: 'G',
    Parents: [{ Null: 0 }],
    SemiMajorAxis: 1e9,
    Eccentricity: 0,
    OrbitalInclination: 0,
    Periapsis: 0,
    AscendingNode: 0,
    MeanAnomaly: 0,
    OrbitalPeriod: 100000,
    ...overrides,
  };
}

test('snapshot is null before any system context has arrived', () => {
  const model = createSystemModel();
  assert.equal(model.snapshot(), null);
});

test('an FSDJump establishes system context; hasSystem becomes true and switched is true', () => {
  const model = createSystemModel();
  const result = model.applyEvents([fsdJump('Sol', 1)]);
  assert.deepEqual(result, { switched: true, hasSystem: true, updated: true });
  assert.equal(model.systemContext.starSystem, 'Sol');
});

test('Scan events for the current system accumulate into the snapshot', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  const snap = model.snapshot();
  assert.equal(snap.systemName, 'Sol');
  assert.ok(snap.nodes.some((n) => n.id === 1));
});

test('jumping to a different system displays only that system and reports switched=true', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  const result = model.applyEvents([fsdJump('Alpha Centauri', 2)]);
  assert.equal(result.switched, true);
  const snap = model.snapshot();
  assert.equal(snap.systemName, 'Alpha Centauri');
  assert.equal(snap.nodes.some((n) => n.id === 1 && n.kind === 'Star'), false);
});

test('A → B → A restores journal scans, barycentres and biology without recounting stats', () => {
  const model = createSystemModel();
  const organic = { event: 'ScanOrganic', timestamp: '2026-01-01T00:00:02Z',
    SystemAddress: 1, Body: 1, Species: 'Test species', Genus: 'Test genus', ScanType: 'Log' };
  model.applyEvents([fsdJump('A', 1), scan(1, 1, { WasDiscovered: false }), organic, organic,
    { event: 'ScanBaryCentre', BodyID: 5, SystemAddress: 1, timestamp: organic.timestamp },
    { event: 'SAASignalsFound', BodyID: 1, SystemAddress: 1, timestamp: organic.timestamp,
      Signals: [{ Type: '$SAA_SignalType_Biological;', Count: 2 }], Genuses: [{ Genus: 'Test genus' }] },
    { event: 'Bounty', TotalReward: 5000 }]);
  model.applyEvents([fsdJump('B', 2), scan(2, 2), fsdJump('A', 1)]);
  let snapshot = model.snapshot();
  assert.equal(snapshot.nodes.some((n) => n.id === 2), false);
  assert.equal(snapshot.nodes.find((n) => n.id === 5).kind, 'Barycentre');
  const body = snapshot.nodes.find((n) => n.id === 1);
  assert.equal(body.bio.samples[0].scansLogged, 1, 'duplicate samples are not counted twice');
  assert.equal(body.bio.signalCount, 2);
  assert.deepEqual(snapshot.sessionStats, { scans: 2, firstDiscoveries: 1 });
  assert.equal(snapshot.bountyTally, 5000);
  model.applyEvents([scan(1, 1, { timestamp: '2026-01-02T00:00:00Z', MeanAnomaly: 123 }), scan(1, 1)]);
  snapshot = model.snapshot();
  assert.equal(snapshot.nodes.find((n) => n.id === 1).elements.meanAnomalyDeg, 123);
});

test('session cache evicts least recently visited systems and a new model starts empty', () => {
  const model = createSystemModel({ maxSystems: 2 });
  model.applyEvents([fsdJump('A', 1), scan(1, 1), fsdJump('B', 2), scan(2, 2),
    fsdJump('A', 1), fsdJump('C', 3), fsdJump('A', 1)]);
  assert.ok(model.snapshot().nodes.some((n) => n.id === 1));
  model.applyEvents([fsdJump('B', 2)]);
  assert.equal(model.snapshot().nodes.length, 1, 'B was evicted');
  const restarted = createSystemModel();
  restarted.applyEvents([fsdJump('A', 1)]);
  assert.equal(restarted.snapshot().nodes.length, 1);
});

test('repeated scans compact before the per-system event bound is reached', () => {
  const model = createSystemModel({ maxEventsPerSystem: 2 });
  model.applyEvents([fsdJump('A', 1), scan(1, 1), scan(2, 1), scan(1, 1), scan(3, 1)]);
  assert.deepEqual(model.snapshot().nodes.map((n) => n.id).sort(), [0, 1, 3]);
});

test('same-commander relogs preserve scans; a different FID clears personal data and stats', () => {
  const model = createSystemModel();
  model.applyEvents([{ event: 'Commander', FID: 'F1', Name: 'Pilot' }, fsdJump('A', 1), scan(1, 1),
    { event: 'Bounty', TotalReward: 5000 }]);
  model.applyEvents([{ event: 'LoadGame', Commander: 'Pilot' }, fsdJump('A', 1)]);
  assert.ok(model.snapshot().nodes.some((n) => n.id === 1));
  assert.equal(model.snapshot().commanderKey, 'fid:F1');
  model.applyEvents([{ event: 'Commander', FID: 'F2', Name: 'Pilot' }, fsdJump('A', 1)]);
  assert.equal(model.snapshot().nodes.length, 1);
  assert.deepEqual(model.snapshot().sessionStats, { scans: 0, firstDiscoveries: 0 });
  assert.equal(model.snapshot().bountyTally, 0);
  assert.equal(model.snapshot().commanderKey, 'fid:F2');
  model.applyEvents([{ event: 'Commander', FID: 'F1', Name: 'Pilot' }, fsdJump('A', 1)]);
  assert.equal(model.snapshot().nodes.length, 1, 'changing back does not resurrect cleared data');
});

test('re-arriving at the same system (same SystemAddress) does not reset — switched is false and earlier scans survive', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  const result = model.applyEvents([fsdJump('Sol', 1)]); // left and came back
  assert.equal(result.switched, false);
  // updated is still true — not because the tree changed, but because
  // security/faction state legitimately can shift while the player was away.
  assert.equal(result.updated, true);
  const snap = model.snapshot();
  assert.ok(snap.nodes.some((n) => n.id === 1), 'earlier scan should still be present');
});

test('FSDJump\'s system-level fields (security, government, population, factions) land in the snapshot', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1, {
    SystemSecurity_Localised: 'High Security',
    SystemGovernment_Localised: 'Democracy',
    Population: 22780871220,
    Factions: [
      { Name: 'Mother Gaia', FactionState: 'None' },
      { Name: 'Some Rebels', FactionState: 'CivilWar' },
    ],
  })]);
  const snap = model.snapshot();
  assert.equal(snap.systemSecurity, 'High Security');
  assert.equal(snap.systemGovernment, 'Democracy');
  assert.equal(snap.population, 22780871220);
  assert.deepEqual(snap.factions, [
    { name: 'Mother Gaia', state: 'None' },
    { name: 'Some Rebels', state: 'CivilWar' },
  ]);
});

test('system-level fields survive a re-arrival that carries none of them (falls back to what was already known)', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1, { SystemSecurity_Localised: 'High Security' })]);
  model.applyEvents([fsdJump('Sol', 1)]); // a bare re-arrival with no security field this time
  const snap = model.snapshot();
  assert.equal(snap.systemSecurity, 'High Security');
});

test('Bounty events accumulate into a running bountyTally that survives a system switch', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([{ event: 'Bounty', timestamp: '2026-01-01T00:00:02Z', TotalReward: 5000 }]);
  model.applyEvents([{ event: 'Bounty', timestamp: '2026-01-01T00:00:03Z', TotalReward: 12000 }]);
  assert.equal(model.snapshot().bountyTally, 17000);

  model.applyEvents([fsdJump('Alpha Centauri', 2)]); // switch systems
  assert.equal(model.snapshot().bountyTally, 17000, 'bounty tally is session-scoped, not per-system');
});

test('a NavBeacon signal sets navBeaconDetected for the current system', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  assert.equal(model.snapshot().navBeaconDetected, false);
  model.applyEvents([{ event: 'FSSSignalDiscovered', timestamp: '2026-01-01T00:00:02Z', SystemAddress: 1, SignalType: 'NavBeacon', SignalName: 'Nav Beacon' }]);
  assert.equal(model.snapshot().navBeaconDetected, true);
});

test('navBeaconDetected resets on a real system switch but survives a same-system re-arrival', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([{ event: 'FSSSignalDiscovered', timestamp: '2026-01-01T00:00:02Z', SystemAddress: 1, SignalType: 'NavBeacon' }]);
  assert.equal(model.snapshot().navBeaconDetected, true);

  model.applyEvents([fsdJump('Sol', 1)]); // re-arrival, same system
  assert.equal(model.snapshot().navBeaconDetected, true, 'the beacon does not move — should still be known');

  model.applyEvents([fsdJump('Alpha Centauri', 2)]); // real switch
  assert.equal(model.snapshot().navBeaconDetected, false, 'a different system has not had its beacon found yet');
});

test('a NavBeacon signal for a different system than the current context is ignored', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([{ event: 'FSSSignalDiscovered', timestamp: '2026-01-01T00:00:02Z', SystemAddress: 999, SignalType: 'NavBeacon' }]);
  assert.equal(model.snapshot().navBeaconDetected, false);
});

test('sessionStats counts unique scanned bodies — a rescan of the same body counts once', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  model.applyEvents([scan(1, 1)]); // e.g. AutoScan followed by a NavBeaconDetail scan of the same body
  model.applyEvents([scan(2, 1, { StarType: undefined, PlanetClass: 'Rocky body', Parents: [{ Star: 1 }, { Null: 0 }] })]);
  assert.equal(model.snapshot().sessionStats.scans, 2);
});

test('sessionStats counts first discoveries (WasDiscovered:false) separately', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([
    scan(1, 1, { WasDiscovered: true }),
    scan(2, 1, { WasDiscovered: false, StarType: undefined, PlanetClass: 'Rocky body', Parents: [{ Star: 1 }, { Null: 0 }] }),
  ]);
  const stats = model.snapshot().sessionStats;
  assert.equal(stats.scans, 2);
  assert.equal(stats.firstDiscoveries, 1);
});

test('sessionStats survives a system switch (session-scoped, like the bounty tally)', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  model.applyEvents([fsdJump('Alpha Centauri', 2)]);
  model.applyEvents([scan(1, 2)]); // same BodyID, different system — a distinct body
  assert.equal(model.snapshot().sessionStats.scans, 2);
});

test('a Bounty event marks the poll as updated even though it never touches the body tree', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  const result = model.applyEvents([{ event: 'Bounty', timestamp: '2026-01-01T00:00:02Z', TotalReward: 5000 }]);
  assert.equal(result.updated, true);
});

test('FSSBodySignals events accumulate the same way Scan events do, and land in the snapshot as node.bio', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([
    scan(1, 1, { PlanetClass: 'Rocky body', StarType: undefined, Parents: [{ Null: 0 }] }),
    { event: 'FSSBodySignals', timestamp: '2026-01-01T00:00:02Z', BodyID: 1, SystemAddress: 1, Signals: [{ Type: '$SAA_SignalType_Biological;', Type_Localised: 'Biological', Count: 4 }] },
  ]);
  const snap = model.snapshot();
  const body = snap.nodes.find((n) => n.id === 1);
  assert.equal(body.bio.signalCount, 4);
});

test('Scan events for a system other than the current context are ignored', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(99, 999)]); // stray event tagged with a different SystemAddress
  const snap = model.snapshot();
  assert.equal(snap.nodes.some((n) => n.id === 99), false);
});

test('ScanBaryCentre events accumulate the same way Scan events do', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([
    scan(1, 1),
    { event: 'ScanBaryCentre', timestamp: '2026-01-01T00:00:02Z', SystemAddress: 1, BodyID: 5, SemiMajorAxis: 1e8, Eccentricity: 0, OrbitalInclination: 0, Periapsis: 0, AscendingNode: 0, MeanAnomaly: 0, OrbitalPeriod: 1000 },
  ]);
  const snap = model.snapshot();
  assert.ok(snap.nodes.some((n) => n.id === 5 && n.kind === 'Barycentre'));
});

test('updated is false when events arrive that the model does not track (e.g. Music, ReceiveText)', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  const result = model.applyEvents([
    { event: 'Music', timestamp: '2026-01-01T00:00:02Z', MusicTrack: 'Exploration' },
    { event: 'ReceiveText', timestamp: '2026-01-01T00:00:03Z', From: 'Someone', Message: 'hi', Channel: 'npc' },
  ]);
  assert.deepEqual(result, { switched: false, hasSystem: true, updated: false });
});

test('a full sequence spanning multiple applyEvents calls builds up correctly, mirroring incremental live reads', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  model.applyEvents([scan(2, 1, { StarType: undefined, PlanetClass: 'Rocky body', Parents: [{ Star: 1 }, { Null: 0 }] })]);
  const snap = model.snapshot();
  assert.equal(snap.nodes.length, 3); // root + star + planet
  const planet = snap.nodes.find((n) => n.id === 2);
  assert.equal(planet.kind, 'Planet');
  assert.equal(planet.parentId, 1);
});
