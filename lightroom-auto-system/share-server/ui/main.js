const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

let backendProc = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'share-server-settings.json');
}

function loadSettings() {
  const p = settingsPath();
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (_) {
    return {};
  }
}

function saveSettings(s) {
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s, null, 2), 'utf-8');
}

function ensureSecret(s) {
  if (s.secret && s.secret.trim()) return s.secret;
  s.secret = crypto.randomBytes(24).toString('base64url');
  saveSettings(s);
  return s.secret;
}

function backendExePath() {
  const p = path.join(process.resourcesPath, 'backend', 'selectra-share-server-backend.exe');
  if (fs.existsSync(p)) return p;
  const dev = path.resolve(__dirname, '..', 'dist', 'selectra-share-server-backend.exe');
  return fs.existsSync(dev) ? dev : null;
}

function startBackend() {
  if (backendProc && !backendProc.killed) return { ok: true, already: true };
  const exe = backendExePath();
  if (!exe) return { ok: false, error: 'backend exe not found' };

  const s = loadSettings();
  const secret = ensureSecret(s);
  const port = Number(s.port || 9000);

  backendProc = spawn(exe, [], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PHOTOAI_SHARE_SECRET: secret,
      PHOTOAI_SHARE_PORT: String(port)
    }
  });

  return { ok: true, port };
}

function stopBackend() {
  try {
    if (backendProc && !backendProc.killed) backendProc.kill();
  } catch (_) {}
  return { ok: true };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 460,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('index.html');
}

ipcMain.handle('settings:get', () => {
  const s = loadSettings();
  const secret = ensureSecret(s);
  return { ...s, secret, port: Number(s.port || 9000) };
});

ipcMain.handle('settings:save', (_e, payload) => {
  const s = loadSettings();
  s.secret = String(payload?.secret || '').trim();
  s.port = Number(payload?.port || 9000);
  saveSettings(s);
  return { ok: true };
});

ipcMain.handle('backend:start', () => startBackend());
ipcMain.handle('backend:stop', () => stopBackend());

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on('before-quit', () => { stopBackend(); });
