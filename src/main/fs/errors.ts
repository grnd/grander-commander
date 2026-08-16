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
    case 'EPERM': return { kind: 'permission', path };
    case 'ENOSPC': return { kind: 'disk-full' };
    case 'EEXIST': return { kind: 'exists', path };
    case 'EISDIR': return { kind: 'name-invalid', reason: `${path} is a directory` };
    default: return { kind: 'unknown', message: e?.message ?? String(err) };
  }
}
