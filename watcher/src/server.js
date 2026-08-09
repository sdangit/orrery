// The watcher server: tails the newest ED journal on a timer and pushes
// system snapshots to any connected UI over a local-only WebSocket — and,
// when a built UI exists at distDir, serves it statically on the same port,
// so a consumer needs exactly one process and one URL. Split out of
// scripts/watch.js so the Electron shell (electron/main.js) can start the
// same server in-process instead of shelling out to a CLI script.
//
// Everything that can be unit-tested lives in live-watcher.js; this file is
// the timer + HTTP/WebSocket wiring around it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { createLiveWatcher } from './live-watcher.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * @param {object} options
 * @param {number} [options.port]
 * @param {string} options.journalDir
 * @param {string} options.distDir Built UI to serve statically; a 503 with instructions is served if it doesn't exist yet.
 * @param {number} [options.pollIntervalMs]
 * @param {(msg: string) => void} [options.log]
 * @param {(msg: string) => void} [options.logError]
 * @returns {{ close: () => void, port: number }}
 */
export function startWatcherServer({
  port = 47821,
  journalDir,
  distDir,
  pollIntervalMs = 1000,
  log = console.log,
  logError = console.error,
} = {}) {
  // Static file serving with a strict containment check: the resolved path
  // must stay inside distDir, so no crafted URL (`..%2f` etc.) can read
  // outside it.
  async function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (!existsSync(distDir)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('UI not built yet. Run: npm run build --workspace=ui  (or use the Vite dev server on :5173)');
      return;
    }
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const requested = urlPath === '/' ? 'index.html' : urlPath.slice(1);
    const filePath = resolve(distDir, requested);
    if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
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

  log(`[orrery-watcher] journal dir: ${journalDir}`);

  const watcher = createLiveWatcher(journalDir);
  const httpServer = createServer(serveStatic);
  const wss = new WebSocketServer({ server: httpServer });
  httpServer.listen(port, '127.0.0.1', () => {
    log(`[orrery-watcher] websocket + UI on http://127.0.0.1:${port}`);
    if (!existsSync(distDir)) {
      log('[orrery-watcher] (UI not built — run `npm run build --workspace=ui` to serve it here, or use the Vite dev server)');
    }
  });

  function broadcast(snapshot) {
    const payload = JSON.stringify({ type: 'snapshot', snapshot });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }

  wss.on('connection', (socket) => {
    log('[orrery-watcher] UI connected');
    const snapshot = watcher.model.snapshot();
    if (snapshot) {
      socket.send(JSON.stringify({ type: 'snapshot', snapshot }));
    }
    socket.on('close', () => log('[orrery-watcher] UI disconnected'));
  });

  let lastJournalPath = null;
  const interval = setInterval(() => {
    let result;
    try {
      result = watcher.poll();
    } catch (err) {
      logError(`[orrery-watcher] poll error: ${err.message}`);
      return;
    }

    if (result.journalPath !== lastJournalPath) {
      lastJournalPath = result.journalPath;
      log(`[orrery-watcher] tailing ${result.journalPath}`);
    }

    if (result.changed && result.snapshot) {
      log(`[orrery-watcher] system: ${result.snapshot.systemName} (${result.snapshot.nodes.length} bodies)`);
      broadcast(result.snapshot);
    }
  }, pollIntervalMs);

  function close() {
    clearInterval(interval);
    wss.close();
    httpServer.close();
  }

  return { close, port };
}
