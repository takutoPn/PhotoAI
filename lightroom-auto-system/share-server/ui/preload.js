const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shareServer', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  start: () => ipcRenderer.invoke('backend:start'),
  stop: () => ipcRenderer.invoke('backend:stop')
});
