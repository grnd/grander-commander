import { spawn, type IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';

export type TerminalId = string;

type Session = {
  pty: IPty;
  wc: WebContents;
  dataSub: { dispose: () => void };
  exitSub: { dispose: () => void };
};

const sessions = new Map<TerminalId, Session>();

function resolveShell(): { file: string; args: string[] } {
  const envShell = process.env.SHELL;
  if (envShell) return { file: envShell, args: ['-l'] };
  if (process.platform === 'win32') return { file: 'powershell.exe', args: [] };
  return { file: '/bin/bash', args: ['-l'] };
}

export function spawnTerminal(wc: WebContents, cwd: string, cols: number, rows: number): TerminalId {
  const { file, args } = resolveShell();
  const pty = spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(1, cols | 0),
    rows: Math.max(1, rows | 0),
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const id: TerminalId = randomUUID();
  const dataChan = `term:data:${id}`;
  const exitChan = `term:exit:${id}`;

  const dataSub = pty.onData((data) => {
    if (!wc.isDestroyed()) wc.send(dataChan, data);
  });

  const exitSub = pty.onExit(({ exitCode, signal }) => {
    if (!wc.isDestroyed()) wc.send(exitChan, { exitCode, signal });
    sessions.delete(id);
  });

  sessions.set(id, { pty, wc, dataSub, exitSub });
  return id;
}

export function writeTerminal(id: TerminalId, data: string): void {
  const s = sessions.get(id);
  if (s) s.pty.write(data);
}

export function resizeTerminal(id: TerminalId, cols: number, rows: number): void {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.pty.resize(Math.max(1, cols | 0), Math.max(1, rows | 0));
  } catch {
    /* pty may already be gone */
  }
}

export function killTerminal(id: TerminalId): void {
  const s = sessions.get(id);
  if (!s) return;
  try { s.dataSub.dispose(); } catch { /* ignore */ }
  try { s.exitSub.dispose(); } catch { /* ignore */ }
  try { s.pty.kill(); } catch { /* ignore */ }
  sessions.delete(id);
}

export function killAllForContents(wc: WebContents): void {
  for (const [id, s] of sessions) {
    if (s.wc === wc) killTerminal(id);
  }
}
