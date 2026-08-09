import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJournalLines, filterEvents, latestSystemContext } from '../src/journal-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleText = readFileSync(join(__dirname, 'fixtures', 'sample-journal.log'), 'utf8');

test('parseJournalLines parses every well-formed line', () => {
  const events = parseJournalLines(sampleText);
  assert.equal(events.length, 151);
  assert.equal(events[0].event, 'FSDJump');
  assert.ok(events.every((evt) => typeof evt.event === 'string'));
});

test('parseJournalLines skips a truncated trailing line without throwing', () => {
  const truncated = `${sampleText.trimEnd()}\n{ "timestamp":"2025-11-14T17:43:32Z", "event":"Fuel`;
  const events = parseJournalLines(truncated);
  assert.equal(events.length, 151);
});

test('parseJournalLines ignores blank lines', () => {
  const events = parseJournalLines('\n\n{"event":"A"}\n\n{"event":"B"}\n\n');
  assert.deepEqual(events.map((e) => e.event), ['A', 'B']);
});

test('filterEvents narrows to matching event names', () => {
  const events = parseJournalLines(sampleText);
  const scans = filterEvents(events, 'Scan');
  assert.equal(scans.length, 84);
  assert.ok(scans.every((evt) => evt.event === 'Scan'));

  const both = filterEvents(events, ['Scan', 'ScanBaryCentre']);
  assert.equal(both.length, 84 + 9);
});

test('latestSystemContext reads system name/address/pos off the FSDJump', () => {
  const events = parseJournalLines(sampleText);
  const ctx = latestSystemContext(events);
  assert.equal(ctx.starSystem, 'Col 285 Sector TI-U b18-2');
  assert.equal(ctx.systemAddress, 5064706368953);
  assert.deepEqual(ctx.starPos, [-317.90625, 107.65625, 47.59375]);
});

test('latestSystemContext returns null with no FSDJump/Location events', () => {
  assert.equal(latestSystemContext([{ event: 'Scan' }]), null);
});
