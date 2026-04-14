import { spawn, type ChildProcess } from 'node:child_process';

// Finder-style Quick Look toggle via macOS `qlmanage -p <path>`.
// Pressing on the same file closes the preview; on a different file, swaps.
let current: { proc: ChildProcess; path: string } | null = null;

export function quickLook(path: string): void {
  if (current) {
    const sameFile = current.path === path;
    try { current.proc.kill('SIGTERM'); } catch { /* ignore */ }
    current = null;
    if (sameFile) return; // toggle off
  }
  const proc = spawn('qlmanage', ['-p', path], { stdio: 'ignore', detached: false });
  const token = { proc, path };
  current = token;
  proc.on('exit', () => {
    if (current === token) current = null;
  });
}
