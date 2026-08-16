// src/main/fs/compare.ts
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { DiffResult, Result } from '@shared/types';
import { decodeText, isProbablyBinary, splitLines } from '@shared/text';
import { alignRows, diffLines, wholeFileRows } from '../diff/myers';
import { mapFsError } from './errors';

/** Past this, reading both sides into memory to diff them is not reasonable. */
export const MAX_COMPARE_BYTES = 8 * 1024 * 1024;
/** Rows past this would freeze the renderer more than they would inform it. */
export const MAX_DIFF_ROWS = 30_000;

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

export async function compareFiles(left: string, right: string): Promise<Result<DiffResult>> {
  for (const p of [left, right]) {
    try {
      const st = await stat(p);
      if (st.isDirectory()) {
        return { ok: false, error: { kind: 'name-invalid', reason: `${basename(p)} is a folder` } };
      }
      if (st.size > MAX_COMPARE_BYTES) {
        return {
          ok: false,
          error: { kind: 'name-invalid', reason: `${basename(p)} is larger than 8 MB` },
        };
      }
    } catch (err) {
      return { ok: false, error: mapFsError(err, p) };
    }
  }

  let leftBuf: Buffer;
  let rightBuf: Buffer;
  try {
    [leftBuf, rightBuf] = await Promise.all([readFile(left), readFile(right)]);
  } catch (err) {
    return { ok: false, error: mapFsError(err, left) };
  }

  const identical = sameBytes(leftBuf, rightBuf);
  const binary = isProbablyBinary(leftBuf.subarray(0, 8000))
    || isProbablyBinary(rightBuf.subarray(0, 8000));

  if (binary) {
    // A line diff of binary content is noise. Say whether the bytes match and
    // let the viewer's hex mode do the rest.
    return {
      ok: true,
      value: {
        left, right, identical, binary: true, truncated: false,
        leftSize: leftBuf.length, rightSize: rightBuf.length,
        rows: [], stats: { added: 0, removed: 0, changed: 0 },
      },
    };
  }

  const a = splitLines(decodeText(leftBuf));
  const b = splitLines(decodeText(rightBuf));
  const ops = diffLines(a, b);
  const allRows = ops ? alignRows(ops, a, b) : wholeFileRows(a, b);
  const rows = allRows.slice(0, MAX_DIFF_ROWS);

  const stats = { added: 0, removed: 0, changed: 0 };
  for (const r of allRows) {
    if (r.kind === 'add') stats.added++;
    else if (r.kind === 'del') stats.removed++;
    else if (r.kind === 'change') stats.changed++;
  }

  return {
    ok: true,
    value: {
      left, right, identical, binary: false,
      truncated: rows.length < allRows.length,
      leftSize: leftBuf.length, rightSize: rightBuf.length,
      rows, stats,
    },
  };
}
