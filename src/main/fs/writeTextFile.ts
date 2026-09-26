import { rename, unlink, writeFile } from 'node:fs/promises';
import type { OpError, Result } from '@shared/types';

export async function writeTextFile(path: string, content: string): Promise<Result<void>> {
  const tmp = `${path}.gc-tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmp, content, { encoding: 'utf8' });
  } catch (err) {
    return { ok: false, error: mapError(err, path) };
  }
  try {
    await rename(tmp, path);
    return { ok: true, value: undefined };
  } catch (err) {
    // Best-effort cleanup of the tmp file; ignore failures.
    await unlink(tmp).catch(() => {});
    return { ok: false, error: mapError(err, path) };
  }
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
