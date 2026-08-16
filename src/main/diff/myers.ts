// src/main/diff/myers.ts
//
// Myers' O(ND) line diff. Chosen over a full LCS table because the cost scales
// with how *different* the files are, not with how big they are: two 50k-line
// files with a ten-line change cost ~10 rounds, where the DP table would want
// 2.5 billion cells.

import type { DiffRow } from '@shared/types';

export type EditOp =
  | { kind: 'eq'; a: number; b: number }
  | { kind: 'del'; a: number }
  | { kind: 'ins'; b: number };

/**
 * Memory the trace is allowed to occupy.
 *
 * The trace keeps one Int32Array snapshot per edit distance, and each is
 * `2*maxEdits+3` wide — so its cost grows with the *square* of the edit budget,
 * not linearly. A flat budget of 20,000 edits quietly meant 20,000 snapshots of
 * 40,003 elements: about 3 GB, reached before the "too different" fallback ever
 * triggered, which killed the process instead.
 */
export const TRACE_MEMORY_BUDGET_BYTES = 64 * 1024 * 1024;

/** The largest edit budget whose trace fits in `bytes`. */
export function maxEditsForBudget(bytes: number = TRACE_MEMORY_BUDGET_BYTES): number {
  // d snapshots × (2d+3) elements × 4 bytes ≈ 8d² bytes.
  return Math.max(1, Math.floor(Math.sqrt(bytes / 8)));
}

/**
 * Beyond this many edits the files are not usefully "a diff of" each other and
 * the algorithm's cost starts to bite; callers fall back to a whole-file
 * replacement rather than burning seconds — or gigabytes — on it.
 */
export const DEFAULT_MAX_EDITS = maxEditsForBudget();

/**
 * Returns the edit script, or null when `a` and `b` differ by more than
 * `maxEdits` operations.
 */
export function diffLines(
  a: readonly string[],
  b: readonly string[],
  maxEdits: number = DEFAULT_MAX_EDITS,
): EditOp[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(maxEdits, n + m);
  // +3 of headroom: at d === max the loop reads k+1, which is one past the
  // widest diagonal it ever writes.
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    // Snapshot before the round, which is what backtracking needs to find the
    // predecessor of each furthest-reaching point.
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];          // came down: an insertion from b
      } else {
        x = v[offset + k - 1] + 1;      // came right: a deletion from a
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, offset, n, m);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], offset: number, n: number, m: number): EditOp[] {
  const ops: EditOp[] = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = d === 0 ? 0 : v[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--; y--;
      ops.push({ kind: 'eq', a: x, b: y });
    }
    if (d === 0) break;
    if (x === prevX) { y--; ops.push({ kind: 'ins', b: y }); }
    else { x--; ops.push({ kind: 'del', a: x }); }
    x = prevX;
    y = prevY;
  }

  return ops.reverse();
}

/**
 * Turn the edit script into side-by-side rows. A run of deletions immediately
 * followed by insertions is the normal shape of an edited line, so those are
 * paired into `change` rows; whatever is left over stays a pure add or delete.
 */
export function alignRows(
  ops: readonly EditOp[],
  a: readonly string[],
  b: readonly string[],
  /** Stop here. The caller only renders so many rows; building millions to
   *  throw all but the first few away is pure allocation. */
  limit = Number.MAX_SAFE_INTEGER,
): DiffRow[] {
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < ops.length && rows.length < limit) {
    const op = ops[i];
    if (op.kind === 'eq') {
      rows.push({
        leftNo: op.a + 1, rightNo: op.b + 1,
        left: a[op.a], right: b[op.b], kind: 'same',
      });
      i++;
      continue;
    }
    const dels: number[] = [];
    const ins: number[] = [];
    while (i < ops.length && ops[i].kind !== 'eq') {
      const cur = ops[i];
      if (cur.kind === 'del') dels.push(cur.a);
      else if (cur.kind === 'ins') ins.push(cur.b);
      i++;
    }
    const paired = Math.min(dels.length, ins.length);
    for (let j = 0; j < paired; j++) {
      rows.push({
        leftNo: dels[j] + 1, rightNo: ins[j] + 1,
        left: a[dels[j]], right: b[ins[j]], kind: 'change',
      });
    }
    for (let j = paired; j < dels.length; j++) {
      rows.push({ leftNo: dels[j] + 1, rightNo: null, left: a[dels[j]], right: null, kind: 'del' });
    }
    for (let j = paired; j < ins.length; j++) {
      rows.push({ leftNo: null, rightNo: ins[j] + 1, left: null, right: b[ins[j]], kind: 'add' });
    }
  }
  return rows;
}

/** Rows for the fallback case: two files with nothing useful in common. */
export function wholeFileRows(
  a: readonly string[],
  b: readonly string[],
  limit = Number.MAX_SAFE_INTEGER,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const paired = Math.min(a.length, b.length, limit);
  for (let i = 0; i < paired; i++) {
    rows.push({ leftNo: i + 1, rightNo: i + 1, left: a[i], right: b[i], kind: a[i] === b[i] ? 'same' : 'change' });
  }
  for (let i = paired; i < a.length && rows.length < limit; i++) {
    rows.push({ leftNo: i + 1, rightNo: null, left: a[i], right: null, kind: 'del' });
  }
  for (let i = paired; i < b.length && rows.length < limit; i++) {
    rows.push({ leftNo: null, rightNo: i + 1, left: null, right: b[i], kind: 'add' });
  }
  return rows;
}
