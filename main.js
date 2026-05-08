const path = require('path');
const { autoUpdater } = require('electron-updater');
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell
} = require('electron');

const { autoUpdater } = require('electron-updater');

function createWindow() {
  const { screen } = require('electron');

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(900, width),
    height: Math.min(800, height),

    minWidth: 700,
    minHeight: 650,

    resizable: true,
    center: true,

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {

  createWindow();

  autoUpdater.checkForUpdatesAndNotify();

});

// seleccionar carpeta
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths;
});

// abrir carpeta
ipcMain.handle('open-folder', async (e, folderPath) => {
  shell.openPath(folderPath);
});

// 🔥 NUEVO: obtener escritorio dinámico (IMPORTANTE)
ipcMain.handle('get-desktop', () => {
  return app.getPath('desktop');
});

ipcMain.handle('select-output-folder', async () => {
  const { dialog } = require('electron');

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  return result.filePaths;
});
