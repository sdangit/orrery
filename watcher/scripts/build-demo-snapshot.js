// Builds ui/'s bundled demo system snapshot from the real (scrubbed) journal
// fixture. This is the "runs standalone with a bundled demo system JSON"
// path from the design brief: the UI never needs a live watcher connection
// (or the game running) to render something real.
//
// Run with: npm run build:demo-snapshot --workspace=watcher

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJournalLines } from '../src/journal-parser.js';
import { buildBodyTree } from '../src/body-tree.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'test', 'fixtures', 'sample-journal.log');
const OUTPUT_PATH = join(__dirname, '..', '..', 'ui', 'src', 'data', 'demo-system.json');

const SYSTEM_ADDRESS = 5064706368953;
const SYSTEM_NAME = 'Col 285 Sector TI-U b18-2';

const sampleText = readFileSync(FIXTURE_PATH, 'utf8');
const events = parseJournalLines(sampleText);
const { rootId, nodes, orphans } = buildBodyTree(events, {
  systemAddress: SYSTEM_ADDRESS,
  systemName: SYSTEM_NAME,
});

if (orphans.length > 0) {
  throw new Error(`Refusing to write a demo snapshot with orphaned bodies: ${orphans.join(', ')}`);
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  sourceFixture: 'watcher/test/fixtures/sample-journal.log',
  systemName: SYSTEM_NAME,
  systemAddress: SYSTEM_ADDRESS,
  rootId,
  nodes: [...nodes.values()],
};

writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${nodes.size} nodes to ${OUTPUT_PATH}`);
