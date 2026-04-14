import { lstat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { FileEntry, OpError, Result } from '@shared/types';

export async function stat(path: string): Promise<Result<FileEntry>> {
  try {
    const s = await lstat(path);
    const name = basename(path);
    const dotIdx = name.lastIndexOf('.');
    const hasExt = dotIdx > 0;
    const rawName = hasExt ? name.slice(0, dotIdx) : name;
    const ext = hasExt ? name.slice(dotIdx + 1) : '';
    const isSymlink = s.isSymbolicLink();
    const isRealDir = !isSymlink && s.isDirectory();
    const isAppBundle = isRealDir && ext === 'app';
    return {
      ok: true,
      value: {
        name: rawName,
        ext,
        isDir: isRealDir && !isAppBundle,
        isSymlink,
        isAppBundle,
        isHidden: name.startsWith('.'),
        size: s.size,
        mtime: s.mtimeMs,
        mode: s.mode,
      },
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const mapped: OpError =
      e.code === 'ENOENT' ? { kind: 'not-found', path }
      : e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path }
      : { kind: 'unknown', message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  }
}
