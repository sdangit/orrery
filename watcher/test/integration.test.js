// Proves the watcher's body tree wires correctly into @orrery/shared's
// position math end-to-end, using the real (scrubbed) journal fixture. The
// two packages' own unit tests cover their internals in isolation — this is
// the seam between them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJournalLines } from '../src/journal-parser.js';
import { buildBodyTree } from '../src/body-tree.js';
import { absolutePosition, absolutePositions } from '@orrery/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleText = readFileSync(join(__dirname, 'fixtures', 'sample-journal.log'), 'utf8');
const sampleEvents = parseJournalLines(sampleText);
const tree = buildBodyTree(sampleEvents, { systemAddress: 5064706368953, systemName: 'Col 285 Sector TI-U b18-2' });

test('every real body in the tree resolves to a finite, non-NaN absolute position', () => {
  const now = Date.now();
  const positions = absolutePositions(tree.nodes, now);
  assert.equal(positions.size, tree.nodes.size);
  for (const [id, pos] of positions) {
    assert.ok(Number.isFinite(pos.x), `x for body ${id}`);
    assert.ok(Number.isFinite(pos.y), `y for body ${id}`);
    assert.ok(Number.isFinite(pos.z), `z for body ${id}`);
  }
});

test('the wide binary companion star sits far from the primary (real separation, not a parsing artifact)', () => {
  const now = Date.now();
  const primary = absolutePosition(tree.nodes, 1, now);
  const companion = absolutePosition(tree.nodes, 2, now);
  const separationMetres = Math.hypot(
    primary.x - companion.x,
    primary.y - companion.y,
    primary.z - companion.z,
  );
  // This system's B star is documented in the journal at ~72,914 ls from arrival
  // (see the moon "B 6 a" DistanceFromArrivalLS in the fixture) — tens of AU at least.
  const oneAuInMetres = 1.495978707e11;
  assert.ok(separationMetres > 10 * oneAuInMetres, `separation was only ${separationMetres / oneAuInMetres} AU`);
});
