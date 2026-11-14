import { classifySpotlight, reserveLevelLabel, EARTH_GRAVITY } from '@orrery/shared';
import { navigationLabel } from './body-navigation.js';
import { bodyIcon } from './body-visuals.js';

const SPOTLIGHT_LABELS = {
  'first-discovery': 'First discovery',
  'first-mapping': 'First mapping',
  'high-value-world': 'High value world',
  'terraformable': 'Terraformable',
};

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function fmtDistanceLs(ls) {
  if (typeof ls !== 'number') return '—';
  return `${ls.toFixed(ls < 100 ? 2 : 0)} ls`;
}

function fmtRadius(metres) {
  if (typeof metres !== 'number') return '—';
  return `${(metres / 1000).toFixed(0)} km`;
}

function fmtMass(node) {
  const raw = node.raw ?? {};
  if (typeof raw.StellarMass === 'number') return `${raw.StellarMass.toFixed(3)} solar masses`;
  if (typeof raw.MassEM === 'number') return `${raw.MassEM.toFixed(4)} Earth masses`;
  return '—';
}

function fmtGravity(g) {
  if (typeof g !== 'number') return '—';
  return `${(g / EARTH_GRAVITY).toFixed(2)} G`;
}

function fmtTemp(kelvin) {
  if (typeof kelvin !== 'number') return '—';
  return `${kelvin.toFixed(0)} K`;
}

function fmtAtmosphere(node) {
  const raw = node.raw ?? {};
  if (raw.AtmosphereType && raw.AtmosphereType !== 'None') return raw.Atmosphere || raw.AtmosphereType;
  if (node.kind !== 'Planet') return '—';
  return 'None';
}

function fmtPeriod(seconds) {
  if (typeof seconds !== 'number') return '—';
  const days = Math.abs(seconds) / 86400;
  const period = days < 2 ? `${(Math.abs(seconds) / 3600).toFixed(1)} h`
    : days < 1000 ? `${days.toFixed(1)} d` : `${(days / 365.25).toFixed(1)} yr`;
  return seconds < 0 ? `${period} (retrograde)` : period;
}

function fmtDiscovery(wasDiscovered) {
  if (wasDiscovered === false) return 'NO — FIRST DISCOVERY';
  if (wasDiscovered === true) return 'Yes';
  return '—';
}

function fmtMapped(wasMapped, kind) {
  if (kind !== 'Planet') return '—';
  if (wasMapped === false) return 'NO — FIRST MAPPING';
  if (wasMapped === true) return 'Yes';
  return '—';
}

const RING_CLASS_LABELS = {
  eRingClass_Icy: 'Icy',
  eRingClass_Rocky: 'Rocky',
  eRingClass_Metalic: 'Metallic',
  eRingClass_MetalRich: 'Metal Rich',
};

function fmtRings(node) {
  const rings = node.raw?.Rings;
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const classes = [...new Set(rings.map((r) => RING_CLASS_LABELS[r.RingClass] ?? r.RingClass))].join(', ');
  const reserveLevel = node.raw?.ReserveLevel;
  return reserveLevel ? `${classes} — ${reserveLevelLabel(reserveLevel)} reserves` : classes;
}

function fmtKind(node) {
  const raw = node.raw ?? {};
  if (node.kind === 'Star') return `Star (${raw.StarType ?? '?'})`;
  if (node.kind === 'Planet') return `${raw.PlanetClass ?? 'Planet'}${node.isMoon ? ' (moon)' : ''}`;
  return 'Orbital group';
}

/**
 * @param {{signalCount: number|null, genuses: string[], samples: Array<{genus:string, species:string, scansLogged:number, complete:boolean}>}} [bio]
 */
function renderBioSection(bio) {
  const section = document.getElementById('detailBio');
  section.hidden = !bio || !(bio.signalCount > 0);
  if (section.hidden) return;

  setText('detailBioCount', String(bio.signalCount));

  const genusesRow = document.getElementById('detailGenusesRow');
  genusesRow.hidden = bio.genuses.length === 0;
  if (bio.genuses.length > 0) setText('detailGenuses', bio.genuses.join(', '));

  const samplesEl = document.getElementById('detailSamples');
  samplesEl.replaceChildren();
  for (const sample of bio.samples) {
    const row = document.createElement('div');
    row.className = 'stat';
    const label = document.createElement('span');
    label.textContent = sample.species;
    const value = document.createElement('span');
    value.textContent = sample.complete ? 'Complete' : `${sample.scansLogged}/3 sampled`;
    row.append(label, value);
    samplesEl.appendChild(row);
  }
}

/**
 * @param {object} node A body-tree node (see watcher/src/body-tree.js), or null to hide the panel.
 * @param {string} systemName Used to strip the redundant system-name prefix off the header (see naming.js).
 * @param {string|null} [nickname] Overrides the designator wherever this body is pinned (see nicknames.js).
 */
export function renderDetailPanel(node, systemName, nickname = null) {
  const panel = document.getElementById('detail');
  if (!node) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const raw = node.raw ?? {};
  const { spotlighted, reasons } = classifySpotlight(node);

  const designator = nickname ?? navigationLabel(node, systemName);
  const icon = bodyIcon(node);
  setText('detailName', icon ? `${icon} ${designator}` : designator);
  document.getElementById('detailBackfillNotice').hidden = !node.isBackfill;
  const sourceNames = { journal: 'Journal', edsm: 'EDSM', spansh: 'Spansh' };
  const sources = node.sources ?? ['journal'];
  setText('detailSources', sources.map((s) => sourceNames[s]).join(' + '));
  const quality = node.positionQuality ?? 'propagated';
  setText('detailPosition', quality === 'unresolved' ? 'Unresolved' : quality === 'approximate' ? 'Approximate phase / orientation' : 'Propagated from orbital data');
  document.getElementById('detailPosition').title = node.positionIssue ?? `Position sources: ${(node.positionSources ?? []).map((s) => sourceNames[s]).join(' + ') || 'System origin'}`;
  const orbitSource = node.orbitSource ?? (node.elements ? 'journal' : null);
  setText('detailOrbitSource', sourceNames[orbitSource] ?? (node.positionIssue ? 'Missing orbital data' : 'System origin'));
  const utc = (ms) => Number.isFinite(ms) ? new Date(ms).toISOString().replace('T', ' ').replace('.000Z', '') : '—';
  setText('detailOrbitEpoch', node.orbitQuality === 'approximate' ? 'Unknown (illustrative phase)' : utc(node.elements?.epochMs));
  setText('detailRecordUpdated', Object.entries(node.recordUpdates ?? {})
    .filter(([, ms]) => Number.isFinite(ms)).map(([source, ms]) => `${sourceNames[source]}: ${utc(ms)}`).join('\n') || '—');
  setText('detailKind', fmtKind(node));
  setText('detailDist', fmtDistanceLs(raw.DistanceFromArrivalLS));
  setText('detailRadius', fmtRadius(raw.Radius));
  setText('detailMass', fmtMass(node));
  setText('detailGravity', fmtGravity(raw.SurfaceGravity));
  setText('detailTemp', fmtTemp(raw.SurfaceTemperature));
  setText('detailAtmo', fmtAtmosphere(node));
  setText('detailLandable', node.landable === true ? 'Yes' : node.landable === false ? 'No' : '—');
  setText('detailPeriod', fmtPeriod(node.elements?.orbitalPeriodSec));
  setText('detailDiscovered', fmtDiscovery(raw.WasDiscovered));
  setText('detailMapped', fmtMapped(raw.WasMapped, node.kind));

  const ringsText = fmtRings(node);
  const ringsRow = document.getElementById('detailRingsRow');
  ringsRow.hidden = ringsText === null;
  if (ringsText !== null) setText('detailRings', ringsText);

  renderBioSection(node.bio);

  const spotlightRow = document.getElementById('detailSpotlight');
  spotlightRow.hidden = !spotlighted;
  spotlightRow.replaceChildren();
  for (const reason of reasons) {
    const badge = document.createElement('span');
    badge.className = 'spotlight-badge';
    badge.textContent = SPOTLIGHT_LABELS[reason] ?? reason;
    spotlightRow.appendChild(badge);
  }
}
