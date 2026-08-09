// Every body name in an ED journal is literally `${systemName} ${designator}`
// (e.g. "Col 285 Sector TI-U b18-2 A 6", designator "A 6"). The system name
// is already shown once in the System panel, so repeating it on every single
// in-scene label and in the detail panel header is pure redundancy — this is
// the "name problem" the design brief calls out as the core design issue.
//
// This is a plain prefix strip, not a heuristic: it's guaranteed correct by
// the game's own naming convention. Hand-named systems (Sol -> "Earth",
// "Mars", no shared prefix) simply don't match and fall through unchanged.

/**
 * @param {string} bodyName
 * @param {string} systemName
 * @returns {string} The designator, or the original bodyName unchanged if it doesn't start with the expected system-name prefix.
 */
export function shortDesignator(bodyName, systemName) {
  if (!bodyName || !systemName) return bodyName;
  const prefix = `${systemName} `;
  return bodyName.startsWith(prefix) ? bodyName.slice(prefix.length) : bodyName;
}
