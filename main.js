// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { runBot } = require('./bot-core');

let mainWindow;

const SESSION_PATH = path.join(__dirname, '.wwebjs_auth');
const SESSION_PATH_CACHE = path.join(__dirname, '.wwebjs_cache');

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

ipcMain.handle('check-session', () => {
  return fs.existsSync(SESSION_PATH);
});

ipcMain.handle('select-file', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// ✅ CORREÇÃO: Revertido para ipcMain.handle para comunicação de duas vias
ipcMain.handle('start-bot', async (event, config) => {
  if (config.useSession === false && fs.existsSync(SESSION_PATH)) {
    try {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      mainWindow.webContents.send('log-message', 'Sessão anterior removida. Um novo QR Code será gerado.');
    } catch (error) {
      mainWindow.webContents.send('log-message', `❌ Erro ao remover sessão: ${error.message}`);
      return; // Interrompe
    }
  }
  
  // Executa o bot e espera a conclusão (ou erro)
  await runBot(mainWindow, config);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});