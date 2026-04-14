import { ipcMain, shell } from 'electron';
import { listDir } from './fs/listDir';
import { stat } from './fs/stat';
import { listVolumes } from './volumes/list';

export function registerIpc() {
  ipcMain.handle('fs:listDir', (_e, path: string, opts) => listDir(path, opts));
  ipcMain.handle('fs:stat', (_e, path: string) => stat(path));
  ipcMain.handle('volumes:list', () => listVolumes());
  ipcMain.handle('shell:openPath', (_e, path: string) => shell.openPath(path));
}
