import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCommunityBodies, mapEdgisBodies, absolutePosition } from '../src/index.js';

const { systems } = JSON.parse(readFileSync(new URL('./fixtures/asteroid-belts.json', import.meta.url)));
const belts = nodes => [...nodes.values()].filter(n => n.kind === 'AsteroidBelt');

test('real Sol and Shinrarta belts survive merging with matching EDSM km / Spansh metre radii', () => {
  for (const system of Object.values(systems)) {
    const sp = belts(mergeCommunityBodies(new Map(), { spansh: system.spansh }).nodes)[0];
    const ed = belts(mergeCommunityBodies(new Map(), { edsm: system.edsm }).nodes)[0];
    assert.equal(sp.raw.InnerRad, ed.raw.InnerRad);
    assert.equal(sp.raw.OuterRad, ed.raw.OuterRad);
    const { nodes } = mergeCommunityBodies(new Map(), system);
    assert.equal(belts(nodes).length, 1);
    const belt = belts(nodes)[0];
    assert.equal(belt.id, sp.id);
    assert.equal(belt.id, ed.id);
    assert.ok(nodes.get(belt.parentId).children.includes(belt.id));
    assert.deepEqual(absolutePosition(nodes, belt.id, 0), absolutePosition(nodes, belt.parentId, 0));
  }
});

test('Sol belt lies outside Mars and inside Jupiter at their orbital extremes', () => {
  const { nodes } = mergeCommunityBodies(new Map(), systems.Sol);
  const belt = belts(nodes)[0].raw;
  const mars = [...nodes.values()].find(n => n.name === 'Mars').elements;
  const jupiter = [...nodes.values()].find(n => n.name === 'Jupiter').elements;
  assert.ok(belt.InnerRad > mars.semiMajorAxis * (1 + mars.eccentricity));
  assert.ok(belt.OuterRad < jupiter.semiMajorAxis * (1 - jupiter.eccentricity));
});

test('EDGIS identifies a belt without invented extent; lower-priority EDSM fills its measurements', () => {
  const system = systems['Shinrarta Dezhra'];
  const edgis = { bodies: mapEdgisBodies(system.edgisRecords) };
  const first = belts(mergeCommunityBodies(new Map(), { edgis }).nodes)[0];
  assert.equal(first.raw.InnerRad, undefined);
  const merged = belts(mergeCommunityBodies(new Map(), { edgis, edsm: system.edsm }).nodes)[0];
  assert.equal(merged.id, first.id);
  assert.equal(merged.raw.InnerRad, 879730000);
  assert.equal(merged.raw.OuterRad, 2186700000);
  assert.equal(merged.raw.RingClass, 'eRingClass_Rocky');
});

test('journal Rings belts merge once with community belts, preserve source priority and leave input unchanged', () => {
  const star = { id: 0, name: 'Sol', kind: 'Star', parentId: null, children: [], raw: {
    Rings: [{ Name: 'Asteroid Belt', RingClass: 'eRingClass_Rocky', InnerRad: 3e11, OuterRad: 5e11 }],
  } };
  const before = JSON.stringify(star);
  const { nodes } = mergeCommunityBodies(new Map([[0, star]]), systems.Sol);
  const [belt] = belts(nodes);
  assert.equal(belts(nodes).length, 1);
  assert.equal(belt.raw.InnerRad, 3e11);
  assert.equal(belt.isBackfill, false);
  assert.deepEqual(belt.sources, ['journal', 'spansh', 'edsm']);
  assert.equal(JSON.stringify(star), before);
});
