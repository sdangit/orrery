// Simulated-time state for the warp slider (design brief: "real-time plus
// warp slider up to ~100,000x, and a 'now' reset"). Pure, so it's testable
// without a rAF loop: the render loop calls advance() with each frame's real
// elapsed time and reads simTimeMs for position solving.

export const WARP_SLIDER_MAX = 100;

export function createTimeControl(now = Date.now()) {
  return { simTimeMs: now, warp: 1 };
}

/** Advances simulated time by a real elapsed interval, scaled by the current warp. */
export function advance(timeControl, realDtMs) {
  timeControl.simTimeMs += realDtMs * timeControl.warp;
}

/** The "now" reset: snaps simulated time back to the actual present. Warp is left as-is. */
export function resetToNow(timeControl, now = Date.now()) {
  timeControl.simTimeMs = now;
}

/**
 * Log-scale slider mapping: 0..WARP_SLIDER_MAX -> 1x..100,000x, so the
 * interesting low range (1x-100x) gets half the slider's travel instead of
 * being crushed into its first pixel.
 */
export function warpFromSlider(sliderValue) {
  return Math.round(10 ** (sliderValue / (WARP_SLIDER_MAX / 5)));
}

export function formatWarp(warp) {
  return `${warp.toLocaleString()}×`;
}
