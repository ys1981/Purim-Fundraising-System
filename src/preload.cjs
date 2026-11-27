const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('purim', Object.freeze({
  read: () => ipcRenderer.invoke('db:read'),
  saveDonor: donor => ipcRenderer.invoke('donor:save', donor),
  deleteDonor: id => ipcRenderer.invoke('donor:delete', id),
  backup: () => ipcRenderer.invoke('backup:create'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import')
}));