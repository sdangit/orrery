/** Only contacts the local watcher. Provider selection is explicit and opt-in. */
export async function fetchCommunityBodies({ systemName, systemAddress, providers, refresh = false }, { signal } = {}) {
  if (!providers.length) return {};
  const params = new URLSearchParams({ systemName, providers: providers.join(',') });
  if (refresh) params.set('refresh', '1');
  if (systemAddress !== null && systemAddress !== undefined) params.set('systemAddress', String(systemAddress));
  try {
    const response = await fetch(`/api/community-bodies?${params}`, {
      signal, headers: { 'X-Orrery-Community': '1' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || providers.some((p) => !data[p] || !Array.isArray(data[p].bodies))) return null;
    return data;
  } catch { return null; }
}
