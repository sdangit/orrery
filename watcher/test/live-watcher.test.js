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

test('rotation drains unread scans from the old part and retains the cache across a game restart', () => {
  withTempDir((dir) => {
    const first = join(dir, 'Journal.2026-01-01T000000.01.log');
    const second = join(dir, 'Journal.2026-01-01T000000.02.log');
    const commander = { event: 'Commander', FID: 'F1', Name: 'Test' };
    writeFileSync(first, line(commander) + line(fsdJump('A', 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();
    appendFileSync(first, line(scan(1, 1)) + line({ event: 'Continued', Part: 2 }));
    writeFileSync(second, line(fsdJump('B', 2)) + line(scan(2, 2)));
    assert.equal(watcher.poll().journalPath, second);
    const relog = join(dir, 'Journal.2026-01-01T010000.01.log');
    writeFileSync(relog, line(commander) + line(fsdJump('A', 1)));
    const result = watcher.poll();
    assert.equal(result.journalPath, relog);
    assert.ok(result.snapshot.nodes.some((n) => n.id === 1));
    assert.equal(result.snapshot.sessionStats.scans, 2);
    assert.equal(watcher.poll().changed, false);
  });
});

test('a snapshot has nextSystem null when there is no NavRoute.json at all', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)));
    const watcher = createLiveWatcher(dir);
    const result = watcher.poll();
    assert.equal(result.snapshot.nextSystem, null);
  });
});

test('a snapshot reports the next hop from a real-shaped NavRoute.json', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)));
    writeFileSync(join(dir, 'NavRoute.json'), JSON.stringify({
      timestamp: '2026-01-01T00:00:00Z',
      event: 'Route',
      Route: [
        { StarSystem: 'Sol', SystemAddress: 1, StarPos: [0, 0, 0], StarClass: 'G' },
        { StarSystem: 'Alpha Centauri', SystemAddress: 2, StarPos: [3, 0, 3], StarClass: 'G' },
      ],
    }));
    const watcher = createLiveWatcher(dir);
    const result = watcher.poll();
    assert.deepEqual(result.snapshot.nextSystem, { starSystem: 'Alpha Centauri', starClass: 'G' });
  });
});

test('the next hop appearing (route freshly plotted) is reported as a change even with no new journal lines', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();

    writeFileSync(join(dir, 'NavRoute.json'), JSON.stringify({
      timestamp: '2026-01-01T00:00:01Z',
      event: 'Route',
      Route: [
        { StarSystem: 'Sol', SystemAddress: 1, StarPos: [0, 0, 0], StarClass: 'G' },
        { StarSystem: 'Alpha Centauri', SystemAddress: 2, StarPos: [3, 0, 3], StarClass: 'G' },
      ],
    }));
    const result = watcher.poll();
    assert.equal(result.changed, true);
    assert.deepEqual(result.snapshot.nextSystem, { starSystem: 'Alpha Centauri', starClass: 'G' });
  });
});

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

test('a snapshot carries the auto-detected mode, computed from real event scoring (not just the fallback default)', () => {
  withTempDir((dir) => {
    const journalPath = join(dir, 'Journal.2026-01-01T000000.01.log');
    const nowIso = new Date().toISOString();
    writeFileSync(journalPath, line(fsdJump('Sol', 1, nowIso)));
    const watcher = createLiveWatcher(dir);
    const first = watcher.poll();
    assert.equal(first.snapshot.mode, 'exploration', 'no piracy signal yet — should be the default');

    appendFileSync(journalPath, line({ event: 'Bounty', timestamp: new Date().toISOString(), TotalReward: 5000 }));
    appendFileSync(journalPath, line({ event: 'UnderAttack', timestamp: new Date().toISOString(), Target: 'You' }));
    const second = watcher.poll();
    assert.equal(second.snapshot.mode, 'piracy');
    assert.equal(second.changed, true, 'a mode flip should be reported as a change even with no new Scan data');
  });
});

test('relogging into a new file but the same system preserves earlier scan data (system-level context still legitimately refreshes)', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'Journal.2026-01-01T000000.01.log'), line(fsdJump('Sol', 1)) + line(scan(1, 1)));
    const watcher = createLiveWatcher(dir);
    watcher.poll();

    const newerPath = join(dir, 'Journal.2026-01-01T010000.01.log');
    writeFileSync(newerPath, line(fsdJump('Sol', 1))); // same SystemAddress
    const result = watcher.poll();
    // changed is still true here — not because the tree changed, but because
    // security/faction state legitimately can shift between visits (the BGS
    // doesn't pause while you're away), so every arrival re-reports context.
    assert.equal(result.changed, true);
    assert.equal(result.snapshot.systemName, 'Sol');
    assert.ok(result.snapshot.nodes.some((n) => n.id === 1), 'earlier scan of body 1 should survive the relog');
  });
});
