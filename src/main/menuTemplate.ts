// src/main/menuTemplate.ts
import { BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { defaultBindings } from '@shared/commands/catalog';
import { primaryAccelerator, type Bindings } from '@shared/keymap/lookup';
import type { CommandId } from '@shared/commands/ids';
import { checkForUpdates } from './updater';
import { menuCommandsSuppressed } from './capture';

export function sendMenuCommand(win: BrowserWindow | undefined, command: string): void {
  // A menu click while a key is being recorded must not act on the panel.
  if (menuCommandsSuppressed()) return;
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

