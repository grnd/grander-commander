import { open, access, rm } from 'node:fs/promises';
import type { OpError, Result } from '@shared/types';

export type CopyOptions = {
  onProgress: (bytesDone: number) => void;
  signal: AbortSignal | undefined;
  overwrite?: boolean;
};

const CHUNK = 1024 * 1024; // 1 MiB

export async function copyFile(src: string, dst: string, opts: CopyOptions): Promise<Result<void>> {
  if (!opts.overwrite) {
    try {
      await access(dst);
      return { ok: false, error: { kind: 'exists', path: dst } };
    } catch { /* free — good */ }
  }
  let srcFh: Awaited<ReturnType<typeof open>> | undefined;
  let dstFh: Awaited<ReturnType<typeof open>> | undefined;
  let writtenOk = false;
  try {
    srcFh = await open(src, 'r');
    dstFh = await open(dst, 'w');
    const buf = Buffer.alloc(CHUNK);
    let done = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (opts.signal?.aborted) {
        throw Object.assign(new Error('aborted'), { code: 'ABORT' });
      }
      const { bytesRead } = await srcFh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      await dstFh.write(buf, 0, bytesRead);
      done += bytesRead;
      opts.onProgress(done);
    }
    writtenOk = true;
    return { ok: true, value: undefined };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: string };
    const mapped: OpError =
      e.code === 'ENOENT' ? { kind: 'not-found', path: src }
      : e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path: src }
      : e.code === 'ENOSPC' ? { kind: 'disk-full' }
      : { kind: 'unknown', message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  } finally {
    try { await srcFh?.close(); } catch { /* ignore */ }
    try { await dstFh?.close(); } catch { /* ignore */ }
    if (!writtenOk) {
      try { await rm(dst, { force: true }); } catch { /* ignore */ }
    }
  }
}
