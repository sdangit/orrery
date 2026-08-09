// A rolling window of *every* recently-seen journal event, regardless of
// type — unlike system-model.js, which only keeps the Scan/context events it
// needs to build the body tree. detectMode() (see mode-detect.js) needs the
// full stream: Bounty, LaunchDrone, ScanOrganic, FSSBodySignals and friends
// never touch the body tree at all, but they're exactly what mode detection
// keys on.

const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // matches detectMode's own default lookback

export function createRecentEventsBuffer({ windowMs = DEFAULT_WINDOW_MS } = {}) {
  let events = [];

  function add(newEvents) {
    events.push(...newEvents);
  }

  /** Trims anything older than the window and returns what's left. */
  function getRecent(now = Date.now()) {
    events = events.filter((evt) => {
      const ts = Date.parse(evt.timestamp);
      return Number.isFinite(ts) && now - ts <= windowMs;
    });
    return events;
  }

  return { add, getRecent };
}
