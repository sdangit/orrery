import { parseJsonPreservingIntegers, systemAddressString } from './json-integers.js';

const BODY_FIELDS = ['bodyId', 'name', 'type', 'subType', 'parents', 'orbitalPeriod', 'semiMajorAxis',
  'orbitalEccentricity', 'orbitalInclination', 'argOfPeriapsis', 'meanAnomaly', 'ascendingNode',
  'timestamps', 'updateTime', 'mainStar', 'isMainStar', 'distanceToArrival', 'solarRadius', 'radius',
  'gravity', 'surfaceTemperature', 'earthMasses', 'solarMasses', 'isLandable', 'terraformingState',
  'atmosphereType', 'reserveLevel', 'rings'];

export function parseCommunityRequest(params) {
  const systemName = params.get('systemName');
  const addressInput = params.get('systemAddress');
  const systemAddress = addressInput === null ? null : systemAddressString(addressInput);
  const providers = [...new Set((params.get('providers') ?? '').split(',').filter(Boolean))];
  const refresh = params.get('refresh');
  if (!systemName || systemName.length > 128 || /[\x00-\x1f]/.test(systemName)
      || (addressInput !== null && systemAddress === null)
      || (refresh !== null && refresh !== '1')
      || !providers.length || providers.some((p) => !['edsm', 'spansh'].includes(p))) {
    throw new Error('Invalid community data request');
  }
  return { systemName, systemAddress, providers, ...(refresh === '1' ? { refresh: true } : {}) };
}

/** Fixed provider URLs only. Bounded cache, independent failures and coalesced requests. */
export function createCommunityDataService({ fetchImpl = globalThis.fetch, now = Date.now,
  timeoutMs = 8000, cacheMs = 60000, failureCacheMs = 60000, maxEntries = 64 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const controllers = new Set();
  const retryAfter = new Map(); // Provider-wide backoff, including manual refresh.
  let closed = false;

  async function request(source, systemName, systemAddress, refresh) {
    if (source === 'spansh' && systemAddress === null) return { status: 'missing-address', bodies: [] };
    const key = JSON.stringify([source, systemAddress, systemName.toLowerCase()]);
    const cached = cache.get(key);
    if (pending.has(key)) return pending.get(key);
    if ((retryAfter.get(source) ?? 0) > now()) {
      return { status: 'rate-limited', bodies: [], retryAt: retryAfter.get(source) };
    }
    if (!refresh && cached && cached.expires > now()) return cached.result;
    if (closed || pending.size >= maxEntries) return { status: 'unavailable', bodies: [] };
    const job = (async () => {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let result;
      try {
        const url = source === 'spansh'
          ? `https://spansh.co.uk/api/dump/${systemAddress}`
          : `https://www.edsm.net/api-system-v1/bodies?systemName=${encodeURIComponent(systemName)}`;
        const response = await fetchImpl(url, {
          signal: controller.signal, redirect: 'error',
          headers: { Accept: 'application/json', 'User-Agent': 'Orrery/1.0 (https://github.com/sdangit/orrery)' },
        });
        if (response.status === 429) {
          const value = response.headers?.get('Retry-After');
          const seconds = value !== null && value !== undefined && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
          const date = value ? Date.parse(value) : NaN;
          const until = Number.isFinite(seconds) ? now() + seconds * 1000
            : Number.isFinite(date) ? date : now() + failureCacheMs;
          retryAfter.set(source, Math.max(now(), until));
          result = { status: 'rate-limited', bodies: [], retryAt: retryAfter.get(source) };
        } else {
          if (!response.ok) throw new Error('Provider unavailable');
          const data = parseJsonPreservingIntegers(await response.text());
          const system = source === 'spansh' ? data.system : data;
          if (!system || !Array.isArray(system.bodies)) throw new Error('Invalid provider response');
          if (system.name?.toLowerCase() !== systemName.toLowerCase()
              || (systemAddress !== null && systemAddressString(system.id64) !== systemAddress)) {
            result = { status: 'identity-mismatch', bodies: [] };
          } else {
            // Exclude station lists and unrelated system data (Sol's dump is ~2 MB).
            const bodies = system.bodies.filter((b) => b && typeof b === 'object').map((body) =>
              Object.fromEntries(BODY_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])));
            result = { status: bodies.length ? 'ready' : 'empty', bodies, receivedAt: now(),
              systemAddress: systemAddressString(system.id64), systemName: system.name };
          }
        }
      } catch {
        result = { status: 'unavailable', bodies: [] };
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
      }
      cache.delete(key);
      cache.set(key, { result, expires: result.status === 'rate-limited' ? result.retryAt
        : now() + (result.status === 'ready' ? cacheMs : failureCacheMs) });
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      return result;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }

  return {
    async get({ systemName, systemAddress = null, providers, refresh = false }) {
      // Validate even when called outside HTTP; never interpolate an arbitrary URL.
      const params = new URLSearchParams({ systemName, providers: providers.join(',') });
      if (refresh) params.set('refresh', '1');
      if (systemAddress !== null) {
        const address = systemAddressString(systemAddress);
        if (address === null) throw new Error('Invalid system address');
        params.set('systemAddress', address);
      }
      const input = parseCommunityRequest(params);
      return Object.fromEntries(await Promise.all(input.providers.map(async (source) =>
        [source, await request(source, input.systemName, input.systemAddress, input.refresh)])));
    },
    close() { closed = true; for (const controller of controllers) controller.abort(); cache.clear(); },
  };
}
