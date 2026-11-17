// Journal Scan puts both rings and belts in Rings; community APIs split them.
export const isBeltRing = ring => /\bBelt\s*$/i.test(ring?.Name ?? '');
export const validBeltRadii = belt => Number.isFinite(belt?.InnerRad)
  && Number.isFinite(belt?.OuterRad) && belt.InnerRad >= 0 && belt.OuterRad > belt.InnerRad;

/** Candidates arrive in source-priority order. Keep radii as an atomic pair. */
export function mergeBeltRecords(candidates) {
  const records = new Map();
  for (const candidate of candidates) {
    const belts = [...(candidate.raw?.Belts ?? []), ...(candidate.raw?.Rings ?? []).filter(isBeltRing)];
    for (const belt of belts) {
      if (typeof belt?.Name !== 'string' || !belt.Name.trim()) continue;
      const key = belt.Name.trim().toLowerCase();
      const record = records.get(key) ?? { Name: belt.Name, sources: [], recordUpdates: {} };
      if (!record.sources.includes(candidate.source)) record.sources.push(candidate.source);
      record.recordUpdates[candidate.source] = candidate.recordUpdatedAt;
      if (!record.RingClass && belt.RingClass) record.RingClass = belt.RingClass;
      if (!validBeltRadii(record) && validBeltRadii(belt)) {
        record.InnerRad = belt.InnerRad;
        record.OuterRad = belt.OuterRad;
      }
      records.set(key, record);
    }
  }
  return [...records.values()];
}

/** Belts are regions centred on a host, never point bodies with invented phase. */
export function addBeltNodes(nodes) {
  for (const host of [...nodes.values()]) {
    for (const belt of host.raw?.Belts ?? []) {
      // Stable across provider changes; these aren't journal BodyIDs.
      const id = `belt:${host.id}:${belt.Name.trim().toLowerCase()}`;
      const { sources = host.sources, recordUpdates = {}, ...raw } = belt;
      nodes.set(id, { id, name: belt.Name, kind: 'AsteroidBelt', parentId: host.id,
        children: [], raw, elements: null, sources, recordUpdates,
        isBackfill: !sources?.includes('journal'), positionQuality: host.positionQuality,
        positionIssue: host.positionIssue, positionSources: host.positionSources,
      });
      host.children.push(id);
    }
  }
}
