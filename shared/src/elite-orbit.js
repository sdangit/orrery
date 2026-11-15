// Elite journal / community angles are kept raw in the data model. Convert
// them once at the geometry boundary, not independently in each provider.
// Canonn documents the node/periapsis convention:
// https://github.com/canonn-science/canonn-signals/commit/d0f67811f21cbecde743e54ee235f2f73a0b0130
// Inclination also changes sign to match Elite's orbital handedness. This is
// supported by SrvSurvey's implementation and the positive-depth Altair audit:
// docs/research/altair-vertical-parity-results.json. Inherited axial tilts must
// change sign too (orbital-frame.js), making this one system-wide Z reflection.
import { keplerianOffset } from './kepler.js';

/** Standard astronomical elements from Elite's raw orbital-angle convention. */
export function eliteOrbitElements(elements) {
  return {
    ...elements,
    inclinationDeg: -elements.inclinationDeg,
    ascendingNodeDeg: -elements.ascendingNodeDeg,
    periapsisDeg: -elements.periapsisDeg,
  };
}

/** Parent-relative offset for raw Elite elements; phase and epoch are unchanged. */
export function eliteKeplerianOffset(elements, atEpochMs) {
  return keplerianOffset(eliteOrbitElements(elements), atEpochMs);
}
