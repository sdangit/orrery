// Compresses real orbital distances into display-friendly units.
//
// The handover doc's scale problem, concretely, in this project's own test
// system: moons orbit their planet at ~1e6 m while the two stars sit ~5e12 m
// apart — six-plus orders of magnitude in one system. A linear metres-to-
// pixels mapping makes every inner planet an invisible dot huddled at the
// origin. This compresses per-branch (see below) with a log curve instead:
// order is preserved (a farther body is always drawn farther out), but the
// dynamic range is squashed into something a camera can actually frame.
//
// "Per-branch" is the important part: compression is applied to each body's
// own distance from its *immediate* parent, not its distance from the system
// root. The renderer walks the tree the same way orbit-position.js does —
// summing each level's own (now-compressed) offset — so a moon's tight orbit
// around its planet stays legible regardless of how far that planet's own
// star is from the system barycentre. This is a deliberate lie (see the
// handover doc: "flag it in the UI so it teaches rather than lies") — the UI
// must show a permanent "compressed scale" indicator, and a future "true
// scale" toggle (milestone 7) can switch this out for an identity function.

const DEFAULT_OPTIONS = {
  minDisplay: 2, // smallest nonzero display radius, so tight moon orbits don't collapse into their parent
  scaleMetres: 1e9, // the real distance (~6.7 AU... actually ~1e9 m ~ 0.007 AU) that maps to roughly minDisplay + gain*log10(2)
  gain: 8, // display units added per decade of real distance
};

/**
 * @param {number} realMetres Real distance from the immediate parent, in metres. 0 is valid (a body sitting exactly on its parent, e.g. a belt cluster with no elements).
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @returns {number} Compressed display-unit distance. Monotonically non-decreasing in realMetres.
 */
export function compressDistance(realMetres, options = {}) {
  if (!(realMetres >= 0)) {
    throw new RangeError(`compressDistance expects a non-negative distance, got ${realMetres}`);
  }
  if (realMetres === 0) return 0;
  const { minDisplay, scaleMetres, gain } = { ...DEFAULT_OPTIONS, ...options };
  return minDisplay + gain * Math.log10(1 + realMetres / scaleMetres);
}

const DEFAULT_RADIUS_OPTIONS = {
  minDisplay: 0.4,
  scaleMetres: 2e6,
  gain: 0.9,
};

/**
 * Compresses a body's real radius into a display-unit radius. Unlike
 * compressDistance, this is explicitly *not* trying to be honest — the
 * handover doc calls exaggerating body radii out as a deliberate, expected
 * choice ("real scale is invisible"). Same log-curve shape as
 * compressDistance, tuned separately (radii need to stay visible as spheres,
 * not just as separated points).
 * @param {number} realMetres
 * @param {Partial<typeof DEFAULT_RADIUS_OPTIONS>} [options]
 */
export function compressRadius(realMetres, options = {}) {
  if (!(realMetres >= 0)) {
    throw new RangeError(`compressRadius expects a non-negative radius, got ${realMetres}`);
  }
  if (realMetres === 0) return 0;
  const { minDisplay, scaleMetres, gain } = { ...DEFAULT_RADIUS_OPTIONS, ...options };
  return minDisplay + gain * Math.log10(1 + realMetres / scaleMetres);
}

/**
 * Applies compressDistance to a 3D offset, preserving its direction.
 * @param {{x:number,y:number,z:number}} offset
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 */
export function compressOffset(offset, options = {}) {
  const realMetres = Math.hypot(offset.x, offset.y, offset.z);
  if (realMetres === 0) return { x: 0, y: 0, z: 0 };
  const displayMetres = compressDistance(realMetres, options);
  const scale = displayMetres / realMetres;
  return { x: offset.x * scale, y: offset.y * scale, z: offset.z * scale };
}
