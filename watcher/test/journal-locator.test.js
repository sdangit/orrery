import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newestJournalFilename, findNewestJournalPath, defaultJournalDir } from '../src/journal-locator.js';

test('newestJournalFilename picks the lexicographically-latest timestamp among matching filenames', () => {
  const names = [
    'Journal.2025-11-09T081859.01.log',
    'Journal.2025-11-14T181819.01.log',
    'Journal.2025-11-10T103426.01.log',
  ];
  assert.equal(newestJournalFilename(names), 'Journal.2025-11-14T181819.01.log');
});

test('newestJournalFilename ignores non-journal files (Status.json, Cargo.json, ShipLocker.json, etc.)', () => {
  const names = ['Status.json', 'Cargo.json', 'Backpack.json', 'Journal.2025-11-09T081859.01.log'];
  assert.equal(newestJournalFilename(names), 'Journal.2025-11-09T081859.01.log');
});

test('newestJournalFilename returns null when there are no journal files', () => {
  assert.equal(newestJournalFilename(['Status.json', 'notes.txt']), null);
});

test('newestJournalFilename handles same-day, different-part-number files correctly', () => {
  // Same timestamp prefix (game briefly failed to write, retried) with different trailing part numbers.
  const names = ['Journal.2025-11-09T081859.01.log', 'Journal.2025-11-09T081859.02.log'];
  // Both share the same embedded timestamp — either is an acceptable pick since
  // the part number isn't part of what we sort on; just confirm it doesn't throw
  // and returns one of them.
  assert.ok(names.includes(newestJournalFilename(names)));
});

test('findNewestJournalPath finds the newest journal in a real directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orrery-journal-locator-'));
  try {
    writeFileSync(join(dir, 'Journal.2025-11-09T081859.01.log'), '');
    writeFileSync(join(dir, 'Journal.2025-11-14T181819.01.log'), '');
    writeFileSync(join(dir, 'Status.json'), '{}');
    assert.equal(findNewestJournalPath(dir), join(dir, 'Journal.2025-11-14T181819.01.log'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findNewestJournalPath returns null for a directory with no journals', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orrery-journal-locator-empty-'));
  try {
    assert.equal(findNewestJournalPath(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('defaultJournalDir respects the ORRERY_JOURNAL_DIR override', () => {
  const original = process.env.ORRERY_JOURNAL_DIR;
  try {
    process.env.ORRERY_JOURNAL_DIR = '/custom/path';
    assert.equal(defaultJournalDir(), '/custom/path');
  } finally {
    if (original === undefined) delete process.env.ORRERY_JOURNAL_DIR;
    else process.env.ORRERY_JOURNAL_DIR = original;
  }
});
