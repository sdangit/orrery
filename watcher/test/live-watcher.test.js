import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveWatcher } from '../src/live-watcher.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'orrery-live-watcher-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function line(obj) {
  return `${JSON.stringify(obj)}\n`;
}

function fsdJump(systemName, systemAddress, timestamp = '2026-01-01T00:00:00Z') {
  return { event: 'FSDJump', timestamp, StarSystem: systemName, SystemAddress: systemAddress, StarPos: [0, 0, 0] };
}

function scan(bodyId, systemAddress, timestamp = '2026-01-01T00:00:01Z') {
  return {
    event: 'Scan', timestamp, BodyID: bodyId, BodyName: `Test ${bodyId}`, SystemAddress: systemAddress,
    StarType: 'G', Parents: [{ Null: 0 }],
    SemiMajorAxis: 1e9, Eccentricity: 0, OrbitalInclination: 0, Periapsis: 0, AscendingNode: 0, MeanAnomaly: 0, OrbitalPeriod: 100000,
  };
}

test('polling an empty directory reports no journal and a null snapshot', () => {
  withTempDir((dir) => {
    const watcher = createLiveWatcher(dir);
    const result = watcher.poll();
    assert.deepEqual(result, { changed: false, snapshot: null, journalPath: null });
  });
});

test('polling picks up an existing journal\'s events on first read', () => {
  withTempDir((dir) => {
    const journalPath = join(dir, 'Journal.2026-01-01T000000.01.log');
    writeFileSync(journalPath, line(fsdJump('Sol', 1)) + line(scan(1, 1)));

    const watcher = createLiveWatcher(dir);
    const result = watcher.poll();
    assert.equal(result.changed, true);
    assert.equal(result.snapshot.systemName, 'Sol');
    assert.equal(result.journalPath, journalPath);
  });
});

test('a second poll with no new bytes reports changed=false', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();
    const result = watcher.poll();
    assert.equal(result.changed, false);
  });
});

test('appending a new Scan line is picked up on the next poll', () => {
  withTempDir((dir) => {
    const journalPath = join(dir, 'Journal.2026-01-01T000000.01.log');
    writeFileSync(journalPath, line(fsdJump('Sol', 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();

    appendFileSync(journalPath, line(scan(1, 1)));
    const result = watcher.poll();
    assert.equal(result.changed, true);
    assert.ok(result.snapshot.nodes.some((n) => n.id === 1));
  });
});

test('a newer journal file appearing (relog) is picked up and tailed instead of the old one', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)) + line(scan(1, 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();

    const newerPath = join(dir, 'Journal.2026-01-01T010000.01.log');
    writeFileSync(newerPath, line(fsdJump('Alpha Centauri', 2)));
    const result = watcher.poll();
    assert.equal(result.journalPath, newerPath);
    assert.equal(result.changed, true);
    assert.equal(result.snapshot.systemName, 'Alpha Centauri');
  });
});

test('relogging into a new file but the same system does not spuriously report a change', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)) + line(scan(1, 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();

    const newerPath = join(dir, 'Journal.2026-01-01T010000.01.log');
    writeFileSync(newerPath, line(fsdJump('Sol', 1))); // same SystemAddress
    const result = watcher.poll();
    assert.equal(result.changed, false);
    assert.equal(result.snapshot.systemName, 'Sol');
    assert.ok(result.snapshot.nodes.some((n) => n.id === 1), 'earlier scan of body 1 should survive the relog');
  });
});
