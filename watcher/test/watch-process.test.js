// End-to-end check of the actual runnable process (scripts/watch.js): spawns
// it for real against a synthetic (not the real Saved Games) journal
// directory, connects a real WebSocket client, and confirms a snapshot
// arrives and updates as the journal grows. Everything else in this package
// is a pure-function unit test — this is the one piece of glue (WebSocketServer
// + setInterval + env var wiring) with no other coverage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WATCH_SCRIPT = join(__dirname, '..', 'scripts', 'watch.js');
const TEST_PORT = 47922; // distinct from the default 47821, so a real dev watcher running alongside doesn't collide
const POLL_INTERVAL_MS = 150;

function line(obj) {
  return `${JSON.stringify(obj)}\n`;
}

function fsdJump(systemName, systemAddress) {
  return { event: 'FSDJump', timestamp: '2026-01-01T00:00:00Z', StarSystem: systemName, SystemAddress: systemAddress, StarPos: [0, 0, 0] };
}

function scan(bodyId, systemAddress) {
  return {
    event: 'Scan', timestamp: '2026-01-01T00:00:01Z', BodyID: bodyId, BodyName: `Test ${bodyId}`, SystemAddress: systemAddress,
    StarType: 'G', Parents: [{ Null: 0 }],
    SemiMajorAxis: 1e9, Eccentricity: 0, OrbitalInclination: 0, Periapsis: 0, AscendingNode: 0, MeanAnomaly: 0, OrbitalPeriod: 100000,
  };
}

function waitForMessage(socket, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a WebSocket message')), timeoutMs);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

test('the watch process serves a live snapshot over WebSocket and updates it as the journal grows', async () => {
  const journalDir = mkdtempSync(join(tmpdir(), 'orrery-watch-e2e-'));
  const journalPath = join(journalDir, 'Journal.2026-01-01T000000.01.log');
  writeFileSync(journalPath, line(fsdJump('Sol', 1)) + line(scan(1, 1)));

  const child = spawn(process.execPath, [WATCH_SCRIPT], {
    env: {
      ...process.env,
      ORRERY_JOURNAL_DIR: journalDir,
      ORRERY_WS_PORT: String(TEST_PORT),
      ORRERY_POLL_INTERVAL_MS: String(POLL_INTERVAL_MS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrOutput = '';
  child.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });

  try {
    // Give the process a moment to bind its WebSocket server before connecting.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    const first = await waitForMessage(socket);
    assert.equal(first.type, 'snapshot');
    assert.equal(first.snapshot.systemName, 'Sol');
    assert.ok(first.snapshot.nodes.some((n) => n.id === 1));

    // Append a new body and confirm the next poll picks it up and broadcasts.
    appendFileSync(journalPath, line(scan(2, 1)));
    const second = await waitForMessage(socket, 5000);
    assert.equal(second.type, 'snapshot');
    assert.ok(second.snapshot.nodes.some((n) => n.id === 2), 'expected the newly-scanned body in the updated snapshot');

    socket.close();
  } finally {
    child.kill();
    rmSync(journalDir, { recursive: true, force: true });
    if (stderrOutput) console.log('watch.js stderr:', stderrOutput);
  }
});
