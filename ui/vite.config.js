import { defineConfig } from 'vite';

// The watcher owns external lookups; the browser only talks to its own origin.
const proxy = { '/api/community-bodies': 'http://127.0.0.1:47821' };
export default defineConfig({ server: { proxy }, preview: { proxy } });
