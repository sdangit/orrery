// Builds a body tree for one star system from Scan / ScanBaryCentre journal
// events. This is the "goldmine" parsing step described in the handover doc:
// resolve each body's Parents chain into a real tree, keyed by BodyID, rooted
// at the implicit system barycentre (BodyID 0 / Parents entry {"Null":0}).
//
// Two quirks the real data forces us to handle:
//
// 1. Rings aren't independently-scanned bodies. A belt cluster's Parents chain
//    names a synthetic "Ring" id that never gets its own Scan/ScanBaryCentre
//    event — e.g. [{"Ring":3},{"Star":1},{"Null":0}]. We collapse Ring entries
//    out of every chain, so a belt cluster's resolved parent is the star or
//    planet that actually owns the ring.
//
// 2. ScanBaryCentre events (binary/co-orbiting pairs) carry orbital elements
//    for a barycentre BodyID but no Parents array of their own. We recover a
//    barycentre's parent by finding it referenced inside some *other* body's
//    Parents chain (e.g. a moon's chain [{"Null":63},{"Planet":62},...] tells
//    us barycentre 63 orbits planet 62) and reading the next entry along.

import { extractBioData } from './bio-signals.js';

const ROOT_ID = 0;

/**
 * @param {Array<{type:string,id:number}>} chain Parents array already normalized via normalizeParents().
 * @returns {Array<{type:string,id:number}>} Same chain with Ring entries removed.
 */
function dropRingEntries(chain) {
  return chain.filter((entry) => entry.type !== 'Ring');
}

/** Converts a raw journal Parents array (`[{"Star":1},{"Null":0}]`) into `[{type,id}]`. */
function normalizeParents(parents) {
  return (parents ?? []).map((entry) => {
    const [type] = Object.keys(entry);
    return { type, id: entry[type] };
  });
}

/**
 * Derives parent-of links for every body id that appears in any Scan event's
 * Parents chain — including barycentre ids, which never get a chain of their
 * own. Ring ids are collapsed out first (see module docs).
 * @param {object[]} scanEvents Scan events (must include `Parents`).
 * @returns {Map<number, number>} bodyId -> parentId
 */
export function resolveParentLinks(scanEvents) {
  const links = new Map();
  for (const evt of scanEvents) {
    // Parents lists the body's *ancestors*, not the body itself — prepend its
    // own id so the loop below also captures the body -> immediate-parent hop.
    const chain = [{ type: 'Self', id: evt.BodyID }, ...dropRingEntries(normalizeParents(evt.Parents))];
    for (let i = 0; i < chain.length - 1; i++) {
      const { id } = chain[i];
      const parentId = chain[i + 1].id;
      const existing = links.get(id);
      if (existing === undefined) {
        links.set(id, parentId);
      } else if (existing !== parentId) {
        // Data integrity oddity: the same body/barycentre id claims two
        // different parents across events. Keep the first and move on —
        // this shouldn't happen with real journals, but we don't want a
        // single bad line to throw away an otherwise-good tree.
      }
    }
  }
  return links;
}

function classifyBody(evt) {
  if (evt.StarType) return 'Star';
  if (evt.PlanetClass) return 'Planet';
  if (!('SemiMajorAxis' in evt)) return 'BeltCluster';
  return 'Unknown';
}

/** Pulls the Keplerian element set + reference epoch out of a Scan/ScanBaryCentre event, or null if absent. */
export function extractElements(evt) {
  if (!('SemiMajorAxis' in evt)) return null;
  return {
    semiMajorAxis: evt.SemiMajorAxis,
    eccentricity: evt.Eccentricity,
    inclinationDeg: evt.OrbitalInclination,
    periapsisDeg: evt.Periapsis,
    ascendingNodeDeg: evt.AscendingNode,
    meanAnomalyDeg: evt.MeanAnomaly,
    orbitalPeriodSec: evt.OrbitalPeriod,
    epochMs: Date.parse(evt.timestamp),
  };
}

function latestByBodyId(events) {
  const latest = new Map();
  for (const evt of events) {
    const existing = latest.get(evt.BodyID);
    if (!existing || Date.parse(evt.timestamp) >= Date.parse(existing.timestamp)) {
      latest.set(evt.BodyID, evt);
    }
  }
  return latest;
}

/**
 * Builds the body tree for one system out of a flat parsed event stream.
 *
 * @param {object[]} events Parsed journal events (output of parseJournalLines).
 * @param {object} [options]
 * @param {number} [options.systemAddress] Restrict to this SystemAddress; defaults to whichever appears on the Scan events.
 * @param {string} [options.systemName] Label for the synthetic root node.
 * @returns {{ rootId: number, nodes: Map<number, object>, orphans: number[] }}
 */
export function buildBodyTree(events, { systemAddress, systemName } = {}) {
  let scans = events.filter((evt) => evt.event === 'Scan');
  let baries = events.filter((evt) => evt.event === 'ScanBaryCentre');

  if (systemAddress !== undefined) {
    scans = scans.filter((evt) => evt.SystemAddress === systemAddress);
    baries = baries.filter((evt) => evt.SystemAddress === systemAddress);
  }

  const latestScans = latestByBodyId(scans);
  const latestBaries = latestByBodyId(baries);
  const parentLinks = resolveParentLinks([...latestScans.values()]);

  const nodes = new Map();

  for (const evt of latestScans.values()) {
    nodes.set(evt.BodyID, {
      id: evt.BodyID,
      name: evt.BodyName,
      kind: classifyBody(evt),
      parentId: parentLinks.get(evt.BodyID) ?? null,
      elements: extractElements(evt),
      wasDiscovered: evt.WasDiscovered ?? null,
      wasMapped: evt.WasMapped ?? null,
      landable: evt.Landable ?? null,
      raw: evt,
    });
  }

  // BodyID 0 is usually an implicit, never-scanned system barycentre/root —
  // but for a single-star system, the star itself *is* BodyID 0, with no
  // Parents field at all (confirmed against real journals: e.g. "LFT 682"'s
  // star has BodyID:0 and no Parents, being the absolute root with nothing
  // to orbit). Only synthesize a placeholder root if no real scanned body
  // already claims id 0 — a real Scan always wins, and must, since the
  // synthetic root is inserted here specifically *after* the scan loop.
  if (!nodes.has(ROOT_ID)) {
    nodes.set(ROOT_ID, {
      id: ROOT_ID,
      name: systemName ?? null,
      kind: 'SystemBarycentre',
      parentId: null,
      elements: null,
    });
  }

  for (const evt of latestBaries.values()) {
    if (nodes.has(evt.BodyID)) continue; // a real Scan already claimed this id
    nodes.set(evt.BodyID, {
      id: evt.BodyID,
      name: null,
      kind: 'Barycentre',
      parentId: parentLinks.get(evt.BodyID) ?? null,
      elements: extractElements(evt),
      raw: evt,
    });
  }

  // Attach exobiology data (see bio-signals.js) to whichever bodies have it.
  // Skips bodies with no corresponding Scan-derived node yet — same
  // grace-period tolerance as orphans below; it resolves itself once the
  // body's own Scan event lands.
  const bioData = extractBioData(events, systemAddress);
  for (const [bodyId, bio] of bioData) {
    const node = nodes.get(bodyId);
    if (node) node.bio = bio;
  }

  // Mark moons: a Planet whose nearest non-root ancestor is also a Planet.
  for (const node of nodes.values()) {
    if (node.kind !== 'Planet') continue;
    let ancestorId = node.parentId;
    while (ancestorId !== null && ancestorId !== ROOT_ID) {
      const ancestor = nodes.get(ancestorId);
      if (!ancestor) break;
      if (ancestor.kind === 'Planet') {
        node.isMoon = true;
        break;
      }
      if (ancestor.kind === 'Star') break;
      ancestorId = ancestor.parentId;
    }
    node.isMoon ??= false;
  }

  // Attach children arrays and flag orphans (a parentId with no matching node).
  const orphans = [];
  for (const node of nodes.values()) {
    node.children = [];
  }
  for (const node of nodes.values()) {
    if (node.id === ROOT_ID) continue;
    const parent = node.parentId === null ? null : nodes.get(node.parentId);
    if (!parent) {
      orphans.push(node.id);
      continue;
    }
    parent.children.push(node.id);
  }

  return { rootId: ROOT_ID, nodes, orphans };
}
