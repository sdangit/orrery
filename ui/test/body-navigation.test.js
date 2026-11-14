import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM, createBodyNavigation, navigationLabel } from '../src/body-navigation.js';

const tree = new Map([
  [0, { id: 0, kind: 'Star', parentId: null }],
  [1, { id: 1, kind: 'Planet', parentId: 0, elements: { semiMajorAxis: 9 } }],
  [2, { id: 2, kind: 'Barycentre', parentId: 0, elements: { semiMajorAxis: 3 } }],
  [3, { id: 3, kind: 'Planet', parentId: 2 }],
  [4, { id: 4, kind: 'Planet', parentId: 2 }],
]);
test('sibling navigation sorts by orbit size, wraps and preserves body ID zero', () => {
  const nav = createBodyNavigation(tree);
  assert.deepEqual(nav.children(SYSTEM), [0]);
  assert.deepEqual(nav.children(0), [2, 1]);
  assert.equal(nav.sibling(2, -1), 1);
  assert.equal(nav.sibling(1, 1), 2);
  assert.equal(nav.sibling(0, 1), 0);
  assert.deepEqual(nav.path(4), [SYSTEM, 0, 2, 4]);
  assert.equal(nav.parent(4), 2);
  assert.equal(nav.parent(0), SYSTEM);
  assert.deepEqual(new Set(nav.descendants(0)), new Set([1, 2, 3, 4]));
});
test('orphaned and cyclic data stays fully reachable without infinite ancestor walks', () => {
  const nodes = new Map([[1, {id:1,kind:'Planet',parentId:2}], [2, {id:2,kind:'Barycentre',parentId:1}],
    [3, {id:3,kind:'Planet',parentId:99}], [4, {id:4,kind:'Star',parentId:4}]]);
  const nav = createBodyNavigation(nodes);
  assert.equal(nav.descendants(SYSTEM).length, 4);
  for (const id of nodes.keys()) assert.ok(nav.path(id).length <= 5);
});
test('synthetic system roots collapse into System while orbital groups remain explicit', () => {
  const nav = createBodyNavigation(new Map([[0, {id:0,kind:'SystemBarycentre'}], [1,{id:1,kind:'Star',parentId:0}]]));
  assert.deepEqual(nav.path(1), [SYSTEM, 1]);
  assert.equal(navigationLabel({id:2,kind:'Barycentre',name:'Long system barycentre 2'}, 'Long system'), 'Orbital group 2');
});
