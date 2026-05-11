const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
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

autoUpdater.on("checking-for-update", () => {
  console.log("Buscando actualizaciones...");
});

autoUpdater.on("update-available", () => {
  console.log("Actualización disponible.");
});

autoUpdater.on("update-not-available", () => {
  console.log("No hay actualizaciones.");
});

autoUpdater.on("error", (err) => {
  console.log("Error updater:", err);
});

autoUpdater.on("download-progress", (progressObj) => {

  let logMessage = "Velocidad: " + progressObj.bytesPerSecond;
  logMessage += " - Descargado " + progressObj.percent + "%";

  console.log(logMessage);

});

autoUpdater.on("update-downloaded", () => {

  dialog.showMessageBox({
    type: "info",
    title: "Actualización lista",
    message: "OptiPix descargó una nueva versión.",
    detail: "Reinicia la aplicación para instalarla.",
    buttons: ["Reiniciar ahora"]
  }).then(() => {

    autoUpdater.quitAndInstall();

  });

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

ipcMain.handle('sharp-test', async () => {

  try {

    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .png()
    .toBuffer();

    return {
      success: true,
      size: buffer.length
    };

  } catch (err) {

    console.error(err);

    return {
      success: false,
      error: err.message
    };

  }

});

ipcMain.handle('compress-image', async (event, data) => {

  try {

    const {
      inputPath,
      outputPath,
      quality
    } = data;

    sharp.cache(false);

    await sharp(inputPath)
      .jpeg({
        quality,
        mozjpeg: true
      })
      .toFile(outputPath);

    return {
      success: true
    };

  } catch (err) {

    console.error(err);

    return {
      success: false,
      error: err.message
    };

  }

});
