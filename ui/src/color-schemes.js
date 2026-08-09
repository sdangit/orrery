// HUD color-scheme presets (milestone 7, per Terje). Each scheme redefines
// the accent family (the CSS custom properties driving panel borders, labels,
// and controls) plus the body text color; the semantic colors — cyan for data
// values/selection, amber for highlights, red for warnings — stay constant so
// their meaning never shifts underneath the scheme. `accent` is also fed to
// the 3D scene as its ordinary-body label color, so the scene matches the HUD.

export const COLOR_SCHEMES = {
  ember: {
    label: 'Ember',
    accent: '#ff8a2a',
    vars: {
      '--hud-orange': '#ff8a2a',
      '--hud-orange-dim': '#7a4a1e',
      '--hud-orange-faint': '#3a220e',
      '--text': '#f5d9b8',
    },
  },
  ice: {
    label: 'Ice',
    accent: '#4fc3f7',
    vars: {
      '--hud-orange': '#4fc3f7',
      '--hud-orange-dim': '#28607c',
      '--hud-orange-faint': '#122c3a',
      '--text': '#cde9f7',
    },
  },
  viridian: {
    label: 'Viridian',
    accent: '#57d98a',
    vars: {
      '--hud-orange': '#57d98a',
      '--hud-orange-dim': '#2b6b45',
      '--hud-orange-faint': '#123020',
      '--text': '#cdf2dc',
    },
  },
  amethyst: {
    label: 'Amethyst',
    accent: '#b98af7',
    vars: {
      '--hud-orange': '#b98af7',
      '--hud-orange-dim': '#5b447c',
      '--hud-orange-faint': '#2a1f3a',
      '--text': '#e5d9f5',
    },
  },
};

export const DEFAULT_SCHEME = 'ember';

/**
 * @param {string} name A key of COLOR_SCHEMES; anything unknown falls back to the default.
 * @param {{style: {setProperty: (k: string, v: string) => void}}} [rootElement] Defaults to document.documentElement; injectable for tests.
 * @returns {{name: string, accent: string}} The scheme actually applied.
 */
export function applyColorScheme(name, rootElement = document.documentElement) {
  const schemeName = Object.hasOwn(COLOR_SCHEMES, name) ? name : DEFAULT_SCHEME;
  const scheme = COLOR_SCHEMES[schemeName];
  for (const [property, value] of Object.entries(scheme.vars)) {
    rootElement.style.setProperty(property, value);
  }
  return { name: schemeName, accent: scheme.accent };
}
