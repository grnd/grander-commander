import { rename as nodeRename, access } from 'node:fs/promises';
import { basename } from 'node:path';
import type { OpError, Result } from '@shared/types';

export async function rename(from: string, to: string): Promise<Result<void>> {
  const bn = basename(to);
  if (!bn) return { ok: false, error: { kind: 'name-invalid', reason: 'empty target name' } };
  if (bn.includes('\0')) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'contains NUL' } };
  }
  try {
    await access(from);
  } catch {
    return { ok: false, error: { kind: 'not-found', path: from } };
  }
  try {
    await access(to);
    return { ok: false, error: { kind: 'exists', path: to } };
  } catch { /* target free — good */ }
  try {
    await nodeRename(from, to);
    return { ok: true, value: undefined };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const mapped: OpError =
      e.code === 'EXDEV' ? { kind: 'cross-device', src: from, dst: to }
      : e.code === 'ENOENT' ? { kind: 'not-found', path: from }
      : e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path: from }
      : e.code === 'ENOSPC' ? { kind: 'disk-full' }
      : { kind: 'unknown', message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  }
}
