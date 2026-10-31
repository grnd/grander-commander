import { BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '@shared/types';
import { openDefault, openWithChooser } from '../shell/openWith';
import { defaultBindings } from '@shared/commands/catalog';
import { primaryAccelerator, type Bindings } from '@shared/keymap/lookup';
import type { CommandId } from '@shared/commands/ids';

export type FileContextArgs = {
  x: number;
  y: number;
  fullPath: string;
  isDir: boolean;
  isDotDot: boolean;
  isAppBundle: boolean;
};

/**
 * `bindings` comes from the committed keymap, so this menu cannot advertise a
 * key the owner has since moved.
 */
export function popupFileContext(
  win: BrowserWindow, args: FileContextArgs, bindings: Bindings = defaultBindings(),
): void {
  const { x, y, fullPath, isDir, isDotDot, isAppBundle } = args;
  const send = (cmd: MenuCommand) => win.webContents.send('menu:command', cmd);
  /**
   * Shows the key its own command is bound to, and claims none of them — the
   * renderer's router owns every key in the app. "Delete Permanently…" used to
   * advertise Shift+F8, which deletes the whole selection, while sending the
   * command that deletes just the clicked file.
   */
  const item = (
    label: string, command: CommandId, context: 'global' | 'panel', enabled: boolean,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator: primaryAccelerator(bindings, context, command) ?? undefined,
    registerAccelerator: false,
    click: () => send(command),
    enabled,
  });
  const canOpenWith = !isDotDot && !isDir; // apps can open files (and .app bundles)

  const items: MenuItemConstructorOptions[] = [
    { label: 'Open', click: () => send('navigateInto'), enabled: !isDotDot },
    { label: 'Open with Default App', click: () => openDefault(fullPath), enabled: !isDotDot },
    { label: 'Open With…', click: () => void openWithChooser(win, fullPath), enabled: canOpenWith || isAppBundle },
    { label: 'Reveal in Finder', click: () => shell.showItemInFolder(fullPath), enabled: !isDotDot },
    { type: 'separator' },
    item('Copy', 'copy', 'global', !isDotDot),
    item('Move', 'move', 'global', !isDotDot),
    item('Duplicate', 'duplicate', 'global', !isDotDot),
    item('Rename', 'rename', 'global', !isDotDot),
    { type: 'separator' },
    item('Move to Trash', 'trash', 'global', !isDotDot),
    item('Delete Permanently…', 'deleteCursorConfirm', 'panel', !isDotDot),
    { type: 'separator' },
    item('Copy Full Path', 'copyPath', 'global', !isDotDot),
    ...(isDir && !isDotDot
      ? [{
          label: 'Add to Favorites',
          click: () => send({ command: 'addToFavorites', targetPath: fullPath }),
        } as MenuItemConstructorOptions]
      : []),
  ];

  const menu = Menu.buildFromTemplate(items);
  menu.popup({ window: win, x: Math.round(x), y: Math.round(y) });
}
