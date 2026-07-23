import { BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';

export function openDefault(path: string): void {
  void shell.openPath(path);
}

export async function openWithChooser(win: BrowserWindow, filePath: string): Promise<void> {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose Application',
    defaultPath: '/Applications',
    buttonLabel: 'Open',
    properties: ['openFile'],
    filters: [{ name: 'Applications', extensions: ['app'] }],
  });
  if (r.canceled || r.filePaths.length === 0) return;
  const app = r.filePaths[0];
  spawn('open', ['-a', app, filePath], { stdio: 'ignore', detached: true }).unref();
}
