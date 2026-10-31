// src/main/main.ts
import { app, BrowserWindow } from 'electron';
import { isSmokeRun, runSmokeCheck } from './smoke';
import { registerIpc, setKeymapPublisher, setKeymapStore, setSettingsOpener } from './ipc';
import { KeymapStore } from './keymap/store';
import { defaultPublishDeps, publishKeymap } from './keymap/publish';
import type { KeymapSnapshot } from '@shared/keymap/types';
import { readFileSync, writeFileSync } from 'node:fs';
import { checkForUpdates, initUpdater } from './updater';
import { join } from 'node:path';
import { buildMenuTemplate, sendMenuCommand } from './menuTemplate';

export { buildMenuTemplate, sendMenuCommand };

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

let settingsWindow: BrowserWindow | null = null;
let keymapStore: KeymapStore | null = null;

/** Where the keymap lives. The variable exists so a test run cannot touch the owner's file. */
export function keymapDir(): string {
  return process.env.GC_KEYMAP_DIR ?? join(app.getPath('appData'), 'GranderCommander');
}

export function getSettingsLoadTarget(): { kind: 'url'; target: string } | { kind: 'file'; target: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    return { kind: 'url', target: `${devUrl.replace(/\/$/, '')}/settings/` };
  }
  return { kind: 'file', target: join(__dirname, '../renderer/settings/index.html') };
}

const boundsPath = () => join(app.getPath('userData'), 'settings-window.json');

function savedBounds(): { width: number; height: number; x?: number; y?: number } {
  try {
    const raw = JSON.parse(readFileSync(boundsPath(), 'utf8')) as Record<string, number>;
    if (typeof raw.width === 'number' && typeof raw.height === 'number') {
      return { width: raw.width, height: raw.height, x: raw.x, y: raw.y };
    }
  } catch { /* no saved bounds yet */ }
  return { width: 760, height: 620 };
}

/**
 * An edit in a text editor shows up when this window takes focus. A watcher is
 * the other option. Focus is enough, because this window is where a change
 * matters, and the store refuses to write over a file it did not write.
 */
export async function handleSettingsFocus(
  store: Pick<KeymapStore, 'reloadIfChanged'>,
  publish: (snapshot: KeymapSnapshot) => void,
): Promise<void> {
  const { changed, snapshot } = await store.reloadIfChanged();
  if (changed) publish(snapshot);
}

export async function openSettingsWindow(): Promise<BrowserWindow> {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }
  const win = new BrowserWindow({
    ...savedBounds(),
    minWidth: 560,
    minHeight: 420,
    title: 'Settings',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  installProductionWindowGuards(win);
  settingsWindow = win;

  win.on('close', () => {
    try {
      writeFileSync(boundsPath(), JSON.stringify(win.getBounds()), 'utf8');
    } catch { /* bounds are a convenience, not a requirement */ }
  });
  win.on('closed', () => { settingsWindow = null; });
  win.on('focus', () => {
    if (keymapStore) {
      void handleSettingsFocus(keymapStore, (s) => publishKeymap(s, defaultPublishDeps()));
    }
  });

  const target = getSettingsLoadTarget();
  if (target.kind === 'url') await win.loadURL(target.target);
  else await win.loadFile(target.target);
  return win;
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
  keymapStore = await KeymapStore.open(keymapDir());
  setKeymapStore(keymapStore);
  setKeymapPublisher((snapshot) => publishKeymap(snapshot, defaultPublishDeps()));
  setSettingsOpener(() => void openSettingsWindow());
  // The first menu comes from the committed keymap, not from the defaults.
  publishKeymap(keymapStore.snapshot(), defaultPublishDeps());
  registerIpc();
  initUpdater();
  const win = await createWindow();
  // A smoke run is not a session: report whether the window really came up
  // and exit, before the updater or anything else can act.
  if (isSmokeRun()) {
    await runSmokeCheck(win, openSettingsWindow);
    return;
  }
  // Check shortly after launch so the window exists to receive the result.
  // autoDownload is off, so this costs one request and never installs silently.
  setTimeout(() => void checkForUpdates(), 4000);
  app.on('activate', async () => {
    // The settings window alone must not count: closing the file manager while
    // settings stays open would otherwise leave no way back.
    const hasMain = BrowserWindow.getAllWindows().some((w) => w !== settingsWindow);
    if (!hasMain) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
