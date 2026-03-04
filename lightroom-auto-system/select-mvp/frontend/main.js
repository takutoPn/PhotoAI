const { app, BrowserWindow, ipcMain, dialog } = require('electron');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

let backendProc = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // ファイルドロップ時にElectronがページ遷移してD&Dを潰すのを防止
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile('index.html');
}

function findLightroomExe() {
  const candidates = [
    'C:/Program Files/Adobe/Adobe Lightroom Classic/Lightroom.exe',
    'C:/Program Files/Adobe/Adobe Photoshop Lightroom Classic/Lightroom.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveBackendDir() {
  // 開発時: ../backend
  const devDir = path.resolve(__dirname, '..', 'backend');
  if (fs.existsSync(path.join(devDir, 'app', 'main.py'))) return devDir;

  // パッケージ後: resources/backend
  const prodDir = path.join(process.resourcesPath, 'backend');
  if (fs.existsSync(path.join(prodDir, 'app', 'main.py'))) return prodDir;

  return null;
}

function pickPythonCommand() {
  if (process.env.PHOTOAI_PYTHON_PATH) {
    return { cmd: process.env.PHOTOAI_PYTHON_PATH, args: [] };
  }
  // Windows想定: pyランチャ優先
  return { cmd: 'py', args: ['-3'] };
}

function ensureLearningKey(env) {
  if (env.PHOTOAI_LEARNING_KEY && env.PHOTOAI_LEARNING_KEY.trim()) return env.PHOTOAI_LEARNING_KEY;
  const key = crypto.randomBytes(32).toString('base64');
  env.PHOTOAI_LEARNING_KEY = key;
  return key;
}

function ensureBackendDependencies(py, backendDir) {
  const marker = path.join(app.getPath('userData'), 'backend_deps.ok');
  if (fs.existsSync(marker)) return true;

  const req = path.join(backendDir, 'requirements.txt');
  if (!fs.existsSync(req)) return false;

  const pipArgs = [...py.args, '-m', 'pip', 'install', '-r', req];
  const r = spawnSync(py.cmd, pipArgs, {
    cwd: backendDir,
    windowsHide: true,
    stdio: 'ignore',
    timeout: 1000 * 60 * 5,
  });
  if (r.status === 0) {
    try { fs.writeFileSync(marker, 'ok'); } catch (_) {}
    return true;
  }
  return false;
}

function waitHealth(timeoutMs = 12000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get('http://127.0.0.1:8008/health', (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          if (Date.now() - start > timeoutMs) return resolve(false);
          setTimeout(tick, 500);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 500);
      });
      req.setTimeout(1500, () => req.destroy());
    };
    tick();
  });
}

async function ensureBackend() {
  if (await waitHealth(1200)) return true; // 既に起動済み

  const backendDir = resolveBackendDir();
  if (!backendDir) {
    dialog.showErrorBox('Selectra AI', 'バックエンドファイルが見つかりません。再インストールしてください。');
    return false;
  }

  const py = pickPythonCommand();
  const env = { ...process.env };
  ensureLearningKey(env);

  const depsOk = ensureBackendDependencies(py, backendDir);
  if (!depsOk) {
    dialog.showErrorBox('Selectra AI', 'バックエンド依存関係のインストールに失敗しました。ネット接続とPythonを確認してください。');
    return false;
  }

  const args = [...py.args, '-m', 'uvicorn', '--app-dir', backendDir, 'app.main:app', '--host', '127.0.0.1', '--port', '8008'];
  backendProc = spawn(py.cmd, args, {
    cwd: backendDir,
    env,
    windowsHide: true,
    stdio: 'ignore',
  });

  const ok = await waitHealth(15000);
  if (!ok) {
    dialog.showErrorBox('Selectra AI', 'バックエンド起動に失敗しました。Python(3.12+) のインストールを確認してください。');
  }
  return ok;
}

ipcMain.handle('open-lightroom', async (_evt, catalogPath) => {
  const exe = findLightroomExe();
  if (!exe) {
    return { ok: false, error: 'Lightroom executable not found in default paths' };
  }

  try {
    spawn(exe, [catalogPath], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

app.whenReady().then(async () => {
  await ensureBackend();
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try {
    if (backendProc && !backendProc.killed) backendProc.kill();
  } catch (_) {}
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
