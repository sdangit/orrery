// CLI entry point for `npm start`: reads config from env vars and starts the
// server. The actual HTTP/WebSocket/polling wiring lives in src/server.js so
// the Electron shell (electron/main.js) can start the same server in-process
// without shelling out to this script.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWatcherServer } from '../src/server.js';
import { defaultJournalDir } from '../src/journal-locator.js';

const POLL_INTERVAL_MS = Number(process.env.ORRERY_POLL_INTERVAL_MS) || 1000;
const PORT = Number(process.env.ORRERY_WS_PORT) || 47821;
const journalDir = defaultJournalDir();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', '..', 'ui', 'dist');

const server = startWatcherServer({ port: PORT, journalDir, distDir: DIST_DIR, pollIntervalMs: POLL_INTERVAL_MS });

process.on('SIGINT', () => {
  console.log('\n[orrery-watcher] shutting down');
  server.close();
  process.exit(0);
});
