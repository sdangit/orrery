// Provider adapters feed one journal-shaped model. Merge only within one system;
// the watcher verifies system identity before returning any provider's data.
import { mapEdsmPlanetClass, mapEdsmTerraformState } from './edsm-mapping.js';
import { mergeBeltRecords, addBeltNodes } from './asteroid-belts.js';

export const AU_IN_METRES = 149597870700;
export const EARTH_GRAVITY = 9.80665;
const SOLAR_RADIUS_METRES = 695700000;
const finite = Number.isFinite;
const validId = (id) => Number.isSafeInteger(id) && id >= 0;
const rank = { journal: 4, spansh: 3, edgis: 2, edsm: 1 };

function timestamp(value) {
  if (typeof value !== 'string') return null;
  // EDSM's date strings lack a zone and use UTC.
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
    ascendingNodeDeg: source !== 'edsm' && finite(body.ascendingNode) ? body.ascendingNode : 0,
    meanAnomalyDeg: full || (source === 'edgis' && finite(body.meanAnomaly)) ? body.meanAnomaly : 0,
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
  // All three adapters retain journal radians, including negative axial tilts.
  if (finite(body.axialTilt)) raw.AxialTilt = body.axialTilt;
  const assign = (key, value) => { if (value !== undefined && value !== null) raw[key] = value; };
  if (body.type === 'Star') assign('StarType', source === 'edgis' ? body.subType : starType(body.subType));
  if (body.type === 'Planet') {
    // EDGIS can retain either journal enums or Spansh descriptions from imports.
    assign('PlanetClass', mapEdsmPlanetClass(body.subType) ?? (source === 'edgis' ? body.subType : undefined));
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
  if (Array.isArray(body.belts)) {
    const scale = source === 'edsm' ? 1000 : 1;
    raw.Belts = body.belts.filter(b => typeof b?.name === 'string' && b.name.trim()).map(b => ({
      Name: b.name, RingClass: ringClasses[b.type],
      ...(finite(b.innerRadius) && finite(b.outerRadius) && b.innerRadius >= 0 && b.outerRadius > b.innerRadius
        ? { InnerRad: b.innerRadius * scale, OuterRad: b.outerRadius * scale } : {}),
    }));
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
  if (!['edsm', 'spansh', 'edgis'].includes(source)) throw new Error('Unknown community provider');
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
      hasMeasuredOrientation: ['orbitalEccentricity', 'orbitalInclination', 'argOfPeriapsis',
        'ascendingNode'].every((k) => finite(body[k])),
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
  const inferredGroups = new Map();
  const diagnostics = [];
  const addLink = (id, parentId, source) => {
    if (!links.has(id)) links.set(id, []);
    links.get(id).push({ parentId, source });
  };
  const add = (node) => {
    if (!candidates.has(node.id)) candidates.set(node.id, []);
    candidates.get(node.id).push(node);
    const chain = [{ id: node.id }, ...node.chain];
    for (const ancestor of node.chain) {
      if (ancestor.type === 'Null') inferredGroups.set(ancestor.id, node.source);
    }
    for (let i = 0; i < chain.length - 1; i++) addLink(chain[i].id, chain[i + 1].id, node.source);
    if (!node.invalidParents && !node.chain.length && node.id === 0) addLink(node.id, null, node.source);
  };
  for (const source of ['spansh', 'edgis', 'edsm']) {
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

  // Parent chains can name barycentres without supplying their records (EDSM).
  // Preserve those groups for navigation, but never invent their orbital data.
  for (const [id, source] of inferredGroups) {
    if (candidates.has(id)) continue;
    add({ id, kind: id === 0 ? 'SystemBarycentre' : 'Barycentre', raw: {},
      elements: null, orbitQuality: 'missing', chain: [], source, inferred: true });
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
    const belts = mergeBeltRecords(compatible);
    if (belts.length) node.raw.Belts = belts;
    // Never infer personal discovery/mapping status from community coverage.
    if (!journal) { node.raw.WasDiscovered = true; node.wasDiscovered = true; node.wasMapped = null; }
    const orbit = compatible.find((n) => n.orbitQuality === 'propagated')
      ?? compatible.find((n) => n.orbitQuality === 'approximate');
    node.elements = orbit?.elements ? { ...orbit.elements } : null;
    node.orbitQuality = orbit?.orbitQuality ?? 'missing';
    node.orbitSource = orbit?.source ?? null;
    node.hasMeasuredOrientation = orbit?.hasMeasuredOrientation;
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

  // Binary stars share orbital phase about their barycentre, with opposite
  // periapsides. Infer an EDGIS companion's phase only for an unambiguous pair
  // whose measured geometry agrees; keep it approximate, never a measured epoch.
  for (const node of nodes.values()) {
    if (node.kind !== 'Star' || node.orbitSource !== 'edgis'
        || node.orbitQuality !== 'approximate' || !node.hasMeasuredOrientation
        || node.positionIssue || node.parentId == null) continue;
    const parent = nodes.get(node.parentId);
    if (!['Barycentre', 'SystemBarycentre'].includes(parent?.kind)) continue;
    const siblings = [...nodes.values()].filter((n) => n.kind === 'Star' && n.parentId === node.parentId);
    if (siblings.length !== 2) continue;
    const other = siblings.find((n) => n.id !== node.id);
    if (other.orbitQuality !== 'propagated' || other.positionIssue) continue;
    const a = node.elements, b = other.elements;
    const angleDifference = (x, y) => Math.abs(((x - y + 180) % 360 + 360) % 360 - 180);
    if (Math.abs(a.orbitalPeriodSec - b.orbitalPeriodSec) > Math.abs(b.orbitalPeriodSec) * 1e-6
        || Math.abs(a.eccentricity - b.eccentricity) > 1e-5
        || angleDifference(a.inclinationDeg, b.inclinationDeg) > 0.001
        || angleDifference(a.ascendingNodeDeg, b.ascendingNodeDeg) > 0.001
        || Math.abs(angleDifference(a.periapsisDeg, b.periapsisDeg) - 180) > 0.001) continue;
    a.meanAnomalyDeg = b.meanAnomalyDeg;
    a.epochMs = b.epochMs;
    node.phaseReferenceBodyId = other.id;
    node.phaseReferenceSource = other.orbitSource;
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
      if (current.phaseReferenceSource) positionSources.add(current.phaseReferenceSource);
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
  addBeltNodes(nodes);
  return { nodes, diagnostics: [...new Set(diagnostics)] };
}
