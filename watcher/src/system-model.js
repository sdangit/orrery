// Tracks "the system the player is currently in" as a stream of journal
// events arrives incrementally, and produces the same tree shape milestone
// 1/2 already built (buildBodyTree's output) as a JSON-serializable snapshot
// on demand.
//
// System-switch detection: an FSDJump/Location for a *different*
// SystemAddress than the current one resets accumulated Scan data and starts
// fresh. Arriving at (or re-arriving at) the *same* system does not reset —
// bodies scanned earlier in the session, then revisited later, should stay
// known rather than disappearing.

import { buildBodyTree } from './body-tree.js';

const SYSTEM_CONTEXT_EVENTS = new Set(['FSDJump', 'Location']);
const SCAN_EVENTS = new Set(['Scan', 'ScanBaryCentre']);

export function createSystemModel() {
  let systemContext = null; // { starSystem, systemAddress, starPos, timestamp }
  let scanEvents = [];

  /**
   * @param {object[]} newEvents Freshly-parsed journal events, in file order.
   * @returns {{ switched: boolean, hasSystem: boolean, updated: boolean }}
   *   switched: this call moved to a different system.
   *   updated: the snapshot would actually differ from before this call
   *     (a system switch, or at least one new Scan/ScanBaryCentre landed) —
   *     lets a poller skip broadcasting when nothing but Music/ReceiveText-style
   *     noise came through.
   */
  function applyEvents(newEvents) {
    let switched = false;
    let scanEventsAdded = false;

    for (const evt of newEvents) {
      if (SYSTEM_CONTEXT_EVENTS.has(evt.event)) {
        const isNewSystem = !systemContext || systemContext.systemAddress !== evt.SystemAddress;
        if (isNewSystem) {
          systemContext = {
            starSystem: evt.StarSystem,
            systemAddress: evt.SystemAddress,
            starPos: evt.StarPos ?? null,
            timestamp: evt.timestamp,
          };
          scanEvents = [];
          switched = true;
        }
        continue;
      }
      if (SCAN_EVENTS.has(evt.event) && systemContext && evt.SystemAddress === systemContext.systemAddress) {
        scanEvents.push(evt);
        scanEventsAdded = true;
      }
    }

    return { switched, hasSystem: systemContext !== null, updated: switched || scanEventsAdded };
  }

  /** @returns {object|null} A JSON-serializable snapshot, or null if no system context has been seen yet. */
  function snapshot() {
    if (!systemContext) return null;
    const { rootId, nodes, orphans } = buildBodyTree(scanEvents, {
      systemAddress: systemContext.systemAddress,
      systemName: systemContext.starSystem,
    });
    return {
      generatedAt: new Date().toISOString(),
      systemName: systemContext.starSystem,
      systemAddress: systemContext.systemAddress,
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
