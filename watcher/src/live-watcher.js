// Ties the journal locator, incremental tailer, system model, and mode
// detector together into a single poll() step: find the newest journal
// file, read whatever's new since last time, feed it to the system model
// and the recent-events buffer, report whether anything changed. Kept as a
// plain "call poll() on a timer" shape (see scripts/watch.js) rather than
// owning its own interval/WebSocket, so the polling logic itself stays
// unit-testable without spinning up real timers or a real network server.

import { findNewestJournalPath } from './journal-locator.js';
import { readNewLines } from './journal-tailer.js';
import { parseJournalLines } from './journal-parser.js';
import { createSystemModel } from './system-model.js';
import { createRecentEventsBuffer } from './recent-events.js';
import { detectMode } from './mode-detect.js';

/**
 * @param {string} journalDir
 * @returns {{ poll: () => { changed: boolean, snapshot: object|null, journalPath: string|null }, model: ReturnType<typeof createSystemModel> }}
 */
export function createLiveWatcher(journalDir) {
  const model = createSystemModel();
  const recentEvents = createRecentEventsBuffer();
  let currentPath = null;
  let offset = 0;
  let remainder = '';
  let lastMode = null;

  function snapshotWithMode() {
    const snapshot = model.snapshot();
    if (!snapshot) return null;
    // Auto-detection only — a manually pinned mode is a UI-local preference
    // (see the handover doc: "auto wins unless the user has pinned a mode"),
    // applied client-side over whatever mode this reports.
    snapshot.mode = detectMode(recentEvents.getRecent());
    return snapshot;
  }

  function poll() {
    const newestPath = findNewestJournalPath(journalDir);
    if (!newestPath) {
      return { changed: false, snapshot: null, journalPath: null };
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
      const snapshot = snapshotWithMode();
      const modeChanged = snapshot !== null && snapshot.mode !== lastMode;
      if (modeChanged) lastMode = snapshot.mode;
      return { changed: modeChanged, snapshot, journalPath: currentPath };
    }

    const events = parseJournalLines(read.lines.join('\n'));
    recentEvents.add(events);
    const { updated } = model.applyEvents(events);

    const snapshot = snapshotWithMode();
    const modeChanged = snapshot !== null && snapshot.mode !== lastMode;
    if (snapshot) lastMode = snapshot.mode;
    return { changed: updated || modeChanged, snapshot, journalPath: currentPath };
  }

  return { poll, model };
}
