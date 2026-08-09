// The one and only network call this UI ever makes — see the README's
// privacy note. Opt-in only (see main.js's edsmEnabled toggle), and fails
// silently on anything at all (offline, timeout, CORS, malformed response):
// EDSM backfill is a nice-to-have, never a hard dependency, per the
// project's offline-first ethos.

const EDSM_BODIES_URL = 'https://www.edsm.net/api-system-v1/bodies';
const FETCH_TIMEOUT_MS = 8000;

/**
 * @param {string} systemName
 * @returns {Promise<object[]|null>} EDSM's `bodies` array, or null on any failure.
 */
export async function fetchEdsmBodies(systemName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${EDSM_BODIES_URL}?systemName=${encodeURIComponent(systemName)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.bodies) ? data.bodies : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
