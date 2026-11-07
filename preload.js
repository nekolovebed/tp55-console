'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tp55', {
  status: () => ipcRenderer.invoke('device:status'),
  connect: () => ipcRenderer.invoke('device:connect'),
  disconnect: () => ipcRenderer.invoke('device:disconnect'),
  readVersion: () => ipcRenderer.invoke('device:readVersion'),

  previewEq: (payload) => ipcRenderer.invoke('eq:preview', payload),
  saveEq: (payload) => ipcRenderer.invoke('eq:save', payload),
  resetEq: () => ipcRenderer.invoke('eq:reset'),

  setMic: (payload) => ipcRenderer.invoke('mic:set', payload),
  saveMic: () => ipcRenderer.invoke('mic:save'),

  setDac: (payload) => ipcRenderer.invoke('dac:set', payload),

  sendRaw: (hex) => ipcRenderer.invoke('device:raw', { hex }),

  sysInfo: () => ipcRenderer.invoke('sys:info'),
  keepAliveStatus: () => ipcRenderer.invoke('keepalive:status'),
  keepAliveStart: () => ipcRenderer.invoke('keepalive:start'),
  keepAliveStop: () => ipcRenderer.invoke('keepalive:stop'),

  exportFile: (payload) => ipcRenderer.invoke('file:export', payload),
  importFile: (payload) => ipcRenderer.invoke('file:import', payload),

  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  onEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('device:event', handler);
    return () => ipcRenderer.removeListener('device:event', handler);
  },
});
