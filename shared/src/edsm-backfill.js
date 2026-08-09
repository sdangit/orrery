// Merges EDSM's system-bodies API response into a body tree, producing
// "backfill" nodes for anything EDSM knows about that the player hasn't
// personally scanned yet — the handover doc's "dimmer/wireframe = known,
// not yours yet" idea. Real Scan data always wins: this never overwrites an
// existing node.
//
// EDSM's bodyId numbering matches the journal's own BodyID space directly
// (confirmed: EDSM gives Sol's star bodyId:0, exactly like a real single-star
// system's journal Scan — see body-tree.js's handling of that same case),
// which is what makes a straightforward merge-by-id possible at all.
//
// Position honesty: EDSM does not provide MeanAnomaly or AscendingNode (this
// project's Kepler math needs both for a true live position) — confirmed by
// inspecting a real response, the fields simply aren't there. A backfilled
// body's displayed position uses ascendingNode=0 and meanAnomaly=0 (placed at
// periapsis) as a fixed, explicitly-not-live convention; the UI must label
// backfill bodies as approximate, not pretend this is where they actually are
// right now. Real Scan data, once obtained, replaces this immediately.

import { mapEdsmPlanetClass, mapEdsmTerraformState } from './edsm-mapping.js';

const AU_IN_METRES = 1.495978707e11;
const DAY_IN_SECONDS = 86400;
const KM_IN_METRES = 1000;

function resolveEdsmParentId(edsmBody) {
  const parents = edsmBody.parents;
  if (!Array.isArray(parents) || parents.length === 0) return null; // the system's root star (EDSM's parents:null)
  const [firstEntry] = parents;
  const [, id] = Object.entries(firstEntry)[0];
  return id;
}

function buildBackfillElements(edsmBody) {
  // Both are required for a sensible orbit — meanAnomalyAt() divides by the
  // period, and a body EDSM has no semiMajorAxis for (the root star, or
  // sparse data) can't be placed relative to anything anyway.
  if (!(edsmBody.semiMajorAxis > 0) || !(edsmBody.orbitalPeriod > 0)) return null;
  return {
    semiMajorAxis: edsmBody.semiMajorAxis * AU_IN_METRES,
    eccentricity: edsmBody.orbitalEccentricity ?? 0,
    inclinationDeg: edsmBody.orbitalInclination ?? 0,
    periapsisDeg: edsmBody.argOfPeriapsis ?? 0,
    ascendingNodeDeg: 0, // unknown — EDSM doesn't report it
    meanAnomalyDeg: 0, // unknown — placed at periapsis, not a live phase
    orbitalPeriodSec: edsmBody.orbitalPeriod * DAY_IN_SECONDS,
    epochMs: Date.now(),
  };
}

function buildBackfillRaw(edsmBody) {
  const raw = {
    WasDiscovered: true, // known to EDSM/the community — never flagged as a first-discovery
    // WasMapped deliberately left unset: we don't know, and must not claim "false" (would falsely spotlight it as a first-mapping opportunity).
  };

  if (edsmBody.type === 'Star' && typeof edsmBody.subType === 'string') {
    // EDSM's star subType is descriptive text ("G (White-Yellow) Star"); the
    // journal's StarType is just the leading spectral-class letter ("G").
    // Verified against one real example (Sol) — low risk, but not exhaustively checked.
    raw.StarType = edsmBody.subType.split(' ')[0];
  }
  if (edsmBody.type === 'Planet') {
    const planetClass = mapEdsmPlanetClass(edsmBody.subType);
    if (planetClass) raw.PlanetClass = planetClass;
    raw.TerraformState = mapEdsmTerraformState(edsmBody.terraformingState);
  }

  if (typeof edsmBody.radius === 'number') raw.Radius = edsmBody.radius * KM_IN_METRES;
  if (typeof edsmBody.gravity === 'number') raw.SurfaceGravity = edsmBody.gravity;
  if (typeof edsmBody.surfaceTemperature === 'number') raw.SurfaceTemperature = edsmBody.surfaceTemperature;
  if (typeof edsmBody.earthMasses === 'number') raw.MassEM = edsmBody.earthMasses;
  if (typeof edsmBody.solarMasses === 'number') raw.StellarMass = edsmBody.solarMasses;
  if (typeof edsmBody.distanceToArrival === 'number') raw.DistanceFromArrivalLS = edsmBody.distanceToArrival;

  return raw;
}

/**
 * @param {Map<number, object>} existingNodes The real (scanned) body tree.
 * @param {object[]} edsmBodies The `bodies` array from EDSM's api-system-v1/bodies response.
 * @returns {Map<number, object>} A new Map: existingNodes plus a backfill node (marked `isBackfill: true`) for every EDSM body not already known.
 */
export function buildBackfillNodes(existingNodes, edsmBodies) {
  const merged = new Map(existingNodes);

  for (const edsmBody of edsmBodies) {
    if (merged.has(edsmBody.bodyId)) continue; // real Scan data always wins
    const kind = edsmBody.type === 'Star' ? 'Star' : edsmBody.type === 'Planet' ? 'Planet' : null;
    if (!kind) continue; // belts/unknown EDSM types — not rendered anyway (see scene-builder.js's RENDERABLE_KINDS)

    merged.set(edsmBody.bodyId, {
      id: edsmBody.bodyId,
      name: edsmBody.name,
      kind,
      parentId: resolveEdsmParentId(edsmBody),
      elements: buildBackfillElements(edsmBody),
      wasDiscovered: true,
      wasMapped: null,
      landable: edsmBody.isLandable ?? null,
      raw: buildBackfillRaw(edsmBody),
      isBackfill: true,
      isMoon: false,
      children: [],
    });
  }

  return merged;
}
