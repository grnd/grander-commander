import { mkdir as nodeMkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { OpError, Result } from '@shared/types';

export async function mkdir(parent: string, name: string): Promise<Result<void>> {
  if (!name) return { ok: false, error: { kind: 'name-invalid', reason: 'empty name' } };
  if (name.includes('/') || name.includes('\0')) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'contains invalid character' } };
  }
  const full = join(parent, name);
  try {
    await access(full);
    return { ok: false, error: { kind: 'exists', path: full } };
  } catch { /* not present — good */ }
  try {
    await nodeMkdir(full);
    return { ok: true, value: undefined };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const mapped: OpError =
      e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path: full }
      : e.code === 'ENOSPC' ? { kind: 'disk-full' }
      : e.code === 'EEXIST' ? { kind: 'exists', path: full }
      : { kind: 'unknown', message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  }
}
