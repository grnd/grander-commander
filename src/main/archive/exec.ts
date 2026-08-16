// src/main/archive/exec.ts
import { spawn } from 'node:child_process';

export type ExecResult = { stdout: string; stderr: string; code: number };

const MAX_OUTPUT = 8 * 1024 * 1024;

/**
 * Run an archive tool.
 *
 * Arguments are passed as an array and never through a shell, so a member named
 * `; rm -rf ~` is a filename and nothing else. LC_ALL=C pins month names and
 * number formats, which the listing parsers depend on.
 */
export function exec(
  command: string,
  args: string[],
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const onAbort = () => { child.kill('SIGTERM'); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += String(d).slice(0, MAX_OUTPUT - stdout.length);
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += String(d).slice(0, MAX_OUTPUT - stderr.length);
    });
    child.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbort);
      // ENOENT here means the tool is not installed, which callers turn into
      // "install p7zip" rather than a stack trace.
      finish({ stdout, stderr: String(err), code: -1 });
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      finish({ stdout, stderr, code: code ?? -1 });
    });
  });
}

let sevenZipCache: string | null | undefined;

/**
 * macOS ships no 7-Zip, so it is looked up rather than assumed. Homebrew
 * installs `7zz`; p7zip installs `7z`.
 */
export async function sevenZipBinary(): Promise<string | null> {
  if (sevenZipCache !== undefined) return sevenZipCache;
  for (const candidate of ['7zz', '7z', '7za']) {
    const r = await exec('/usr/bin/which', [candidate]);
    if (r.code === 0 && r.stdout.trim()) {
      sevenZipCache = candidate;
      return sevenZipCache;
    }
  }
  sevenZipCache = null;
  return null;
}

/** Test seam: forget the cached lookup. */
export function resetSevenZipCache(): void {
  sevenZipCache = undefined;
}
