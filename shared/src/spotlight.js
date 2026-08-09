// Classifies a body node for the "loudest treatment, in every mode, always"
// rule from the design brief: first discoveries/first mappings, and the
// small set of scientifically/financially valuable world types, never get
// filtered out regardless of which activity mode is active. This is a
// baseline classification the renderer applies on top of whatever the
// current activity mode highlights — not itself a mode.
//
// Deliberately conservative about which fields count:
// - WasDiscovered is meaningful for any scanned body (stars, planets, belt
//   clusters all carry it in real journals).
// - WasMapped is only meaningful for planets — every body type gets a
//   WasMapped field in the journal, but you can't actually SAA-scan a star or
//   a belt cluster, so flagging those would just make everything glow.

const HIGH_VALUE_PLANET_CLASSES = new Set(['Earthlike body', 'Water world', 'Ammonia world']);

/**
 * @param {{kind: string, raw?: object}} node A body-tree node (see watcher/src/body-tree.js).
 * @returns {{spotlighted: boolean, reasons: string[]}} reasons is a stable, machine-readable list (e.g. "first-discovery"); empty when spotlighted is false.
 */
export function classifySpotlight(node) {
  const raw = node.raw ?? {};
  const reasons = [];

  if (raw.WasDiscovered === false) {
    reasons.push('first-discovery');
  }
  if (node.kind === 'Planet' && raw.WasMapped === false) {
    reasons.push('first-mapping');
  }
  if (HIGH_VALUE_PLANET_CLASSES.has(raw.PlanetClass)) {
    reasons.push('high-value-world');
  }
  if (typeof raw.TerraformState === 'string' && raw.TerraformState.length > 0) {
    reasons.push('terraformable');
  }

  return { spotlighted: reasons.length > 0, reasons };
}
