// Live watcher process: tails the newest ED journal, pushes system snapshots
// to any connected UI over a local-only WebSocket — and, when the UI has been
// built (ui/dist exists), serves it statically on the same port, so end users
// need exactly one process and one URL (http://127.0.0.1:47821). Developers
// can still run the Vite dev server alongside instead; the UI connects to
// this port's websocket either way.
//
// Everything that can be unit-tested lives in src/live-watcher.js; this file
// is the timer + HTTP/WebSocket wiring around it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createLiveWatcher } from '../src/live-watcher.js';
import { defaultJournalDir } from '../src/journal-locator.js';

const POLL_INTERVAL_MS = Number(process.env.ORRERY_POLL_INTERVAL_MS) || 1000;
const PORT = Number(process.env.ORRERY_WS_PORT) || 47821;
const journalDir = defaultJournalDir();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', '..', 'ui', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Static file serving with a strict containment check: the resolved path must
// stay inside DIST_DIR, so no crafted URL (`..%2f` etc.) can read outside it.
async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (!existsSync(DIST_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('UI not built yet. Run: npm run build --workspace=ui  (or use the Vite dev server on :5173)');
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const requested = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const filePath = resolve(DIST_DIR, requested);
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const contents = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    res.end(contents);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

console.log(`[orrery-watcher] journal dir: ${journalDir}`);

const watcher = createLiveWatcher(journalDir);
const httpServer = createServer(serveStatic);
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[orrery-watcher] websocket + UI on http://127.0.0.1:${PORT}`);
  if (!existsSync(DIST_DIR)) {
    console.log('[orrery-watcher] (UI not built — run `npm run build --workspace=ui` to serve it here, or use the Vite dev server)');
  }
});

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
  httpServer.close();
  process.exit(0);
});
