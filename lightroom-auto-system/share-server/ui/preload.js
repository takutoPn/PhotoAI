const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shareServer', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  start: () => ipcRenderer.invoke('backend:start'),
  stop: () => ipcRenderer.invoke('backend:stop')
});
