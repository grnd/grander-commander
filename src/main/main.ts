// src/main/main.ts
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { registerIpc } from './ipc';
import { checkForUpdates, initUpdater } from './updater';
import { join } from 'node:path';

function sendMenuCommand(win: BrowserWindow | undefined, command: string): void {
  win?.webContents.send('menu:command', command);
}

export function buildMenuTemplate(): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  return [
    ...(isMac
      ? [{
          label: 'Grander Commander',
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
          click: (_i, w) => sendMenuCommand(w, 'mkdir') },
        { label: 'Rename', accelerator: 'CmdOrCtrl+Shift+R',
          click: (_i, w) => sendMenuCommand(w, 'rename') },
        { type: 'separator' as const },
        { label: 'Copy', accelerator: 'F5',
          click: (_i, w) => sendMenuCommand(w, 'copy') },
        { label: 'Move', accelerator: 'F6',
          click: (_i, w) => sendMenuCommand(w, 'move') },
        { label: 'Move to Trash', accelerator: 'F8',
          click: (_i, w) => sendMenuCommand(w, 'trash') },
        { label: 'Delete Permanently…', accelerator: 'Shift+F8',
          click: (_i, w) => sendMenuCommand(w, 'deleteConfirm') },
      ],
    },
    {
      // macOS routes Cmd-key combinations through the menu bar before the web
      // page, so a text field cannot paste unless a menu item claims Cmd+V.
      // Without this submenu the rename and search boxes silently ignore it.
      //
      // Cut, Copy and Select All appear but deliberately do NOT register their
      // accelerators: Cmd+X, Cmd+C and Cmd+A belong to the panels, for moving,
      // copying and selecting files. A focused text field applies those three
      // itself — see commands/textEditing.
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const, registerAccelerator: false },
        { role: 'copy' as const, registerAccelerator: false },
        { role: 'paste' as const },
        { role: 'selectAll' as const, registerAccelerator: false },
      ],
    },
    {
      label: 'Show',
      submenu: [
        { label: 'Toggle Hidden Files', accelerator: 'Ctrl+H',
          click: (_i, w) => sendMenuCommand(w, 'toggleHidden') },
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
      ],
    },
    { role: 'windowMenu' as const },
  ];
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

export function installProductionWindowGuards(win: BrowserWindow): void {
  if (!app.isPackaged) return;

  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

export function getRendererLoadTarget(): { kind: 'url'; target: string } | { kind: 'file'; target: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    return { kind: 'url', target: devUrl };
  }

  return { kind: 'file', target: join(__dirname, '../renderer/index.html') };
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Grander Commander',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  installProductionWindowGuards(win);

  const target = getRendererLoadTarget();
  if (target.kind === 'url') {
    await win.loadURL(target.target);
  } else {
    await win.loadFile(target.target);
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
