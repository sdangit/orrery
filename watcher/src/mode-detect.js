// Pure function over recent journal events -> activity mode, per the
// design brief's mode table. "Pure" matters: it's unit-tested with recorded
// event sequences and has no knowledge of file I/O, websockets, or time.
//
// Recency-weighted scoring: each matching event contributes a weight that
// decays linearly to 0 at the edge of the lookback window, so a burst of
// mining events five seconds ago outweighs a single exploration scan from
// nine minutes ago. Auto-detection always loses to an explicit pin.

export const MODES = ['exploration', 'exobiology', 'mining', 'piracy'];

const TRIGGER_EVENTS = {
  exploration: ['FSSDiscoveryScan', 'Scan'],
  exobiology: ['ScanOrganic', 'FSSBodySignals'],
  mining: ['LaunchDrone', 'MiningRefined'],
  piracy: ['Bounty', 'ShipTargeted', 'UnderAttack'],
};

const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // "last N minutes" per the design brief

function eventTimestampMs(evt) {
  return typeof evt.timestamp === 'number' ? evt.timestamp : Date.parse(evt.timestamp);
}

/**
 * @param {object[]} recentEvents Parsed journal events, any order.
 * @param {object} [options]
 * @param {number} [options.now] Epoch ms to score against; defaults to Date.now().
 * @param {number} [options.windowMs] Lookback window; events older than this score 0.
 * @param {string|null} [options.pinnedMode] If set, wins outright (manual mode picker).
 * @param {{cargoScoopDeployed?: boolean}} [options.statusFlags] Status.json flags that nudge scoring (mining's cargo-scoop signal).
 * @returns {string} One of MODES.
 */
export function detectMode(recentEvents, options = {}) {
  const {
    now = Date.now(),
    windowMs = DEFAULT_WINDOW_MS,
    pinnedMode = null,
    statusFlags = {},
  } = options;

  if (pinnedMode) {
    if (!MODES.includes(pinnedMode)) {
      throw new Error(`Unknown pinned mode "${pinnedMode}"`);
    }
    return pinnedMode;
  }

  const scores = Object.fromEntries(MODES.map((mode) => [mode, 0]));

  for (const evt of recentEvents) {
    const ts = eventTimestampMs(evt);
    if (!Number.isFinite(ts)) continue;
    const age = now - ts;
    if (age < 0 || age > windowMs) continue;
    const weight = 1 - age / windowMs;

    for (const mode of MODES) {
      if (TRIGGER_EVENTS[mode].includes(evt.event)) {
        scores[mode] += weight;
      }
    }
  }

  if (statusFlags.cargoScoopDeployed) {
    scores.mining += 0.5;
  }

  let best = 'exploration';
  let bestScore = 0;
  for (const mode of MODES) {
    if (scores[mode] > bestScore) {
      best = mode;
      bestScore = scores[mode];
    }
  }
  return best;
}
