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

test('jumping to a different system resets accumulated scans and reports switched=true', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  model.applyEvents([scan(1, 1)]);
  const result = model.applyEvents([fsdJump('Alpha Centauri', 2)]);
  assert.equal(result.switched, true);
  const snap = model.snapshot();
  assert.equal(snap.systemName, 'Alpha Centauri');
  assert.equal(snap.nodes.some((n) => n.id === 1 && n.kind === 'Star'), false);
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

test('a Bounty event marks the poll as updated even though it never touches the body tree', () => {
  const model = createSystemModel();
  model.applyEvents([fsdJump('Sol', 1)]);
  const result = model.applyEvents([{ event: 'Bounty', timestamp: '2026-01-01T00:00:02Z', TotalReward: 5000 }]);
  assert.equal(result.updated, true);
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
