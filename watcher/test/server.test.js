// Covers the two failure-handling hooks server.js adds specifically for the
// Electron shell: a packaged GUI app has no visible console, so a startup
// failure that isn't caught and surfaced (dialog.showErrorBox, in
// electron/main.js) is a silent fail from the user's point of view — the
// process just exits and nothing appears to happen. onReady/onError let the
// caller find out what actually happened instead of guessing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWatcherServer } from '../src/server.js';

test('onReady fires once the server is actually listening', async () => {
  const journalDir = mkdtempSync(join(tmpdir(), 'orrery-server-test-'));
  const port = 47930;
  let server;
  try {
    await new Promise((resolveReady) => {
      server = startWatcherServer({
        port,
        journalDir,
        distDir: join(journalDir, 'nonexistent-dist'),
        pollIntervalMs: 60000,
        log: () => {},
        logError: () => {},
        onReady: resolveReady,
      });
    });
    assert.equal(server.port, port);
  } finally {
    server?.close();
    rmSync(journalDir, { recursive: true, force: true });
  }
});

test('onError fires (instead of crashing the process) when the port is already taken', async () => {
  const journalDir = mkdtempSync(join(tmpdir(), 'orrery-server-test-'));
  const port = 47931;
  let first;
  let second;
  try {
    await new Promise((resolveReady) => {
      first = startWatcherServer({
        port,
        journalDir,
        distDir: join(journalDir, 'nonexistent-dist'),
        pollIntervalMs: 60000,
        log: () => {},
        logError: () => {},
        onReady: resolveReady,
      });
    });

    const err = await new Promise((resolveError) => {
      second = startWatcherServer({
        port,
        journalDir,
        distDir: join(journalDir, 'nonexistent-dist'),
        pollIntervalMs: 60000,
        log: () => {},
        logError: () => {},
        onError: resolveError,
      });
    });

    assert.match(err.message, /EADDRINUSE|address already in use/i);
  } finally {
    first?.close();
    second?.close();
    rmSync(journalDir, { recursive: true, force: true });
  }
});
