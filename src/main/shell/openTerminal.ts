import { spawn } from 'node:child_process';

// Open a terminal window with cwd = path. Prefer iTerm; fall back to Terminal.
export async function openTerminal(path: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const tryIterm = spawn('open', ['-a', 'iTerm', path], { stdio: 'ignore' });
    tryIterm.on('exit', (code) => {
      if (code === 0) return resolve();
      const fallback = spawn('open', ['-a', 'Terminal', path], { stdio: 'ignore' });
      fallback.on('exit', () => resolve());
    });
    tryIterm.on('error', () => {
      const fallback = spawn('open', ['-a', 'Terminal', path], { stdio: 'ignore' });
      fallback.on('exit', () => resolve());
    });
  });
}
