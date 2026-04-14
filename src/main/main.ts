// src/main/main.ts
import { app, BrowserWindow, Menu } from 'electron';
import { registerIpc } from './ipc';
import { join } from 'node:path';

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: 'GranderCommander',
          submenu: [
            { role: 'about' as const },
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
        { label: 'New Folder', accelerator: 'F7', enabled: false },
        { type: 'separator' as const },
        { label: 'Copy', accelerator: 'F5', enabled: false },
        { label: 'Move', accelerator: 'F6', enabled: false },
        { label: 'Delete', accelerator: 'F8', enabled: false },
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
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
