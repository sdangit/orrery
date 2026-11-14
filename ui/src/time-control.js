// One shared clock for every body. Orbit playback scales that clock from a
// deliberately chosen reference period, independent of selection and camera.
export const REFERENCE_ORBIT_SECONDS = 30;
export const DATE_LIMIT_MS = 8.64e15;
export const ED_YEAR_OFFSET = 1286;

export function createTimeControl(now = Date.now()) {
  return { simTimeMs: now, reference: null, multiplier: 1, direction: 1, paused: false, live: true };
}

export function orbitalPeriod(node) {
  const period = node?.elements?.orbitalPeriodSec;
  return Number.isFinite(period) && period !== 0 ? Math.abs(period) : null;
}

/** Snapshot the reference: later scans and selections must not change the rate. */
export function useTimeReference(tc, node) {
  const periodSec = orbitalPeriod(node);
  if (periodSec === null) return false;
  tc.reference = { id: node.id, name: node.name ?? `Body ${node.id}`, periodSec };
  tc.multiplier = 1;
  tc.direction = 1;
  tc.paused = false;
  tc.live = false;
  return true;
}

export function playbackRate(tc) {
  if (tc.paused) return 0;
  return (tc.reference ? tc.reference.periodSec / REFERENCE_ORBIT_SECONDS : 1)
    * tc.multiplier * tc.direction;
}

export function changePlaybackSpeed(tc, factor) {
  const multiplier = tc.multiplier * factor;
  const rate = (tc.reference ? tc.reference.periodSec / REFERENCE_ORBIT_SECONDS : 1) * multiplier;
  if (!Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(rate) || rate <= 0) return;
  tc.multiplier = multiplier;
  tc.live = false;
}

export function togglePause(tc) {
  tc.paused = !tc.paused;
  tc.live = false;
}

export function reverseTime(tc) {
  tc.direction *= -1;
  tc.live = false;
}

/** Live mode tracks wall time, including after sleep; playback uses elapsed time. */
export function advance(tc, realDtMs, now = tc.simTimeMs + realDtMs) {
  if (!Number.isFinite(realDtMs) || realDtMs < 0) return;
  if (tc.live) {
    tc.simTimeMs = now;
    return;
  }
  const next = tc.simTimeMs + realDtMs * playbackRate(tc);
  tc.simTimeMs = Math.max(-DATE_LIMIT_MS, Math.min(DATE_LIMIT_MS, next));
  if (Math.abs(next) >= DATE_LIMIT_MS) tc.paused = true;
}

/** Reset the clock, reference, direction, speed, and pause state together. */
export function resetToNow(tc, now = Date.now()) {
  Object.assign(tc, createTimeControl(now));
}

/** ED uses the UTC calendar with a +1286 year label, not a fixed day offset.
 * Format the fields directly so leap days aren't rolled over by setUTCFullYear.
 * Never feed this display conversion back into the orbital solver.
 */
export function formatEdDateTime(epochMs) {
  const date = new Date(epochMs);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getUTCFullYear() + ED_YEAR_OFFSET;
  const yearText = year < 0 ? `−${String(-year).padStart(4, '0')}` : String(year).padStart(4, '0');
  return `${yearText}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function formatNumber(value) {
  return value.toLocaleString(undefined, {
    maximumSignificantDigits: 4,
    notation: value >= 1e6 || value < 0.001 ? 'scientific' : 'standard',
  });
}

export function playbackDescription(tc) {
  if (tc.reference) return `1 reference orbit / ${formatNumber(REFERENCE_ORBIT_SECONDS / tc.multiplier)} real seconds`;
  return `${formatNumber(tc.multiplier)} simulated ${tc.multiplier === 1 ? 'second' : 'seconds'} / real second`;
}

export function formatPlaybackSpeed(tc) {
  return `${formatNumber(tc.multiplier)}×`;
}
