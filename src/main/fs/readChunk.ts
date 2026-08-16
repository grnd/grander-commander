// src/main/fs/readChunk.ts
import { open, stat } from 'node:fs/promises';
import type { Result } from '@shared/types';
import { mapFsError } from './errors';

/**
 * Largest window the viewer will pull in one request. The viewer pages through
 * bigger files rather than materialising them, so a multi-GB log opens as fast
 * as a README.
 */
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;

export type Chunk = {
  bytes: Uint8Array;
  /** Total size of the file, so the viewer can render "x of y" and page. */
  size: number;
};

export async function readChunk(
  path: string,
  offset: number,
  length: number,
): Promise<Result<Chunk>> {
  const want = Math.max(0, Math.min(length, MAX_CHUNK_BYTES));

  // Checked before open(), not after: opening a FIFO blocks until a writer
  // appears, which hangs the main process with no way back.
  let st;
  try {
    st = await stat(path);
  } catch (err) {
    return { ok: false, error: mapFsError(err, path) };
  }
  if (st.isDirectory()) {
    return { ok: false, error: { kind: 'name-invalid', reason: `${path} is a directory` } };
  }
  if (!st.isFile()) {
    return { ok: false, error: { kind: 'name-invalid', reason: `${path} is not a regular file` } };
  }

  let fh;
  try {
    fh = await open(path, 'r');
  } catch (err) {
    return { ok: false, error: mapFsError(err, path) };
  }
  try {
    const start = Math.max(0, Math.min(offset, st.size));
    const buf = Buffer.alloc(Math.min(want, Math.max(0, st.size - start)));
    if (buf.length > 0) await fh.read(buf, 0, buf.length, start);
    // Copy out of the pooled Buffer: `new Uint8Array(buf)` would keep a view on
    // Node's shared allocation pool alive across the IPC boundary.
    return { ok: true, value: { bytes: Uint8Array.from(buf), size: st.size } };
  } catch (err) {
    return { ok: false, error: mapFsError(err, path) };
  } finally {
    await fh.close().catch(() => {});
  }
}
