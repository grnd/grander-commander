import { BrowserWindow, Menu } from 'electron';
import type { KeymapSnapshot } from '@shared/keymap/types';
import { buildMenuTemplate } from '../menuTemplate';

export type PublishDeps = {
  setApplicationMenu: (template: ReturnType<typeof buildMenuTemplate>) => void;
  windows: () => BrowserWindow[];
};

/**
 * One way out for a committed keymap. It rebuilds the application menu, then
 * sends the snapshot to every window. Everything that commits a change calls
 * this, so no surface keeps a key that no longer does the job.
 */
export function publishKeymap(snapshot: KeymapSnapshot, deps: PublishDeps): void {
  deps.setApplicationMenu(buildMenuTemplate(snapshot.bindings));
  for (const win of deps.windows()) win.webContents.send('keymap:changed', snapshot);
}

export function defaultPublishDeps(): PublishDeps {
  return {
    setApplicationMenu: (template) => Menu.setApplicationMenu(Menu.buildFromTemplate(template)),
    windows: () => BrowserWindow.getAllWindows(),
  };
}
