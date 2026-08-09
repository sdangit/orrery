import { compressRadius } from '@orrery/shared';

// Real ED star types, mapped to roughly their real visual color (blue-white
// hot end to red cool end). Falls back to a neutral amber for exotic/unlisted
// classes rather than guessing.
const STAR_COLORS = {
  O: 0x9bb0ff, B: 0xaabfff, A: 0xcad7ff, F: 0xf8f7ff,
  G: 0xfff4ea, K: 0xffd2a1, M: 0xffb56c,
  L: 0xff8c5a, T: 0xcc6b52, Y: 0x8a4a3c,
  D: 0xdfe9ff, // white dwarfs
  N: 0xb0e0ff, // neutron stars
  H: 0x1a0a12, // black holes
};

// Real ED planet classes seen in practice. Anything not listed here (there
// are ~20+ classes) falls back to a neutral grey rather than guessing.
const PLANET_COLORS = {
  'Icy body': 0xcfe8f5,
  'Rocky ice body': 0x9fb3c8,
  'Rocky body': 0x8a7866,
  'High metal content body': 0xb08060,
  'Metal rich body': 0xd99a5b,
  'Earthlike body': 0x4f9bd6,
  'Water world': 0x3f7fc9,
  'Ammonia world': 0xb7c65a,
  'Water giant': 0x5c8fd6,
  'Sudarsky class I gas giant': 0x7fa8c9,
  'Sudarsky class II gas giant': 0xe0c493,
  'Sudarsky class III gas giant': 0xd9a066,
  'Sudarsky class IV gas giant': 0xc97a5a,
  'Sudarsky class V gas giant': 0x8a5a7a,
  'Gas giant with water based life': 0x6fa8b0,
  'Gas giant with ammonia based life': 0x9ab06f,
};

const DEFAULT_STAR_COLOR = 0xffc46b;
const DEFAULT_PLANET_COLOR = 0x8a8a8a;

/** @param {string} [starType] e.g. "M", "K", "DA" — matched by first letter. */
export function starColor(starType) {
  if (!starType) return DEFAULT_STAR_COLOR;
  return STAR_COLORS[starType[0].toUpperCase()] ?? DEFAULT_STAR_COLOR;
}

/** @param {string} [planetClass] */
export function planetColor(planetClass) {
  if (!planetClass) return DEFAULT_PLANET_COLOR;
  return PLANET_COLORS[planetClass] ?? DEFAULT_PLANET_COLOR;
}

const STAR_RADIUS_OPTIONS = { minDisplay: 1.2, scaleMetres: 3e8, gain: 1.3 };
const PLANET_RADIUS_OPTIONS = { minDisplay: 0.35, scaleMetres: 3e6, gain: 0.7 };

/**
 * Display-unit sphere radius for a body, tuned separately for stars vs
 * planets/moons so a star doesn't visually swallow its own system and a
 * small moon doesn't disappear.
 * @param {{kind: string, raw?: {Radius?: number}}} node
 */
export function bodyDisplayRadius(node) {
  const realRadius = node.raw?.Radius;
  if (!(realRadius > 0)) return 0.3;
  return node.kind === 'Star'
    ? compressRadius(realRadius, STAR_RADIUS_OPTIONS)
    : compressRadius(realRadius, PLANET_RADIUS_OPTIONS);
}

/** @param {{kind: string, raw?: {StarType?: string, PlanetClass?: string}}} node */
export function bodyColor(node) {
  if (node.kind === 'Star') return starColor(node.raw?.StarType);
  if (node.kind === 'Planet') return planetColor(node.raw?.PlanetClass);
  return 0x666666;
}
