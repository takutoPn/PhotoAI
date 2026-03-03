const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openLightroom: (catalogPath) => ipcRenderer.invoke('open-lightroom', catalogPath),
});
