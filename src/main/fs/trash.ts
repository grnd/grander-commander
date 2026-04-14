import { shell } from 'electron';
import type { OpError, Result } from '@shared/types';

export async function trashPaths(paths: string[]): Promise<Result<void>> {
  for (const p of paths) {
    try {
      await shell.trashItem(p);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { message?: string };
      const mapped: OpError =
        e.code === 'ENOENT' ? { kind: 'not-found', path: p }
        : e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path: p }
        : { kind: 'unknown', message: e.message ?? String(err) };
      return { ok: false, error: mapped };
    }
  }
  return { ok: true, value: undefined };
}
