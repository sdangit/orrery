// Finds the Elite Dangerous journal directory and the newest journal file in
// it. ED starts a new Journal.<timestamp>.<part>.log file every session (game
// launch, or sometimes mid-session on relog), so "the current journal" is a
// moving target the watcher has to keep rechecking, not a fixed path.

import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JOURNAL_FILENAME_RE = /^Journal\.(\d{4}-\d{2}-\d{2}T\d{6})\.\d+\.log$/;

/**
 * The default journal directory (Windows-only — ED journals don't exist on
 * other platforms). Overridable via ORRERY_JOURNAL_DIR, mainly so tests and
 * local development don't have to touch the real Saved Games folder.
 */
export function defaultJournalDir() {
  return process.env.ORRERY_JOURNAL_DIR || join(homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
}

/**
 * Picks the newest Journal.*.log filename by the timestamp embedded in the
 * filename itself, not file mtime (mtime can lag or get clobbered by backup
 * tools, sync clients, etc. — the filename's timestamp is what the game
 * actually means by "newest").
 * @param {string[]} filenames
 * @returns {string|null}
 */
export function newestJournalFilename(filenames) {
  let bestName = null;
  let bestTimestamp = null;
  for (const name of filenames) {
    const match = JOURNAL_FILENAME_RE.exec(name);
    if (!match) continue;
    const [, timestamp] = match;
    if (bestTimestamp === null || timestamp > bestTimestamp) {
      bestTimestamp = timestamp;
      bestName = name;
    }
  }
  return bestName;
}

/**
 * @param {string} dir
 * @returns {string|null} Absolute path to the newest journal file, or null if the directory has none.
 */
export function findNewestJournalPath(dir) {
  const filename = newestJournalFilename(readdirSync(dir));
  return filename ? join(dir, filename) : null;
}
