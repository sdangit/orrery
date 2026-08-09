// Tracks "the system the player is currently in" as a stream of journal
// events arrives incrementally, and produces the same tree shape milestone
// 1/2 already built (buildBodyTree's output) as a JSON-serializable snapshot
// on demand — plus the system-level context (security, factions, a running
// bounty tally) piracy mode needs.
//
// System-switch detection: an FSDJump/Location for a *different*
// SystemAddress than the current one resets accumulated Scan data and starts
// fresh. Arriving at (or re-arriving at) the *same* system does not reset —
// bodies scanned earlier in the session, then revisited later, should stay
// known rather than disappearing. Security/government/faction info *does*
// refresh on every FSDJump/Location regardless of switch, though — those are
// BGS-driven and can change (a faction sliding into War state) between visits
// to a system you never left the tree data for.

import { buildBodyTree } from './body-tree.js';

const SYSTEM_CONTEXT_EVENTS = new Set(['FSDJump', 'Location']);
// Everything buildBodyTree/bio-signals.js can turn into per-body data on the
// snapshot — not just Scan/ScanBaryCentre anymore now that exobiology needs
// FSSBodySignals/SAASignalsFound/ScanOrganic too.
const BODY_EVENTS = new Set(['Scan', 'ScanBaryCentre', 'FSSBodySignals', 'SAASignalsFound', 'ScanOrganic']);
const NAV_BEACON_SIGNAL_TYPE = 'NavBeacon';

/** Faction state names are the game's own stable vocabulary (War, CivilWar, Boom, ...), not a rebalance-prone value. */
function extractFactions(evt) {
  if (!Array.isArray(evt.Factions)) return [];
  return evt.Factions.map((f) => ({ name: f.Name, state: f.FactionState ?? 'None' }));
}

export function createSystemModel() {
  let systemContext = null; // { starSystem, systemAddress, starPos, timestamp, security, government, population, factions }
  let bodyEvents = []; // Scan/ScanBaryCentre/FSSBodySignals/SAASignalsFound/ScanOrganic for the current system
  let bountyTally = 0;
  // Session tracker (handover doc's "thin, v1.5" strip): watcher-lifetime,
  // like bountyTally — survives system switches, resets only on restart.
  // Keyed by system+body so a body scanned twice (AutoScan then a nav-beacon
  // detail scan is common) counts once.
  const sessionScanKeys = new Set();
  const sessionFirstDiscoveryKeys = new Set();

  /**
   * @param {object[]} newEvents Freshly-parsed journal events, in file order.
   * @returns {{ switched: boolean, hasSystem: boolean, updated: boolean }}
   *   switched: this call moved to a different system.
   *   updated: the snapshot would actually differ from before this call.
   */
  function applyEvents(newEvents) {
    let switched = false;
    let updated = false;

    for (const evt of newEvents) {
      if (SYSTEM_CONTEXT_EVENTS.has(evt.event)) {
        const isNewSystem = !systemContext || systemContext.systemAddress !== evt.SystemAddress;
        if (isNewSystem) {
          bodyEvents = [];
          switched = true;
        }
        systemContext = {
          starSystem: evt.StarSystem,
          systemAddress: evt.SystemAddress,
          starPos: evt.StarPos ?? systemContext?.starPos ?? null,
          timestamp: evt.timestamp,
          security: evt.SystemSecurity_Localised ?? systemContext?.security ?? null,
          government: evt.SystemGovernment_Localised ?? systemContext?.government ?? null,
          population: evt.Population ?? systemContext?.population ?? null,
          factions: extractFactions(evt),
          // Reset on a real system switch; a same-system re-arrival keeps
          // whatever was already found (the beacon doesn't move).
          navBeaconDetected: isNewSystem ? false : (systemContext?.navBeaconDetected ?? false),
        };
        updated = true;
        continue;
      }
      if (BODY_EVENTS.has(evt.event) && systemContext && evt.SystemAddress === systemContext.systemAddress) {
        bodyEvents.push(evt);
        if (evt.event === 'Scan' && typeof evt.BodyID === 'number') {
          const key = `${evt.SystemAddress}:${evt.BodyID}`;
          sessionScanKeys.add(key);
          if (evt.WasDiscovered === false) sessionFirstDiscoveryKeys.add(key);
        }
        updated = true;
        continue;
      }
      if (
        evt.event === 'FSSSignalDiscovered'
        && systemContext
        && evt.SystemAddress === systemContext.systemAddress
        && evt.SignalType === NAV_BEACON_SIGNAL_TYPE
        && !systemContext.navBeaconDetected
      ) {
        systemContext.navBeaconDetected = true;
        updated = true;
        continue;
      }
      if (evt.event === 'Bounty' && typeof evt.TotalReward === 'number') {
        bountyTally += evt.TotalReward;
        updated = true;
      }
    }

    return { switched, hasSystem: systemContext !== null, updated };
  }

  /** @returns {object|null} A JSON-serializable snapshot, or null if no system context has been seen yet. */
  function snapshot() {
    if (!systemContext) return null;
    const { rootId, nodes, orphans } = buildBodyTree(bodyEvents, {
      systemAddress: systemContext.systemAddress,
      systemName: systemContext.starSystem,
    });
    return {
      generatedAt: new Date().toISOString(),
      systemName: systemContext.starSystem,
      systemAddress: systemContext.systemAddress,
      systemSecurity: systemContext.security,
      systemGovernment: systemContext.government,
      population: systemContext.population,
      factions: systemContext.factions,
      navBeaconDetected: systemContext.navBeaconDetected,
      bountyTally,
      sessionStats: {
        scans: sessionScanKeys.size,
        firstDiscoveries: sessionFirstDiscoveryKeys.size,
      },
      rootId,
      nodes: [...nodes.values()],
      orphans,
    };
  }

  return {
    applyEvents,
    snapshot,
    get systemContext() {
      return systemContext;
    },
  };
}
