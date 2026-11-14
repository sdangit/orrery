// Provider adapters feed one journal-shaped model. Merge only within one system;
// the watcher verifies system identity before returning either provider's data.
import { mapEdsmPlanetClass, mapEdsmTerraformState } from './edsm-mapping.js';

export const AU_IN_METRES = 149597870700;
export const EARTH_GRAVITY = 9.80665;
const SOLAR_RADIUS_METRES = 695700000;
const finite = Number.isFinite;
const validId = (id) => Number.isSafeInteger(id) && id >= 0;
const rank = { journal: 3, spansh: 2, edsm: 1 };

function timestamp(value) {
  if (typeof value !== 'string') return null;
  // EDSM's date strings lack a zone; both providers document UTC.
  const ms = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(' ', 'T') + 'Z');
  return finite(ms) ? ms : null;
}

export function completeElements(e) {
  return !!e && e.semiMajorAxis > 0 && e.orbitalPeriodSec !== 0
    && e.eccentricity >= 0 && e.eccentricity < 1
    && ['semiMajorAxis', 'orbitalPeriodSec', 'eccentricity', 'inclinationDeg',
      'periapsisDeg', 'ascendingNodeDeg', 'meanAnomalyDeg', 'epochMs'].every((k) => finite(e[k]));
}

function elementsFor(body, source, receivedAt) {
  // Observed /dump units: AU and days, despite the Spansh docs labelling
  // semiMajorAxis as km. Sol fixtures pin this and the ring-unit difference.
  if (!finite(body.semiMajorAxis) || body.semiMajorAxis <= 0
      || !finite(body.orbitalPeriod) || body.orbitalPeriod === 0) return null;
  if (body.orbitalEccentricity != null && (!finite(body.orbitalEccentricity)
      || body.orbitalEccentricity < 0 || body.orbitalEccentricity >= 1)) return null;
  const phaseEpoch = source === 'spansh' ? timestamp(body.timestamps?.meanAnomaly) : null;
  const full = phaseEpoch !== null && ['orbitalEccentricity', 'orbitalInclination',
    'argOfPeriapsis', 'meanAnomaly', 'ascendingNode'].every((k) => finite(body[k]));
  const elements = {
    semiMajorAxis: body.semiMajorAxis * AU_IN_METRES,
    orbitalPeriodSec: body.orbitalPeriod * 86400,
    eccentricity: body.orbitalEccentricity ?? 0,
    inclinationDeg: finite(body.orbitalInclination) ? body.orbitalInclination : 0,
    periapsisDeg: finite(body.argOfPeriapsis) ? body.argOfPeriapsis : 0,
    ascendingNodeDeg: source === 'spansh' && finite(body.ascendingNode) ? body.ascendingNode : 0,
    meanAnomalyDeg: full ? body.meanAnomaly : 0,
    // updateTime is record freshness, NEVER the mean-anomaly epoch.
    epochMs: full ? phaseEpoch : receivedAt,
  };
  return completeElements(elements) ? { elements, quality: full ? 'propagated' : 'approximate' } : null;
}

function starType(subType) {
  const exotic = { 'Neutron Star': 'N', 'Black Hole': 'H', 'Supermassive Black Hole': 'SupermassiveBlackHole',
    'Herbig Ae/Be Star': 'AeBe', 'T Tauri Star': 'TTS' };
  return exotic[subType] ?? subType?.match(/^White Dwarf \(([^)]+)\)/)?.[1]
    ?? subType?.match(/^([OBAFGKMLTYCSNWD][A-Za-z]*)\b/)?.[1];
}

function rawFor(body, source) {
  const raw = {};
  const assign = (key, value) => { if (value !== undefined && value !== null) raw[key] = value; };
  if (body.type === 'Star') assign('StarType', starType(body.subType));
  if (body.type === 'Planet') {
    assign('PlanetClass', mapEdsmPlanetClass(body.subType));
    if (typeof body.terraformingState === 'string') raw.TerraformState = mapEdsmTerraformState(body.terraformingState);
  }
  const fields = { surfaceTemperature: 'SurfaceTemperature', earthMasses: 'MassEM',
    solarMasses: 'StellarMass', distanceToArrival: 'DistanceFromArrivalLS' };
  for (const [from, to] of Object.entries(fields)) if (finite(body[from]) && body[from] >= 0) raw[to] = body[from];
  if (finite(body.radius) && body.radius > 0) raw.Radius = body.radius * 1000;
  else if (finite(body.solarRadius) && body.solarRadius > 0) raw.Radius = body.solarRadius * SOLAR_RADIUS_METRES;
  if (finite(body.gravity) && body.gravity >= 0) raw.SurfaceGravity = body.gravity * EARTH_GRAVITY;
  for (const [from, to] of [['atmosphereType', 'AtmosphereType'], ['reserveLevel', 'ReserveLevel']]) {
    if (typeof body[from] === 'string') raw[to] = body[from];
  }
  const ringClasses = { Icy: 'eRingClass_Icy', Rocky: 'eRingClass_Rocky', Metallic: 'eRingClass_Metalic', 'Metal Rich': 'eRingClass_MetalRich' };
  if (Array.isArray(body.rings)) {
    const scale = source === 'edsm' ? 1000 : 1;
    const rings = body.rings.filter((r) => r && finite(r.innerRadius) && finite(r.outerRadius)
      && r.innerRadius >= 0 && r.outerRadius > r.innerRadius && ringClasses[r.type])
      .map((r) => ({ Name: r.name, RingClass: ringClasses[r.type], InnerRad: r.innerRadius * scale, OuterRad: r.outerRadius * scale }));
    if (rings.length) raw.Rings = rings;
  }
  return raw;
}

function parentChain(parents) {
  if (parents == null) return [];
  if (!Array.isArray(parents)) return null;
  const chain = [];
  for (const entry of parents) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 1) return null;
    const [type, id] = Object.entries(entry)[0];
    if (!['Ring', 'Star', 'Planet', 'Null'].includes(type) || !validId(id)) return null;
    if (type !== 'Ring') chain.push({ id, type });
  }
  return chain;
}

export function normalizeCommunityBodies(source, bodies, receivedAt = Date.now()) {
  if (!['edsm', 'spansh'].includes(source)) throw new Error('Unknown community provider');
  const nodes = [];
  for (const body of bodies ?? []) {
    if (!body || !validId(body.bodyId) || !['Star', 'Planet', 'Barycentre'].includes(body.type)) continue;
    const orbit = elementsFor(body, source, receivedAt);
    const mainStar = source === 'spansh' ? body.mainStar : body.isMainStar;
    const chain = parentChain(body.parents);
    nodes.push({
      id: body.bodyId, name: typeof body.name === 'string' ? body.name : undefined,
      kind: body.type, raw: rawFor(body, source),
      landable: typeof body.isLandable === 'boolean' ? body.isLandable : undefined,
      isMainStar: typeof mainStar === 'boolean' ? mainStar : undefined,
      elements: orbit?.elements ?? null, orbitQuality: orbit?.quality ?? 'missing',
      chain: chain ?? [], invalidParents: chain === null, source,
      recordUpdatedAt: timestamp(body.updateTime),
    });
  }
  return nodes;
}

/** Returns a fresh tree plus diagnostics; never mutates journal or provider data. */
export function mergeCommunityBodies(journalNodes, providers = {}, { now = Date.now() } = {}) {
  const candidates = new Map();
  const links = new Map();
  const diagnostics = [];
  const addLink = (id, parentId, source) => {
    if (!links.has(id)) links.set(id, []);
    links.get(id).push({ parentId, source });
  };
  const add = (node) => {
    if (!candidates.has(node.id)) candidates.set(node.id, []);
    candidates.get(node.id).push(node);
    const chain = [{ id: node.id }, ...node.chain];
    for (let i = 0; i < chain.length - 1; i++) addLink(chain[i].id, chain[i + 1].id, node.source);
    if (!node.invalidParents && !node.chain.length && node.id === 0) addLink(node.id, null, node.source);
  };
  for (const source of ['spansh', 'edsm']) {
    const provider = providers[source];
    for (const node of normalizeCommunityBodies(source, provider?.bodies, provider?.receivedAt ?? now)) add(node);
  }
  for (const original of journalNodes.values()) {
    // Keep synthetic root only if there is no real replacement.
    const placeholder = original.kind === 'SystemBarycentre' && !original.raw && !original.elements;
    if (placeholder && candidates.get(original.id)?.some((n) => ['Star', 'Barycentre'].includes(n.kind))) continue;
    const chain = parentChain(original.raw?.Parents);
    const node = { ...original, source: 'journal', raw: { ...original.raw },
      chain: chain ?? [], invalidParents: chain === null,
      elements: completeElements(original.elements) ? original.elements : null,
      orbitQuality: completeElements(original.elements) ? 'propagated' : 'missing',
      recordUpdatedAt: timestamp(original.raw?.timestamp) };
    add(node);
    if (original.parentId != null) addLink(node.id, original.parentId, 'journal');
  }

  const nodes = new Map();
  for (const [id, list] of candidates) {
    list.sort((a, b) => rank[b.source] - rank[a.source]);
    const first = list[0];
    const compatible = list.filter((candidate) => candidate.kind === first.kind);
    if (compatible.length !== list.length) diagnostics.push(`Body ${id}: conflicting body types; kept ${first.source}`);
    const journal = compatible.find((n) => n.source === 'journal');
    const node = { ...first, raw: {}, children: [], fieldSources: {}, recordUpdates: {}, sources: [],
      isBackfill: journal ? journal.isBackfill : true };
    delete node.source;
    delete node.chain;
    delete node.recordUpdatedAt;
    const field = (key, value, source) => {
      if (value == null || node.fieldSources[key]) return;
      if (key.startsWith('raw.')) node.raw[key.slice(4)] = value;
      else node[key] = value;
      node.fieldSources[key] = source;
    };
    for (const candidate of compatible) {
      if (!node.sources.includes(candidate.source)) node.sources.push(candidate.source);
      node.recordUpdates[candidate.source] = candidate.recordUpdatedAt;
      for (const key of ['name', 'landable', 'isMainStar']) field(key, candidate[key], candidate.source);
      for (const [key, value] of Object.entries(candidate.raw)) field(`raw.${key}`, value, candidate.source);
    }
    // Never infer personal discovery/mapping status from community coverage.
    if (!journal) { node.raw.WasDiscovered = true; node.wasDiscovered = true; node.wasMapped = null; }
    const orbit = compatible.find((n) => n.orbitQuality === 'propagated')
      ?? compatible.find((n) => n.orbitQuality === 'approximate');
    node.elements = orbit?.elements ? { ...orbit.elements } : null;
    node.orbitQuality = orbit?.orbitQuality ?? 'missing';
    node.orbitSource = orbit?.source ?? null;
    if (orbit) node.fieldSources.elements = orbit.source;

    if (first.invalidParents) node.positionIssue = 'Invalid parent chain';
    const allLinks = (links.get(id) ?? []).sort((a, b) => rank[b.source] - rank[a.source]);
    const best = allLinks[0];
    node.parentId = best?.parentId; // undefined means unresolved, never silently the origin
    node.parentSource = best?.source ?? null;
    const conflicting = allLinks.some((link) => link.parentId !== best.parentId);
    if (conflicting) {
      diagnostics.push(`Body ${id}: conflicting parent links`);
      if (best.source !== 'journal' || allLinks.some((link) => link.source === 'journal' && link.parentId !== best.parentId)) {
        node.positionIssue = 'Conflicting parent links';
      }
    }
    nodes.set(id, node);
  }

  // Validate whole ancestor paths and propagate their position uncertainty.
  for (const node of nodes.values()) {
    let current = node;
    const seen = new Set();
    const positionSources = new Set();
    let quality = 'propagated';
    let issue = null;
    while (current) {
      if (seen.has(current.id)) { issue = 'Cycle in parent hierarchy'; break; }
      seen.add(current.id);
      if (current.positionIssue) { issue = current.positionIssue; break; }
      if (current.parentId === undefined) { issue = `Parent of body ${current.id} is unknown`; break; }
      if (current.parentId !== null && !current.elements) { issue = `Orbital elements missing for body ${current.id}`; break; }
      if (current.orbitQuality === 'approximate') quality = 'approximate';
      if (current.orbitSource) positionSources.add(current.orbitSource);
      if (current.parentId === null) break;
      const parent = nodes.get(current.parentId);
      if (!parent) { issue = `Missing parent body ${current.parentId}`; break; }
      current = parent;
    }
    node.positionQuality = issue ? 'unresolved' : quality;
    node.positionIssue = issue;
    node.positionSources = [...positionSources];
    if (issue) diagnostics.push(`Body ${node.id}: ${issue}`);
    node.isMoon = [...seen].some((id) => id !== node.id && nodes.get(id)?.kind === 'Planet');
  }
  for (const node of nodes.values()) nodes.get(node.parentId)?.children.push(node.id);
  return { nodes, diagnostics: [...new Set(diagnostics)] };
}
