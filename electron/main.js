// Desktop shell for people who don't want Node or a terminal: same watcher
// server as `npm start`, running in-process instead of as a separate CLI,
// loaded into a native window instead of a browser tab.
//
// CommonJS, not ESM — Electron's main-process ESM support (as of Electron 33)
// throws inside its own module loader (cjsPreparseModuleExports) before our
// code even runs. watcher/src is still ESM to match the rest of the
// codebase, so it's loaded here via dynamic import(), which works fine from
// a CJS file.
//
// In dev this imports straight from the workspace (../watcher/src). Packaged
// builds don't ship node_modules workspace symlinks, so electron-builder's
// extraResources config (see package.json) copies watcher/src, ui/dist and
// the `ws` dependency into resources/ instead, and this resolves paths under
// process.resourcesPath at runtime. Node's own module resolution then finds
// resources/node_modules/ws from resources/watcher-src/server.js the same
// way it would find a sibling node_modules in dev.
const { app, BrowserWindow } = require('electron');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const PORT = 47821;

const watcherSrcDir = app.isPackaged
  ? resolve(process.resourcesPath, 'watcher-src')
  : resolve(__dirname, '..', 'watcher', 'src');
const distDir = app.isPackaged
  ? resolve(process.resourcesPath, 'ui-dist')
  : resolve(__dirname, '..', 'ui', 'dist');

let watcherServer;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'ORRERY',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(async () => {
  const { startWatcherServer } = await import(pathToFileURL(resolve(watcherSrcDir, 'server.js')));
  const { defaultJournalDir } = await import(pathToFileURL(resolve(watcherSrcDir, 'journal-locator.js')));

  watcherServer = startWatcherServer({
    port: PORT,
    journalDir: defaultJournalDir(),
    distDir,
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  watcherServer?.close();
  if (process.platform !== 'darwin') app.quit();
});
