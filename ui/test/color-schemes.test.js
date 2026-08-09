import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_SCHEMES, DEFAULT_SCHEME, applyColorScheme } from '../src/color-schemes.js';

function fakeRoot() {
  const set = new Map();
  return {
    style: { setProperty: (k, v) => set.set(k, v) },
    set,
  };
}

test('every scheme defines the same complete set of CSS variables', () => {
  const expectedKeys = Object.keys(COLOR_SCHEMES[DEFAULT_SCHEME].vars).sort();
  for (const [name, scheme] of Object.entries(COLOR_SCHEMES)) {
    assert.deepEqual(Object.keys(scheme.vars).sort(), expectedKeys, `scheme "${name}" is missing variables`);
    assert.ok(scheme.accent.startsWith('#'), `scheme "${name}" needs a hex accent`);
    assert.ok(scheme.label.length > 0);
  }
});

test('applyColorScheme sets every variable of the requested scheme', () => {
  const root = fakeRoot();
  const applied = applyColorScheme('ice', root);
  assert.equal(applied.name, 'ice');
  assert.equal(root.set.get('--hud-orange'), COLOR_SCHEMES.ice.vars['--hud-orange']);
  assert.equal(root.set.size, Object.keys(COLOR_SCHEMES.ice.vars).length);
});

test('an unknown scheme name falls back to the default rather than throwing or half-applying', () => {
  const root = fakeRoot();
  const applied = applyColorScheme('definitely-not-a-scheme', root);
  assert.equal(applied.name, DEFAULT_SCHEME);
  assert.equal(root.set.get('--hud-orange'), COLOR_SCHEMES[DEFAULT_SCHEME].vars['--hud-orange']);
});

test('applied accent matches the scheme accent (fed to the 3D label color)', () => {
  const root = fakeRoot();
  assert.equal(applyColorScheme('viridian', root).accent, COLOR_SCHEMES.viridian.accent);
});
