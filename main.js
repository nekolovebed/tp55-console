'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Tp55Device } = require('./lib/device');
const { SysInfo } = require('./lib/sysinfo');
const { KeepAlive } = require('./lib/keepalive');

let win = null;
let device = new Tp55Device();
let autoTimer = null;
let sysInfo = new SysInfo();
let keepAlive = new KeepAlive();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function status() {
  return {
    connected: device.connected,
    info: device.info,
    version: device.version,
  };
}

function broadcastStatus(extra) {
  send('device:event', { type: 'status', ...status(), ...(extra || {}) });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1300,
    height: 980,
    minWidth: 1040,
    minHeight: 720,
    frame: false,
    backgroundColor: '#0a0c10',
    show: false,
    title: 'EPZ TP55 Console',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  if (process.env.TP55_SHOT) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.TP55_EVAL) {
            const evalResult = await win.webContents.executeJavaScript(process.env.TP55_EVAL, true);
            if (evalResult !== undefined && process.env.TP55_SHOT) {
              fs.writeFileSync(process.env.TP55_SHOT + ".out.txt", typeof evalResult === "string" ? evalResult : JSON.stringify(evalResult, null, 2));
            }
            await new Promise((r) => setTimeout(r, 700));
          }
          const img = await win.webContents.capturePage(
            process.env.TP55_RECT
              ? (() => {
                  const [x, y, width, height] = process.env.TP55_RECT.split(',').map(Number);
                  return { x, y, width, height };
                })()
              : undefined
          );
          fs.writeFileSync(process.env.TP55_SHOT, img.toPNG());
        } catch (e) {
          console.error('screenshot failed', e);
        }
        app.quit();
      }, 3000);
    });
  }
  win.on('closed', () => {
    win = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function tryConnect() {
  if (device.connected) return true;
  const ok = device.connect();
  broadcastStatus({ justConnected: ok });
  return ok;
}

function startAutoConnect() {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    if (!device.connected) {
      const ok = device.connect();
      if (ok) {
        broadcastStatus({ justConnected: true });
        setTimeout(() => {
          try {
            device.readVersion();
          } catch (e) {
            /* ignore */
          }
        }, 150);
      }
    }
  }, 2000);
}

device.on('connected', () => {
  broadcastStatus({ justConnected: true });
  setTimeout(() => {
    try {
      device.readVersion();
      device.readDacState();
      device.readMicGain();
    } catch (e) {
      /* ignore */
    }
  }, 250);
});
device.on('disconnected', () => broadcastStatus({ justConnected: false }));
device.on('status', (s) => send('device:event', { type: 'status', ...s }));
device.on('version', (v) => send('device:event', { type: 'version', version: v }));
device.on('dacState', (s) => send('device:event', { type: 'dacState', state: s }));
device.on('micState', (v) => send('device:event', { type: 'micState', value: v }));
device.on('band', (b) => send('device:event', { type: 'band', band: b }));
device.on('error', (e) => send('device:event', { type: 'error', message: String(e && e.message ? e.message : e) }));

sysInfo.on('update', (info) => send('device:event', { type: 'sysinfo', info }));

app.whenReady().then(() => {
  createWindow();
  setTimeout(tryConnect, 400);
  startAutoConnect();
  sysInfo.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (autoTimer) clearInterval(autoTimer);
  try {
    device.disconnect();
  } catch (e) {
    /* ignore */
  }
  try {
    sysInfo.stop();
  } catch (e) {
    /* ignore */
  }
  try {
    keepAlive.stop();
  } catch (e) {
    /* ignore */
  }
});

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.handle('sys:info', () => sysInfo.get());

ipcMain.handle('keepalive:status', () => keepAlive.status());

ipcMain.handle('keepalive:start', () => {
  try {
    keepAlive.start();
    return { ok: true, ...keepAlive.status() };
  } catch (e) {
    return { ok: false, error: String(e.message || e), ...keepAlive.status() };
  }
});

ipcMain.handle('keepalive:stop', () => {
  keepAlive.stop();
  return { ok: true, ...keepAlive.status() };
});

ipcMain.handle('device:status', () => status());

ipcMain.handle('device:connect', () => {
  const ok = tryConnect();
  return { ...status(), ok };
});

ipcMain.handle('device:disconnect', () => {
  device.disconnect();
  broadcastStatus();
  return status();
});

ipcMain.handle('device:readVersion', () => {
  device.readVersion();
  return true;
});

ipcMain.handle('eq:preview', (e, { bands, offset, tag }) => {
  if (!device.connected) throw new Error('设备未连接');
  device.applyBands(bands, offset, tag || 1);
  return true;
});

ipcMain.handle('eq:save', async (e, { bands, offset, tag }) => {
  if (!device.connected) throw new Error('设备未连接');
  const ok = await device.saveBands(bands, offset, tag || 1);
  return ok;
});

ipcMain.handle('eq:reset', () => {
  if (!device.connected) throw new Error('设备未连接');
  device.resetEq();
  return true;
});

ipcMain.handle('mic:set', (e, { gain }) => {
  if (!device.connected) throw new Error('设备未连接');
  device.setMicGain(gain);
  return true;
});

ipcMain.handle('mic:save', () => {
  if (!device.connected) throw new Error('设备未连接');
  device.saveMicGain();
  return true;
});

ipcMain.handle('dac:set', (e, { key, value }) => {
  if (!device.connected) throw new Error('设备未连接');
  switch (key) {
    case 'filter':
      device.setFilter(value);
      break;
    case 'filterMode':
      device.setFilterMode(value);
      break;
    case 'outputMode':
      device.setOutputMode(value);
      break;
    case 'gain':
      device.setDacGain(value);
      break;
    case 'balance':
      device.setBalance(value.left || 0, value.right || 0);
      break;
    default:
      throw new Error('未知设置项: ' + key);
  }
  return true;
});

ipcMain.handle('device:raw', (e, { hex }) => {
  if (!device.connected) throw new Error('设备未连接');
  const arr = String(hex)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((x) => parseInt(x, 16));
  device.sendRaw(arr);
  return true;
});

ipcMain.handle('file:export', async (e, { defaultName, content, filters }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: filters || [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.handle('file:import', async (e, { filters }) => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: filters || [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  const file = res.filePaths[0];
  const content = fs.readFileSync(file, 'utf8');
  return { ok: true, name: path.basename(file), content };
});

ipcMain.handle('app:minimize', () => {
  if (win) win.minimize();
});

ipcMain.handle('app:maximize', () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle('app:close', () => {
  if (win) win.close();
});

ipcMain.handle('app:openExternal', (e, url) => {
  if (/^https?:/i.test(url)) shell.openExternal(url);
});
