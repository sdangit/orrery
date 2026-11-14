// Finds the Elite Dangerous journal directory and the newest journal file in
// it. ED starts a new Journal.<timestamp>.<part>.log file every session (game
// launch, or sometimes mid-session on relog), so "the current journal" is a
// moving target the watcher has to keep rechecking, not a fixed path.

import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JOURNAL_FILENAME_RE = /^Journal\.(\d{4}-\d{2}-\d{2}T\d{6})\.(\d+)\.log$/;

/**
 * The default journal directory: the Elite Dangerous CrossOver bottle on
 * macOS, or the user's Saved Games folder elsewhere. ORRERY_JOURNAL_DIR
 * overrides either default, including for custom bottle names and locations.
 */
export function defaultJournalDir() {
  if (process.env.ORRERY_JOURNAL_DIR) return process.env.ORRERY_JOURNAL_DIR;

  const userDir = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'CrossOver', 'Bottles',
      'Elite Dangerous', 'drive_c', 'users', 'crossover')
    : homedir();
  return join(userDir, 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
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
  let bestPart = -1n;
  for (const name of filenames) {
    const match = JOURNAL_FILENAME_RE.exec(name);
    if (!match) continue;
    const [, timestamp, partText] = match;
    const part = BigInt(partText);
    if (bestTimestamp === null || timestamp > bestTimestamp
        || (timestamp === bestTimestamp && part > bestPart)) {
      bestTimestamp = timestamp;
      bestPart = part;
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
