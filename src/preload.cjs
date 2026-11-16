const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('asciiAPI', {
  ready: () => ipcRenderer.send('renderer-ready'),
  open: () => ipcRenderer.invoke('open-model'),
  openAnimation: () => ipcRenderer.invoke('open-animation'),
  save: (data, filters) => ipcRenderer.invoke('save-file', data, filters),
  saveSpriteSheet: (data, metadata) => ipcRenderer.invoke('save-sprite-sheet', data, metadata),
  readModel: filePath => ipcRenderer.invoke('read-model', filePath),
  presetSave: data => ipcRenderer.invoke('preset-save', data),
  presetOpen: () => ipcRenderer.invoke('preset-open'),
  modelPath: () => ipcRenderer.invoke('open-model-path'),
  onOpen: callback => ipcRenderer.on('open-path', (_, filePath) => callback(filePath)),
  onMenu: callback => ipcRenderer.on('menu-action', (_, action) => callback(action))
});
