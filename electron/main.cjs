// Electron shell. Starts the local API (unless a dev server is already running)
// and loads the built studio in a frameless-ish dark window.

const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const PORT = Number(process.env.FACELESS_PORT || 8787);
let serverProcess = null;
let win = null;

function waitForServer(url, timeoutMs = 25_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const request = http.get(`${url}/api/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve(true);
        retry();
      });
      request.on('error', retry);
      request.setTimeout(1500, () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('The local API did not start in time.'));
      setTimeout(tick, 400);
    };
    tick();
  });
}

function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  const fs = require('node:fs');
  const logFile = path.join(process.env.TEMP || 'C:\\\\temp', 'faceless-launch.log');
  fs.appendFileSync(logFile, `startServer: serverPath=${serverPath} exists=${fs.existsSync(serverPath)}\\n`);
  serverProcess = spawn(process.execPath, [serverPath, '--serve-build'], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      SERVE_BUILD: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    console.log(`[api] ${line}`);
    fs.appendFileSync(logFile, `[api] ${line}\\n`);
  });
  serverProcess.stderr.on('data', (data) => {
    const line = data.toString().trim();
    console.error(`[api] ${line}`);
    fs.appendFileSync(logFile, `[api-err] ${line}\\n`);
  });
  serverProcess.on('exit', (code) => {
    console.error(`Local API exited with ${code}`);
    fs.appendFileSync(logFile, `Local API exited with ${code}\\n`);
  });
  serverProcess.on('error', (err) => {
    console.error(`Spawn error: ${err.message}`);
    fs.appendFileSync(logFile, `Spawn error: ${err.message}\\n`);
  });
}

async function boot() {
  const devUrl = process.env.FACELESS_DEV_URL;
  const baseUrl = devUrl || `http://127.0.0.1:${PORT}`;

  if (!devUrl) {
    const dist = path.join(__dirname, '..', 'dist', 'index.html');
    if (!fs.existsSync(dist)) {
      dialog.showErrorBox(
        'Build the studio first',
        'The interface has not been built yet. Run "npm run build" in the project folder, then open the desktop app again.'
      );
      app.quit();
      return;
    }
    startServer();
    try {
      await waitForServer(baseUrl);
    } catch (error) {
      dialog.showErrorBox('Clipmax Pro could not start', `${error.message}\n\nTry running "npm run dev" in a terminal to see the server log.`);
      app.quit();
      return;
    }
  }

  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#0A0507',
    title: 'Clipmax Pro',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(baseUrl);
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});

app.on('before-quit', () => {
  // Server runs in-process; nothing to kill.
});
