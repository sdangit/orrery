// Parses the three Odyssey exobiology events. Field names verified against
// community journal-schema documentation (elite-journal.readthedocs.io,
// schemas.edomh.nl) rather than the project's own real journal fixture —
// FSSBodySignals/SAASignalsFound do appear there (confirming BodyID and the
// Signals/Genuses array shapes), but with Geological/Human signals, not
// Biological, and ScanOrganic doesn't appear at all. One real gotcha this
// surfaced: ScanOrganic identifies its body with a field called `Body`, not
// `BodyID` like every other event in this codebase.
//
// Deliberately does NOT predict which genera *might* appear before the game
// itself reports them (FSSBodySignals/SAASignalsFound), and does NOT compute
// a credit value — both would need the unverifiable heuristic/payout tables
// this project ruled out (see TECHNICAL.md).

const BIOLOGICAL_SIGNAL_TYPE = '$SAA_SignalType_Biological;';

// Confirmed via the same schema research: ScanType progresses Log -> Sample
// -> Analyse across exactly three scans per species ("sample progress
// 1/3-3/3"; see TECHNICAL.md).
const REQUIRED_SAMPLES = 3;
const FINAL_SCAN_TYPE = 'Analyse';

function biologicalCount(signals) {
  if (!Array.isArray(signals)) return null;
  const bio = signals.find((s) => s.Type === BIOLOGICAL_SIGNAL_TYPE);
  return bio ? bio.Count : null;
}

/**
 * @param {object[]} events Parsed journal events (any mix of types; non-bio events are ignored).
 * @param {number} [systemAddress] Restrict to this SystemAddress.
 * @returns {Map<number, {signalCount: number|null, genuses: string[], samples: Array<{genus:string, species:string, scansLogged:number, complete:boolean}>}>}
 *   Keyed by BodyID. Only bodies with at least one biological signal or sample get an entry.
 */
export function extractBioData(events, systemAddress) {
  const byBody = new Map();

  function bodyEntry(bodyId) {
    if (!byBody.has(bodyId)) {
      byBody.set(bodyId, { signalCount: null, genuses: [], samples: [] });
    }
    return byBody.get(bodyId);
  }

  for (const evt of events) {
    if (systemAddress !== undefined && evt.SystemAddress !== systemAddress) continue;

    if (evt.event === 'FSSBodySignals') {
      const count = biologicalCount(evt.Signals);
      if (count !== null) bodyEntry(evt.BodyID).signalCount = count;
      continue;
    }

    if (evt.event === 'SAASignalsFound') {
      const count = biologicalCount(evt.Signals);
      if (count !== null) {
        const entry = bodyEntry(evt.BodyID);
        entry.signalCount = count; // more authoritative than FSSBodySignals — this is post-DSS
        entry.genuses = (evt.Genuses ?? []).map((g) => g.Genus_Localised ?? g.Genus);
      }
      continue;
    }

    if (evt.event === 'ScanOrganic') {
      const entry = bodyEntry(evt.Body);
      const speciesLabel = evt.Species_Localised ?? evt.Species;
      let sample = entry.samples.find((s) => s.species === speciesLabel);
      if (!sample) {
        sample = { genus: evt.Genus_Localised ?? evt.Genus, species: speciesLabel, scansLogged: 0, complete: false };
        entry.samples.push(sample);
      }
      sample.scansLogged += 1;
      if (evt.ScanType === FINAL_SCAN_TYPE) sample.complete = true;
    }
  }

  return byBody;
}

export { BIOLOGICAL_SIGNAL_TYPE, REQUIRED_SAMPLES };
