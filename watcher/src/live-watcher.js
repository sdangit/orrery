// Ties the journal locator, incremental tailer, and system model together
// into a single poll() step: find the newest journal file, read whatever's
// new since last time, feed it to the system model, report whether anything
// changed. Kept as a plain "call poll() on a timer" shape (see
// scripts/watch.js) rather than owning its own interval/WebSocket, so the
// polling logic itself stays unit-testable without spinning up real timers
// or a real network server.

import { findNewestJournalPath } from './journal-locator.js';
import { readNewLines } from './journal-tailer.js';
import { parseJournalLines } from './journal-parser.js';
import { createSystemModel } from './system-model.js';

/**
 * @param {string} journalDir
 * @returns {{ poll: () => { changed: boolean, snapshot: object|null, journalPath: string|null }, model: ReturnType<typeof createSystemModel> }}
 */
export function createLiveWatcher(journalDir) {
  const model = createSystemModel();
  let currentPath = null;
  let offset = 0;
  let remainder = '';

  function poll() {
    const newestPath = findNewestJournalPath(journalDir);
    if (!newestPath) {
      return { changed: false, snapshot: model.snapshot(), journalPath: null };
    }

    if (newestPath !== currentPath) {
      // A new session file appeared (game launch, or a relog). Start tailing
      // it from the beginning — the system model itself decides whether this
      // represents an actual system switch (a relog usually reopens in the
      // same system, which the model's own SystemAddress check handles).
      currentPath = newestPath;
      offset = 0;
      remainder = '';
    }

    const read = readNewLines(currentPath, offset, remainder);
    offset = read.newOffset;
    remainder = read.remainder;

    if (read.lines.length === 0) {
      return { changed: false, snapshot: model.snapshot(), journalPath: currentPath };
    }

    const events = parseJournalLines(read.lines.join('\n'));
    const { updated } = model.applyEvents(events);
    return { changed: updated, snapshot: model.snapshot(), journalPath: currentPath };
  }

  return { poll, model };
}
