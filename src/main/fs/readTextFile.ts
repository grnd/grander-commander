import { open, stat } from 'node:fs/promises';
import type { OpError, Result } from '@shared/types';

const MAX_BYTES = 10 * 1024 * 1024;
const SNIFF_BYTES = 8 * 1024;

export async function readTextFile(path: string): Promise<Result<{ content: string; size: number }>> {
  let size: number;
  try {
    const st = await stat(path);
    if (st.isDirectory()) return { ok: false, error: { kind: 'name-invalid', reason: 'is a directory' } };
    size = st.size;
  } catch (err) {
    return { ok: false, error: mapError(err, path) };
  }
  if (size > MAX_BYTES) return { ok: false, error: { kind: 'too-large', path, size } };

  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(path, 'r');
    // UTF-16 text also contains NUL bytes for ASCII, so this heuristic flags UTF-16
    // as binary. Acceptable for MVP — we only support UTF-8.
    const sniffLen = Math.min(SNIFF_BYTES, size);
    if (sniffLen > 0) {
      const sniff = Buffer.alloc(sniffLen);
      await fh.read(sniff, 0, sniffLen, 0);
      if (sniff.includes(0)) return { ok: false, error: { kind: 'binary', path } };
    }
    const buf = Buffer.alloc(size);
    if (size > 0) await fh.read(buf, 0, size, 0);
    return { ok: true, value: { content: buf.toString('utf8'), size } };
  } catch (err) {
    return { ok: false, error: mapError(err, path) };
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

function mapError(err: unknown, path: string): OpError {
  const e = err as NodeJS.ErrnoException;
  switch (e.code) {
    case 'ENOENT': return { kind: 'not-found', path };
    case 'EACCES':
    case 'EPERM':  return { kind: 'permission', path };
    default:       return { kind: 'unknown', message: e.message ?? String(err) };
  }
}
