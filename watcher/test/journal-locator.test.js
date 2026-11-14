import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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

test('rotation chooses the highest numeric part, independent of directory order', () => {
  const names = [1, 2, 9, 10].map((part) => `Journal.2025-11-09T081859.${part}.log`);
  assert.equal(newestJournalFilename(names), names[3]);
  assert.equal(newestJournalFilename([...names].reverse()), names[3]);
  assert.equal(newestJournalFilename([...names, 'Journal.2025-11-10T081859.01.log']),
    'Journal.2025-11-10T081859.01.log');
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

for (const platform of ['darwin', 'win32']) {
  test(`defaultJournalDir uses the expected default on ${platform}`, () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    const originalOverride = process.env.ORRERY_JOURNAL_DIR;
    try {
      Object.defineProperty(process, 'platform', { value: platform });
      delete process.env.ORRERY_JOURNAL_DIR;
      const expected = platform === 'darwin'
        ? join(homedir(), 'Library/Application Support/CrossOver/Bottles/Elite Dangerous/drive_c/users/crossover/Saved Games/Frontier Developments/Elite Dangerous')
        : join(homedir(), 'Saved Games/Frontier Developments/Elite Dangerous');
      assert.equal(defaultJournalDir(), expected);

      process.env.ORRERY_JOURNAL_DIR = '';
      assert.equal(defaultJournalDir(), expected);

      process.env.ORRERY_JOURNAL_DIR = '/custom/bottle/Saved Games';
      assert.equal(defaultJournalDir(), '/custom/bottle/Saved Games');
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      if (originalOverride === undefined) delete process.env.ORRERY_JOURNAL_DIR;
      else process.env.ORRERY_JOURNAL_DIR = originalOverride;
    }
  });
}

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
