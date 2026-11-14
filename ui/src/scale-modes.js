export const METRES_PER_UNIT = 1e9;
export const SCALE_MODES = {
  compact: { trueDistances: false, trueSizes: false, description: 'Compressed distances · exaggerated sizes' },
  distances: { trueDistances: true, trueSizes: false, description: 'True distances · exaggerated sizes' },
  realistic: { trueDistances: true, trueSizes: true, description: 'True distances and sizes · markers not to scale' },
};

export function resolveScaleMode(saved, legacyTrueScale = null) {
  if (Object.hasOwn(SCALE_MODES, saved)) return saved;
  return legacyTrueScale === 'true' ? 'distances' : 'compact';
}

export function scaleSettings(mode) {
  return SCALE_MODES[resolveScaleMode(mode)];
}
