const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { runBot } = require('./bot-core');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

ipcMain.handle('select-file', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.filePaths[0];
});

ipcMain.handle('start-bot', async (_, config) => {
  return await runBot(mainWindow, config); // Passar mainWindow como parâmetro
});

// Configuração correta do ciclo de vida do Electron
app.whenReady().then(() => {
  createWindow();

  // macOS: Recria a janela quando o app é reativado
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Fecha o app quando todas as janelas são fechadas (exceto no macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});