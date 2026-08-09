// WebSocket client for the watcher's local live feed. Reconnects with a
// fixed backoff so the UI keeps working standalone (on the bundled demo
// data) whether the watcher was never started, was started after the UI, or
// drops out mid-session (game closed, laptop slept, etc.) — none of those
// should ever be a hard error from the UI's point of view.

const DEFAULT_URL = 'ws://127.0.0.1:47821';
const RECONNECT_DELAY_MS = 2000;

/**
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {(snapshot: object) => void} [options.onSnapshot]
 * @param {(status: 'connected'|'disconnected') => void} [options.onStatusChange]
 * @returns {{ stop: () => void }}
 */
export function connectLive({ url = DEFAULT_URL, onSnapshot, onStatusChange } = {}) {
  let stopped = false;
  let socket = null;

  function connect() {
    if (stopped) return;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => onStatusChange?.('connected'));

    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.warn('orrery: malformed message from watcher, ignoring');
        return;
      }
      if (msg?.type === 'snapshot' && msg.snapshot) onSnapshot?.(msg.snapshot);
    });

    socket.addEventListener('close', () => {
      onStatusChange?.('disconnected');
      if (!stopped) setTimeout(connect, RECONNECT_DELAY_MS);
    });

    // A connection error (e.g. nothing listening on the port) fires 'close'
    // right after — no separate handling needed beyond not letting it throw.
    socket.addEventListener('error', () => {});
  }

  connect();

  return {
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
