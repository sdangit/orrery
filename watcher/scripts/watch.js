// Live watcher process: tails the newest ED journal, pushes system snapshots
// to any connected UI over a local-only WebSocket. Run alongside `npm run
// dev --workspace=ui` — this is the "npm run dev + a local watcher" v1
// architecture from the handover doc, not a background service.
//
// Everything that can be unit-tested lives in src/live-watcher.js; this file
// is just the timer + WebSocket wiring around it.

import { WebSocketServer } from 'ws';
import { createLiveWatcher } from '../src/live-watcher.js';
import { defaultJournalDir } from '../src/journal-locator.js';

const POLL_INTERVAL_MS = Number(process.env.ORRERY_POLL_INTERVAL_MS) || 1000;
const PORT = Number(process.env.ORRERY_WS_PORT) || 47821;
const journalDir = defaultJournalDir();

console.log(`[orrery-watcher] journal dir: ${journalDir}`);

const watcher = createLiveWatcher(journalDir);
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

console.log(`[orrery-watcher] listening on ws://127.0.0.1:${PORT}`);

function broadcast(snapshot) {
  const payload = JSON.stringify({ type: 'snapshot', snapshot });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

wss.on('connection', (socket) => {
  console.log('[orrery-watcher] UI connected');
  const snapshot = watcher.model.snapshot();
  if (snapshot) {
    socket.send(JSON.stringify({ type: 'snapshot', snapshot }));
  }
  socket.on('close', () => console.log('[orrery-watcher] UI disconnected'));
});

let lastJournalPath = null;
setInterval(() => {
  let result;
  try {
    result = watcher.poll();
  } catch (err) {
    console.error('[orrery-watcher] poll error:', err.message);
    return;
  }

  if (result.journalPath !== lastJournalPath) {
    lastJournalPath = result.journalPath;
    console.log(`[orrery-watcher] tailing ${result.journalPath}`);
  }

  if (result.changed && result.snapshot) {
    console.log(`[orrery-watcher] system: ${result.snapshot.systemName} (${result.snapshot.nodes.length} bodies)`);
    broadcast(result.snapshot);
  }
}, POLL_INTERVAL_MS);

process.on('SIGINT', () => {
  console.log('\n[orrery-watcher] shutting down');
  wss.close();
  process.exit(0);
});
