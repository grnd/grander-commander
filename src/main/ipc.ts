import { BrowserWindow, ipcMain, shell } from 'electron';
import { listDir } from './fs/listDir';
import { stat } from './fs/stat';
import { listVolumes } from './volumes/list';
import { mkdir } from './fs/mkdir';
import { rename } from './fs/rename';
import { trashPaths } from './fs/trash';
import { deletePaths } from './fs/delete';
import { duplicate } from './fs/duplicate';
import { quickLook } from './shell/quickLook';
import { openTerminal } from './shell/openTerminal';
import { runCommand } from './shell/runCommand';
import { spawnTerminal, writeTerminal, resizeTerminal, killTerminal, killAllForContents } from './shell/terminal';
import { popupFileContext, type FileContextArgs } from './menu/fileContext';
import { OpRunner } from './ops/runner';
import type { ConflictAnswer, FileOp, OpId } from '@shared/types';

const runner = new OpRunner();

export function registerIpc() {
  ipcMain.handle('fs:listDir', (_e, path: string, opts) => listDir(path, opts));
  ipcMain.handle('fs:stat', (_e, path: string) => stat(path));
  ipcMain.handle('fs:mkdir', (_e, parent: string, name: string) => mkdir(parent, name));
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => rename(from, to));
  ipcMain.handle('fs:trash', (_e, paths: string[]) => trashPaths(paths));
  ipcMain.handle('fs:delete', (_e, paths: string[]) => deletePaths(paths));
  ipcMain.handle('fs:duplicate', (_e, path: string) => duplicate(path));
  ipcMain.handle('volumes:list', () => listVolumes());
  ipcMain.handle('shell:openPath', (_e, path: string) => shell.openPath(path));
  ipcMain.handle('shell:quickLook', (_e, path: string) => { quickLook(path); });
  ipcMain.handle('shell:openTerminal', (_e, path: string) => openTerminal(path));
  ipcMain.handle('shell:runCommand', (_e, cmd: string, cwd: string) => runCommand(cmd, cwd));

  ipcMain.handle('term:spawn', (e, cwd: string, cols: number, rows: number) => {
    const id = spawnTerminal(e.sender, cwd, cols, rows);
    e.sender.once('destroyed', () => killAllForContents(e.sender));
    return id;
  });
  ipcMain.handle('term:write', (_e, id: string, data: string) => writeTerminal(id, data));
  ipcMain.handle('term:resize', (_e, id: string, cols: number, rows: number) => resizeTerminal(id, cols, rows));
  ipcMain.handle('term:kill', (_e, id: string) => killTerminal(id));

  ipcMain.handle('menu:popupFileContext', (e, args: FileContextArgs) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) popupFileContext(win, args);
  });

  ipcMain.handle('ops:start', (e, op: FileOp) => {
    const id = runner.start(op);
    const wc = e.sender;
    runner.subscribe(id, (ev) => {
      if (!wc.isDestroyed()) wc.send(`ops:event:${id}`, ev);
    });
    return id;
  });
  ipcMain.handle('ops:cancel', (_e, id: OpId) => runner.cancel(id));
  ipcMain.handle('ops:answerConflict', (_e, id: OpId, a: ConflictAnswer) => runner.answerConflict(id, a));
}

export { runner };
