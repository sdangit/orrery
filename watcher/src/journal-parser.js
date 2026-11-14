import { parseJsonPreservingIntegers } from './json-integers.js';
// Parses Elite Dangerous journal files: newline-delimited JSON, one event per line.
//
// Journals are written incrementally while the game runs, so a live tail can
// catch a line mid-write. We skip lines that fail to parse rather than
// throwing, so a partial trailing line never takes down the whole read.

/**
 * @param {string} text Raw journal file contents (or a chunk of one).
 * @returns {object[]} Parsed event objects, in file order. Unparsable lines are dropped.
 */
export function parseJournalLines(text) {
  const events = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      events.push(parseJsonPreservingIntegers(line));
    } catch {
      // Partial write (common on the live-tailed final line) or corrupt line — skip it.
    }
  }
  return events;
}

/**
 * Filters a parsed event stream down to one or more event names.
 * @param {object[]} events
 * @param {string|string[]} eventNames
 */
export function filterEvents(events, eventNames) {
  const names = Array.isArray(eventNames) ? new Set(eventNames) : new Set([eventNames]);
  return events.filter((evt) => names.has(evt.event));
}

/**
 * Finds the most recent system-identifying event (FSDJump or Location), which
 * carries StarSystem / SystemAddress / StarPos. Used to scope a body tree to
 * "whatever system the player is currently in."
 * @param {object[]} events
 */
export function latestSystemContext(events) {
  let latest = null;
  for (const evt of events) {
    if (evt.event !== 'FSDJump' && evt.event !== 'Location') continue;
    if (!latest || Date.parse(evt.timestamp) >= Date.parse(latest.timestamp)) {
      latest = evt;
    }
  }
  if (!latest) return null;
  return {
    starSystem: latest.StarSystem,
    systemAddress: latest.SystemAddress,
    starPos: latest.StarPos ?? null,
    timestamp: latest.timestamp,
  };
}
