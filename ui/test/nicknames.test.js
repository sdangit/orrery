import './dom-shim.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getNickname, getNicknames, setNickname } from '../src/nicknames.js';

beforeEach(() => {
  localStorage.clear();
});

test('getNickname returns null for a body with no nickname set', () => {
  assert.equal(getNickname(1, 39), null);
});

test('setNickname then getNickname round-trips', () => {
  setNickname(1, 39, 'money moon');
  assert.equal(getNickname(1, 39), 'money moon');
});

test('nicknames are scoped per systemAddress — the same bodyId in a different system is independent', () => {
  setNickname(1, 39, 'money moon');
  assert.equal(getNickname(2, 39), null);
});

test('setNickname with a blank string clears an existing nickname', () => {
  setNickname(1, 39, 'money moon');
  setNickname(1, 39, '   ');
  assert.equal(getNickname(1, 39), null);
});

test('leading/trailing whitespace is trimmed when saving', () => {
  setNickname(1, 39, '  money moon  ');
  assert.equal(getNickname(1, 39), 'money moon');
});

test('getNicknames returns every pinned body for a system as one object', () => {
  setNickname(1, 39, 'money moon');
  setNickname(1, 50, 'ring world');
  assert.deepEqual(getNicknames(1), { 39: 'money moon', 50: 'ring world' });
});

test('getNicknames returns an empty object for a system with nothing pinned', () => {
  assert.deepEqual(getNicknames(999), {});
});

test('malformed data already in storage is treated as no nicknames, not a throw', () => {
  localStorage.setItem('orrery.nicknames.1', 'not valid json{{{');
  assert.doesNotThrow(() => getNicknames(1));
  assert.deepEqual(getNicknames(1), {});
});
