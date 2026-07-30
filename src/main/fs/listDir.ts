import { readdir, lstat, stat as statFollow } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileEntry, ListDirOptions, OpError, Result } from '@shared/types';
import { NOISE_FILENAMES } from '@shared/types';

export async function listDir(
  path: string,
  opts: ListDirOptions,
): Promise<Result<FileEntry[]>> {
  let names: string[];
  try {
    names = await readdir(path);
  } catch (err) {
    return { ok: false, error: mapError(err, path) };
  }

  const entries: FileEntry[] = [];
  for (const name of names) {
    if (NOISE_FILENAMES.has(name)) continue;
    const isDotHidden = name.startsWith('.');
    if (isDotHidden && !opts.showHidden) continue;

    const full = join(path, name);
    let stat: import('node:fs').Stats;
    try {
      stat = await lstat(full);
    } catch {
      // Entry vanished between readdir and lstat — skip.
      continue;
    }

    const isSymlink = stat.isSymbolicLink();
    // Follow symlinks so a link to a directory (e.g. ~/Google Drive -> the
    // CloudStorage mount) is navigable. Following throws ELOOP on a cycle and
    // ENOENT when dangling; either way the entry is simply not a directory.
    let isRealDir = stat.isDirectory();
    if (isSymlink) {
      try {
        isRealDir = (await statFollow(full)).isDirectory();
      } catch {
        isRealDir = false;
      }
    }
    const dotIdx = name.lastIndexOf('.');
    const hasExt = dotIdx > 0; // leading dot ("hidden") does not count as ext
    const rawName = hasExt ? name.slice(0, dotIdx) : name;
    const ext = hasExt ? name.slice(dotIdx + 1) : '';
    const isAppBundle = isRealDir && ext === 'app';

    entries.push({
      name: rawName,
      ext,
      isDir: isRealDir && !isAppBundle,
      isSymlink,
      isAppBundle,
      isHidden: isDotHidden,
      size: stat.size,
      mtime: stat.mtimeMs,
      mode: stat.mode,
    });
  }

  return { ok: true, value: entries };
}

function mapError(err: unknown, path: string): OpError {
  const e = err as NodeJS.ErrnoException;
  switch (e.code) {
    case 'ENOENT': return { kind: 'not-found', path };
    case 'EACCES':
    case 'EPERM':  return { kind: 'permission', path };
    case 'ENOSPC': return { kind: 'disk-full' };
    default:       return { kind: 'unknown', message: e.message ?? String(err) };
  }
}
