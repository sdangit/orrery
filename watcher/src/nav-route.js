// Reads NavRoute.json — a separate snapshot file next to the journal, not
// part of the append-only log — to find "the next system after this one" on
// a plotted multi-jump route. The journal's own bare `NavRoute` event carries
// no route data at all (confirmed against Terje's real journal history: just
// `{"event":"NavRoute"}`, nothing else); the actual route only ever lives in
// this file.
//
// Schema verified against two independent sources (elite-journal.readthedocs.io,
// its Travel page) since no populated example was available locally — Terje's
// own NavRoute.json currently holds a cleared route. The cleared-state shape
// *is* confirmed from his real file: `{"event":"NavRouteClear","Route":[]}`.
// A populated route's top-level event is `"Route"`, with each hop shaped
// `{StarSystem, SystemAddress, StarPos, StarClass}`.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} journalDir
 * @returns {{event: string, route: Array<{starSystem: string, systemAddress: number, starClass: string}>} | null} null if the file doesn't exist or fails to parse.
 */
export function readNavRouteFile(journalDir) {
  const filePath = join(journalDir, 'NavRoute.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return {
      event: raw.event,
      route: (raw.Route ?? []).map((hop) => ({
        starSystem: hop.StarSystem,
        systemAddress: hop.SystemAddress,
        starClass: hop.StarClass ?? null,
      })),
    };
  } catch {
    // Can genuinely be mid-write (the game rewrites this file on every replot) — treat as "nothing to report" rather than crash the poll loop.
    return null;
  }
}

/**
 * @param {Array<{starSystem: string, systemAddress: number, starClass: string}>} route
 * @param {number} currentSystemAddress
 * @returns {{starSystem: string, starClass: string} | null} The hop after the current system, or null if the current system isn't in the route (route not plotted from here, already completed, or player has strayed off it) or is the last hop.
 */
export function nextSystemInRoute(route, currentSystemAddress) {
  const index = route.findIndex((hop) => hop.systemAddress === currentSystemAddress);
  if (index === -1 || index === route.length - 1) return null;
  const next = route[index + 1];
  return { starSystem: next.starSystem, starClass: next.starClass };
}
