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
import { readNavRouteFile, nextSystemInRoute } from './nav-route.js';

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
  let lastNextStop = null; // starSystem name of the next hop, or null — tracked to detect a change worth broadcasting

  function buildSnapshot() {
    const snapshot = model.snapshot();
    if (!snapshot) return null;
    // Auto-detection only — a manually pinned mode is a UI-local preference
    // (see the design brief: "auto wins unless the user has pinned a mode"),
    // applied client-side over whatever mode this reports.
    snapshot.mode = detectMode(recentEvents.getRecent());

    // NavRoute.json is a small snapshot file, not part of the append-only
    // journal — cheap enough to just re-read on every poll, same as Status.json's
    // own ~1/sec refresh cadence.
    const navRoute = readNavRouteFile(journalDir);
    snapshot.nextSystem = navRoute ? nextSystemInRoute(navRoute.route, snapshot.systemAddress) : null;

    return snapshot;
  }

  /** Updates lastMode/lastNextStop and reports whether either actually changed since the last poll. */
  function trackDerivedChanges(snapshot) {
    if (!snapshot) return false;
    const nextStop = snapshot.nextSystem?.starSystem ?? null;
    const changed = snapshot.mode !== lastMode || nextStop !== lastNextStop;
    lastMode = snapshot.mode;
    lastNextStop = nextStop;
    return changed;
  }

  function poll() {
    const newestPath = findNewestJournalPath(journalDir);
    if (!newestPath) {
      return { changed: false, snapshot: null, journalPath: null };
    }

    let updated = false;
    function consumeCurrentFile() {
      const read = readNewLines(currentPath, offset, remainder);
      offset = read.newOffset;
      remainder = read.remainder;
      const events = parseJournalLines(read.lines.join('\n'));
      recentEvents.add(events);
      updated = model.applyEvents(events).updated || updated;
    }

    if (newestPath !== currentPath) {
      // Drain the previous part first: its last scans may have been appended
      // between our last poll and creation of the new journal.
      if (currentPath) {
        try { consumeCurrentFile(); } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      // A new session file appeared (game launch, or a relog). Start tailing
      // it from the beginning — the system model itself decides whether this
      // represents an actual system switch (a relog usually reopens in the
      // same system, which the model's own SystemAddress check handles).
      currentPath = newestPath;
      offset = 0;
      remainder = '';
    }

    consumeCurrentFile();

    const snapshot = buildSnapshot();
    const derivedChanged = trackDerivedChanges(snapshot);
    return { changed: updated || derivedChanged, snapshot, journalPath: currentPath };
  }

  return { poll, model };
}
