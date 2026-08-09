// Per-body visual emphasis for the *currently active* activity mode — unlike
// spotlight.js (first-discovery/high-value), which is always on regardless
// of mode, this only lights up when its own mode is active. Deliberately
// built only from fields the journal hands us directly (ReserveLevel,
// RingClass are literal enum strings FDev writes into the Scan event) —
// no computed/predicted values, per the decision to skip anything that
// needs an unverifiable formula or lookup table (see the design brief).
//
// Reserve level ordering (Pristine > Major > Common > Low > Depleted) is
// the game's own terminology, not a rebalance-prone constant — safe to
// hardcode, unlike a credit-value formula. The journal's actual enum values
// carry a "Resources" suffix (confirmed against a real Scan event in the
// project's test fixture: "ReserveLevel":"PristineResources") rather than
// the bare names players use colloquially.

const GOOD_RESERVE_LEVELS = new Set(['PristineResources', 'MajorResources']);

/** Strips the journal's "Resources" suffix for display/reason-tag purposes: "PristineResources" -> "Pristine". */
export function reserveLevelLabel(reserveLevel) {
  return reserveLevel?.replace(/Resources$/, '') ?? reserveLevel;
}

/**
 * @param {{raw?: object, bio?: object}} node A body-tree node.
 * @param {string} mode One of the MODES from mode-detect.js.
 * @returns {{highlighted: boolean, reasons: string[]}}
 */
export function classifyModeHighlight(node, mode) {
  if (mode === 'mining') return classifyMining(node);
  if (mode === 'exobiology') return classifyExobiology(node);
  return { highlighted: false, reasons: [] };
}

function classifyMining(node) {
  const rings = node.raw?.Rings;
  if (!Array.isArray(rings) || rings.length === 0) {
    return { highlighted: false, reasons: [] };
  }
  const reserveLevel = node.raw?.ReserveLevel;
  const reasons = ['ringed'];
  if (GOOD_RESERVE_LEVELS.has(reserveLevel)) reasons.push('good-reserve');
  if (reserveLevel) reasons.push(`reserve-${reserveLevelLabel(reserveLevel).toLowerCase()}`);
  return { highlighted: true, reasons };
}

/**
 * Exobiology highlighting, built entirely from real counts/booleans the
 * journal already reports (bio-signals.js) — no genus prediction before the
 * game itself confirms one, no credit value, per the decision to skip
 * anything needing an unverifiable table (see the design brief).
 */
function classifyExobiology(node) {
  const bio = node.bio;
  if (!bio || !(bio.signalCount > 0)) {
    return { highlighted: false, reasons: [] };
  }
  const reasons = ['has-bio-signals'];
  if (bio.genuses.length > 0) reasons.push('genus-known');
  if (bio.samples.length > 0) {
    reasons.push(bio.samples.every((s) => s.complete) ? 'fully-sampled' : 'sampling-in-progress');
  }
  return { highlighted: true, reasons };
}
