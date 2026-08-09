// A synthetic tree mirroring the real-data shapes body-tree.test.js (in
// watcher/) covers: a two-star root, a moon-of-a-moon chain, a barycentre-
// hosted moon pair, and an elements-less "belt cluster" style body. Shared
// across shared/'s own tests so they stay self-contained (no dependency on
// watcher's journal fixture).

export function elements(overrides) {
  return {
    semiMajorAxis: 1e9,
    eccentricity: 0.1,
    inclinationDeg: 5,
    periapsisDeg: 30,
    ascendingNodeDeg: 10,
    meanAnomalyDeg: 0,
    orbitalPeriodSec: 100000,
    epochMs: 0,
    ...overrides,
  };
}

export function buildSyntheticTree() {
  const nodes = new Map();
  nodes.set(0, { id: 0, parentId: null, elements: null }); // root
  nodes.set(1, { id: 1, parentId: 0, elements: elements({ semiMajorAxis: 5e12, meanAnomalyDeg: 40 }) }); // star
  nodes.set(2, { id: 2, parentId: 1, elements: elements({ semiMajorAxis: 4e9, meanAnomalyDeg: 80 }) }); // planet
  nodes.set(3, { id: 3, parentId: 2, elements: elements({ semiMajorAxis: 9e6, meanAnomalyDeg: 120 }) }); // moon of planet
  nodes.set(4, { id: 4, parentId: 1, elements: null }); // belt cluster, no elements
  // barycentre-hosted moon pair around planet 2
  nodes.set(5, { id: 5, parentId: 2, elements: elements({ semiMajorAxis: 9e8, meanAnomalyDeg: 200 }) }); // barycentre
  nodes.set(6, { id: 6, parentId: 5, elements: elements({ semiMajorAxis: 1.5e6, meanAnomalyDeg: 10 }) }); // moon A
  nodes.set(7, { id: 7, parentId: 5, elements: elements({ semiMajorAxis: 1.5e6, meanAnomalyDeg: 190 }) }); // moon B
  return nodes;
}
