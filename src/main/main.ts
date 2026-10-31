// src/main/main.ts
import { app, BrowserWindow, Menu } from 'electron';
import { isSmokeRun, runSmokeCheck } from './smoke';
import { registerIpc } from './ipc';
import { checkForUpdates, initUpdater } from './updater';
import { join } from 'node:path';
import { buildMenuTemplate, sendMenuCommand } from './menuTemplate';

export { buildMenuTemplate, sendMenuCommand };

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

async function createWindow(): Promise<BrowserWindow> {
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
  return win;
}

app.whenReady().then(async () => {
  buildMenu();
  registerIpc();
  initUpdater();
  const win = await createWindow();
  // A smoke run is not a session: report whether the window really came up
  // and exit, before the updater or anything else can act.
  if (isSmokeRun()) {
    await runSmokeCheck(win);
    return;
  }
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
