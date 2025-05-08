// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Métodos síncronos
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  startBot: (config) => ipcRenderer.invoke('start-bot', config),
  getReportsDir: () => ipcRenderer.invoke('get-reports-dir'),

  // Listeners de eventos
  onLogMessage: (callback) => ipcRenderer.on('log-message', callback),
  onQRCode: (callback) => ipcRenderer.on('qr-code', callback),
  onAuthStatus: (callback) => ipcRenderer.on('auth-status', callback)
});