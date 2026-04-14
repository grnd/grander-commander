import { rm } from 'node:fs/promises';
import type { OpError, Result } from '@shared/types';

export async function deletePaths(paths: string[]): Promise<Result<void>> {
  for (const p of paths) {
    try {
      await rm(p, { recursive: true, force: true });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const mapped: OpError =
        e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path: p }
        : { kind: 'unknown', message: e.message ?? String(err) };
      return { ok: false, error: mapped };
    }
  }
  return { ok: true, value: undefined };
}
