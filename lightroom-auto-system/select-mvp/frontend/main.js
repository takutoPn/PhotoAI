const { app, BrowserWindow, ipcMain } = require('electron');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
