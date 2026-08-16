import { BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '@shared/types';
import { openDefault, openWithChooser } from '../shell/openWith';

export type FileContextArgs = {
  x: number;
  y: number;
  fullPath: string;
  isDir: boolean;
  isDotDot: boolean;
  isAppBundle: boolean;
};

export function popupFileContext(win: BrowserWindow, args: FileContextArgs): void {
  const { x, y, fullPath, isDir, isDotDot, isAppBundle } = args;
  const send = (cmd: MenuCommand) => win.webContents.send('menu:command', cmd);
  const canOpenWith = !isDotDot && !isDir; // apps can open files (and .app bundles)

  const items: MenuItemConstructorOptions[] = [
    { label: 'Open', click: () => send('navigateInto'), enabled: !isDotDot },
    { label: 'Open with Default App', click: () => openDefault(fullPath), enabled: !isDotDot },
    { label: 'Open With…', click: () => void openWithChooser(win, fullPath), enabled: canOpenWith || isAppBundle },
    { label: 'Reveal in Finder', click: () => shell.showItemInFolder(fullPath), enabled: !isDotDot },
    { type: 'separator' },
    { label: 'Copy', accelerator: 'F5', click: () => send('copy'), enabled: !isDotDot },
    { label: 'Move', accelerator: 'F6', click: () => send('move'), enabled: !isDotDot },
    { label: 'Duplicate', click: () => send('duplicate'), enabled: !isDotDot },
    { label: 'Rename', accelerator: 'F2', click: () => send('rename'), enabled: !isDotDot },
    { type: 'separator' },
    { label: 'Move to Trash', accelerator: 'F8', click: () => send('trash'), enabled: !isDotDot },
    { label: 'Delete Permanently…', accelerator: 'Shift+F8', click: () => send('deleteCursorConfirm'), enabled: !isDotDot },
    { type: 'separator' },
    { label: 'Copy Full Path', click: () => send('copyPath'), enabled: !isDotDot },
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
