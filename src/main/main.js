import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMenu } from './menu.js';
import { writeSpriteSheet } from './sprite-sheet.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
let windowInstance;
let rendererReady = false;
let pendingPaths = [];

function createWindow() {
  windowInstance = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#080b0e',
    title: 'ASCII3D — Atelier typographique 3D',
    webPreferences: {
      preload: path.join(directory, '../preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  windowInstance.loadFile(path.join(directory, '../renderer/index.html'));
  windowInstance.webContents.on('did-finish-load', () => {
    rendererReady = false;
  });
  windowInstance.on('closed', () => { windowInstance = null; rendererReady = false; });
}

function openPath(file) {
  if (windowInstance && rendererReady) windowInstance.webContents.send('open-path', file);
  else pendingPaths.push(file);
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
  for (const argument of process.argv.slice(1)) {
    if (/\.(glb|gltf|obj|stl|fbx)$/i.test(argument)) openPath(path.resolve(argument));
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('open-file', (event, file) => {
  event.preventDefault();
  openPath(file);
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  for (const file of pendingPaths) windowInstance?.webContents.send('open-path', file);
  pendingPaths = [];
});
ipcMain.handle('open-model', async () => {
  const result = await dialog.showOpenDialog(windowInstance, {
    properties: ['openFile'],
    filters: [{ name: 'Modèles 3D', extensions: ['glb', 'gltf', 'obj', 'stl', 'fbx'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('read-model', async (_, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Chemin de modèle invalide.');
  return fs.readFile(filePath);
});
ipcMain.handle('open-animation', async () => {
  const result = await dialog.showOpenDialog(windowInstance, {
    properties: ['openFile'],
    filters: [{name: 'Animations 3D (GLB, GLTF, FBX)', extensions: ['glb', 'gltf', 'fbx']}]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('open-model-path', async () => {
  const result = await dialog.showOpenDialog(windowInstance, {
    properties: ['openFile'],
    filters: [{ name: 'Modèles 3D', extensions: ['glb', 'gltf', 'obj', 'stl', 'fbx'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('save-file', async (_, data, filters) => {
  const result = await dialog.showSaveDialog(windowInstance, { filters });
  if (result.canceled) return null;
  const contents = typeof data === 'string' ? data : data instanceof Uint8Array ? Buffer.from(data) : data instanceof ArrayBuffer ? Buffer.from(data) : null;
  if (contents === null) throw new Error('Type de fichier à enregistrer non pris en charge.');
  await fs.writeFile(result.filePath, contents);
  return result.filePath;
});
ipcMain.handle('save-sprite-sheet', async (_, data, metadata) => {
  const result = await dialog.showSaveDialog(windowInstance, {
    defaultPath: 'ascii3d-spritesheet.png',
    filters: [{name: 'Sprite sheet PNG', extensions: ['png']}]
  });
  if (result.canceled || !result.filePath) return null;
  return writeSpriteSheet(result.filePath, data, metadata);
});
ipcMain.handle('preset-save', async (_, data) => {
  const result = await dialog.showSaveDialog(windowInstance, { filters: [{ name: 'Préréglage JSON', extensions: ['json'] }] });
  if (result.canceled) return null;
  await fs.writeFile(result.filePath, data);
  return result.filePath;
});
ipcMain.handle('preset-open', async () => {
  const result = await dialog.showOpenDialog(windowInstance, {
    properties: ['openFile'],
    filters: [{ name: 'Préréglage JSON', extensions: ['json'] }]
  });
  if (result.canceled) return null;
  return fs.readFile(result.filePaths[0], 'utf8');
});
