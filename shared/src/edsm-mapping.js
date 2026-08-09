// EDSM's `subType`/`terraformingState` strings look like the journal's
// PlanetClass/TerraformState enums but are NOT the same wording — this
// project's color coding and spotlight classification do exact string
// matches against journal wording, so a naive passthrough would silently
// misclassify backfilled bodies (e.g. failing to highlight a genuine
// Earthlike world just because the label reads differently).
//
// Verified against a real EDSM API response (Sol — see TECHNICAL.md): "Earth-like world" -> "Earthlike body", "Metal-rich body"
// -> "Metal rich body", "High metal content world" -> "High metal content
// body", "Rocky Ice world" -> "Rocky ice body", "Class I gas giant" ->
// "Sudarsky class I gas giant" (EDSM drops "Sudarsky"), "Rocky body" and
// "Icy body" happen to already match. Classes II-V gas giants are inferred
// from the same "EDSM drops Sudarsky" pattern confirmed for class I, not
// individually observed. "Water world"/"Ammonia world" are taken from
// EDSM's own public statistics page wording (matches the journal already)
// rather than a directly-observed API response — worth a second check if a
// backfilled water/ammonia world doesn't highlight correctly in practice.
const EDSM_SUBTYPE_TO_PLANET_CLASS = {
  'Earth-like world': 'Earthlike body',
  'Metal-rich body': 'Metal rich body',
  'High metal content world': 'High metal content body',
  'Rocky body': 'Rocky body',
  'Icy body': 'Icy body',
  'Rocky Ice world': 'Rocky ice body',
  'Water world': 'Water world',
  'Ammonia world': 'Ammonia world',
  'Water giant': 'Water giant',
  'Class I gas giant': 'Sudarsky class I gas giant',
  'Class II gas giant': 'Sudarsky class II gas giant',
  'Class III gas giant': 'Sudarsky class III gas giant',
  'Class IV gas giant': 'Sudarsky class IV gas giant',
  'Class V gas giant': 'Sudarsky class V gas giant',
};

/**
 * @param {string} [edsmSubType]
 * @returns {string|undefined} The journal-equivalent PlanetClass, or undefined if unmapped (falls back to the default/unhighlighted rendering rather than guessing).
 */
export function mapEdsmPlanetClass(edsmSubType) {
  return EDSM_SUBTYPE_TO_PLANET_CLASS[edsmSubType];
}

/**
 * EDSM's terraformingState is a free-text-ish string ("Not terraformable",
 * "Terraformable", ...); the journal's TerraformState is "" when not
 * terraformable and a non-empty string otherwise (spotlight.js checks for
 * non-empty). Confirmed "Not terraformable" from the real Sol/Earth response.
 * @param {string} [terraformingState]
 * @returns {string}
 */
export function mapEdsmTerraformState(terraformingState) {
  if (!terraformingState || terraformingState === 'Not terraformable') return '';
  return terraformingState;
}
