// Compatibility entry point for EDSM-only callers. The shared provider merger
// now handles units, hierarchy validation and position quality consistently.
import { mergeCommunityBodies } from './community-backfill.js';
export function buildBackfillNodes(existingNodes, edsmBodies) {
  return mergeCommunityBodies(existingNodes, { edsm: { bodies: edsmBodies, receivedAt: Date.now() } }).nodes;
}
