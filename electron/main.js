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
//
// A packaged GUI app has no console a user will ever see, so any startup
// failure that isn't caught and shown via dialog.showErrorBox is a silent
// fail: the process just exits and nothing appears to happen at all.
const { app, BrowserWindow, dialog } = require('electron');
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
    title: `ORRERY v${app.getVersion()}`,
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Keep the app version visible in the title bar — the page's own <title>
  // would otherwise replace it on load. Debugging "which build is this
  // actually?" over chat is miserable without it; release assets got
  // replaced in place once and cost a whole round-trip to notice.
  mainWindow.on('page-title-updated', (event, title) => {
    event.preventDefault();
    mainWindow.setTitle(`${title} — v${app.getVersion()}`);
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
}

function fatal(title, err) {
  dialog.showErrorBox(title, (err && err.stack) || String(err));
  app.quit();
}

app.whenReady().then(async () => {
  try {
    const { startWatcherServer } = await import(pathToFileURL(resolve(watcherSrcDir, 'server.js')));
    const { defaultJournalDir } = await import(pathToFileURL(resolve(watcherSrcDir, 'journal-locator.js')));

    watcherServer = startWatcherServer({
      port: PORT,
      journalDir: defaultJournalDir(),
      distDir,
      // Wait for the server to actually be listening before opening the
      // window, rather than racing loadURL() against listen() — a race that
      // used to produce a blank/failed page instead of a clean start.
      onReady: createWindow,
      onError: (err) => {
        fatal(
          'ORRERY failed to start',
          new Error(`The local server couldn't bind to port ${PORT}: ${err.message}\n\nIs another copy of ORRERY already running? Close it (check Task Manager) and try again.`)
        );
      },
    });
  } catch (err) {
    fatal('ORRERY failed to start', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  watcherServer?.close();
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  fatal('ORRERY crashed', err);
});
