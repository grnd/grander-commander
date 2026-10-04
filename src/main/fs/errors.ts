// src/main/fs/errors.ts
import type { OpError } from '@shared/types';

/**
 * Shared errno -> OpError mapping for the M3 modules. The M1/M2 fs helpers each
 * inlined their own variant of this; new code funnels through here so a single
 * errno gets one description everywhere.
 */
export function mapFsError(err: unknown, path: string): OpError {
  const e = err as NodeJS.ErrnoException | null;
  switch (e?.code) {
    case 'ENOENT': return { kind: 'not-found', path };
    case 'EACCES':
    case 'EPERM': return permissionError(path, e.code);
    case 'ENOSPC': return { kind: 'disk-full' };
    case 'EEXIST': return { kind: 'exists', path };
    case 'EISDIR': return { kind: 'name-invalid', reason: `${path} is a directory` };
    default: return { kind: 'unknown', message: e?.message ?? String(err) };
  }
}

/**
 * macOS reports EPERM — not EACCES — when TCC blocks a path whose mode says it
 * is readable: Photos libraries, ~/Library/Mail, Messages and friends. chmod
 * cannot fix those; only granting the app Full Disk Access can, so the
 * renderer has to be able to tell the two apart.
 */
export function permissionError(path: string, code: string | undefined): OpError {
  return code === 'EPERM' && process.platform === 'darwin'
    ? { kind: 'permission', path, tcc: true }
    : { kind: 'permission', path };
}
