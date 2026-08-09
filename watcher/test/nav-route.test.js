import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNavRouteFile, nextSystemInRoute } from '../src/nav-route.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'orrery-nav-route-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('readNavRouteFile returns null when the file does not exist', () => {
  withTempDir((dir) => {
    assert.equal(readNavRouteFile(dir), null);
  });
});

test('readNavRouteFile parses a real-shaped cleared route (matches Terje\'s actual file)', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'NavRoute.json'), '{ "timestamp":"2025-11-15T18:09:38Z", "event":"NavRouteClear", "Route":[ ] }');
    const result = readNavRouteFile(dir);
    assert.equal(result.event, 'NavRouteClear');
    assert.deepEqual(result.route, []);
  });
});

test('readNavRouteFile parses a populated route, mapping fields to camelCase', () => {
  withTempDir((dir) => {
    const content = {
      timestamp: '2026-01-01T00:00:00Z',
      event: 'Route',
      Route: [
        { StarSystem: 'Sol', SystemAddress: 1, StarPos: [0, 0, 0], StarClass: 'G' },
        { StarSystem: 'Alpha Centauri', SystemAddress: 2, StarPos: [3, 0, 3], StarClass: 'G' },
      ],
    };
    writeFileSync(join(dir, 'NavRoute.json'), JSON.stringify(content));
    const result = readNavRouteFile(dir);
    assert.equal(result.event, 'Route');
    assert.deepEqual(result.route, [
      { starSystem: 'Sol', systemAddress: 1, starClass: 'G' },
      { starSystem: 'Alpha Centauri', systemAddress: 2, starClass: 'G' },
    ]);
  });
});

test('readNavRouteFile returns null (not a throw) on a mid-write malformed file', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'NavRoute.json'), '{ "timestamp":"2026-01-01T00:00:00Z", "event":"Route", "Rou');
    assert.equal(readNavRouteFile(dir), null);
  });
});

const route = [
  { starSystem: 'Sol', systemAddress: 1, starClass: 'G' },
  { starSystem: 'Alpha Centauri', systemAddress: 2, starClass: 'G' },
  { starSystem: 'Barnard\'s Star', systemAddress: 3, starClass: 'M' },
];

test('nextSystemInRoute returns the hop after the current system', () => {
  assert.deepEqual(nextSystemInRoute(route, 1), { starSystem: 'Alpha Centauri', starClass: 'G' });
  assert.deepEqual(nextSystemInRoute(route, 2), { starSystem: 'Barnard\'s Star', starClass: 'M' });
});

test('nextSystemInRoute returns null at the final hop (nowhere left to go)', () => {
  assert.equal(nextSystemInRoute(route, 3), null);
});

test('nextSystemInRoute returns null when the current system is not on the route at all', () => {
  assert.equal(nextSystemInRoute(route, 999), null);
});

test('nextSystemInRoute returns null for an empty route', () => {
  assert.equal(nextSystemInRoute([], 1), null);
});
