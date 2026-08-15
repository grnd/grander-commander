// src/main/main.ts
import { app, BrowserWindow, Menu } from 'electron';
import { registerIpc } from './ipc';
import { checkForUpdates, initUpdater } from './updater';
import { join } from 'node:path';

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: 'GranderCommander',
          submenu: [
            { role: 'about' as const },
            { label: 'Check for Updates…', click: () => void checkForUpdates() },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'Files',
      submenu: [
        { label: 'New Folder', accelerator: 'CmdOrCtrl+N',
          click: (_i, w) => w?.webContents.send('menu:command', 'mkdir') },
        { label: 'Rename', accelerator: 'CmdOrCtrl+Shift+R',
          click: (_i, w) => w?.webContents.send('menu:command', 'rename') },
        { type: 'separator' as const },
        { label: 'Copy', accelerator: 'F5',
          click: (_i, w) => w?.webContents.send('menu:command', 'copy') },
        { label: 'Move', accelerator: 'F6',
          click: (_i, w) => w?.webContents.send('menu:command', 'move') },
        { label: 'Move to Trash', accelerator: 'F8',
          click: (_i, w) => w?.webContents.send('menu:command', 'trash') },
        { label: 'Delete Permanently…', accelerator: 'Shift+F8',
          click: (_i, w) => w?.webContents.send('menu:command', 'deleteConfirm') },
      ],
    },
    {
      label: 'Show',
      submenu: [
        { label: 'Toggle Hidden Files', accelerator: 'Ctrl+H', click: () => {} },
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
      ],
    },
    { role: 'windowMenu' as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'GranderCommander',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  buildMenu();
  registerIpc();
  initUpdater();
  await createWindow();
  // Check shortly after launch so the window exists to receive the result.
  // autoDownload is off, so this costs one request and never installs silently.
  setTimeout(() => void checkForUpdates(), 4000);
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
