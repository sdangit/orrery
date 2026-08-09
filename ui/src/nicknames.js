// Pin/nickname persistence — "local JSON" per the design brief's identity-layer
// section, implemented as one localStorage entry per system (keyed by the
// stable numeric SystemAddress, not the name, since two systems can't share
// an address but procedurally-named systems can look superficially similar).
// A nickname stands in for a body's designator everywhere it's displayed;
// the underlying real name is untouched and still what Copy Name copies.

const STORAGE_PREFIX = 'orrery.nicknames.';

function storageKey(systemAddress) {
  return `${STORAGE_PREFIX}${systemAddress}`;
}

/** @returns {Record<number, string>} bodyId -> nickname for this system. Empty object if none set or on any storage error. */
export function getNicknames(systemAddress) {
  try {
    const raw = localStorage.getItem(storageKey(systemAddress));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** @returns {string|null} */
export function getNickname(systemAddress, bodyId) {
  return getNicknames(systemAddress)[bodyId] ?? null;
}

/**
 * @param {number} systemAddress
 * @param {number} bodyId
 * @param {string} nickname A blank/whitespace-only string clears the nickname (un-pins the body).
 */
export function setNickname(systemAddress, bodyId, nickname) {
  const all = getNicknames(systemAddress);
  const trimmed = nickname.trim();
  if (trimmed) {
    all[bodyId] = trimmed;
  } else {
    delete all[bodyId];
  }
  localStorage.setItem(storageKey(systemAddress), JSON.stringify(all));
}
