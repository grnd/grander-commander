// src/main/main.ts
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { isSmokeRun, runSmokeCheck } from './smoke';
import { registerIpc } from './ipc';
import { checkForUpdates, initUpdater } from './updater';
import { join } from 'node:path';
import { defaultBindings } from '@shared/commands/catalog';
import { primaryAccelerator, type Bindings } from '@shared/keymap/lookup';
import type { CommandId } from '@shared/commands/ids';

function sendMenuCommand(win: BrowserWindow | undefined, command: string): void {
  win?.webContents.send('menu:command', command);
}

export function buildMenuTemplate(bindings: Bindings = defaultBindings()): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  /**
   * Display the key, never register it. On macOS the application menu is
   * process-wide and AppKit intercepts a registered accelerator before any
   * window or DOM listener sees it — which would make per-context keymaps
   * impossible and would take Cmd+C away from every text field the moment file
   * copy held it. Edit's cut/copy/selectAll have worked this way since the
   * panels claimed those keys; this is the same rule for every custom item.
   */
  const item = (label: string, command: CommandId): MenuItemConstructorOptions => ({
    label,
    accelerator: primaryAccelerator(bindings, 'global', command) ?? undefined,
    registerAccelerator: false,
    click: (_i, w) => sendMenuCommand(w, command),
  });

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
        item('New Folder', 'mkdir'),
        item('Rename', 'rename'),
        { type: 'separator' as const },
        item('Copy', 'copy'),
        item('Move', 'move'),
        item('Move to Trash', 'trash'),
        item('Delete Permanently…', 'deleteConfirm'),
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
        item('Toggle Hidden Files', 'toggleHidden'),
        // No reload role: it claims Cmd+R, which is the panels' refresh.
        { role: 'toggleDevTools' as const },
      ],
    },
    {
      // Built by hand rather than taken from the windowMenu role: that role
      // includes role:'close', which registers Cmd+W — and AppKit would then
      // close the window instead of the tab the keymap says Cmd+W closes.
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : []),
      ],
    },
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
