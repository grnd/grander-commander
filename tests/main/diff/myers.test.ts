import { describe, it, expect } from 'vitest';
import { alignRows, diffLines, wholeFileRows, type EditOp } from '@main/diff/myers';

/** Apply an edit script to `a` and expect it to reproduce `b`. */
function replay(ops: EditOp[], a: string[], b: string[]): string[] {
  return ops.map((op) => (op.kind === 'ins' ? b[op.b] : a[op.a])).filter((_, i) => ops[i].kind !== 'del');
}

const rows = (a: string[], b: string[]) => {
  const ops = diffLines(a, b);
  expect(ops).not.toBeNull();
  return alignRows(ops!, a, b);
};

describe('diffLines', () => {
  it('produces no edits for identical input', () => {
    const ops = diffLines(['a', 'b'], ['a', 'b']);
    expect(ops!.every((o) => o.kind === 'eq')).toBe(true);
  });

  it('handles two empty files', () => {
    expect(diffLines([], [])).toEqual([]);
  });

  it('reports a pure insertion', () => {
    const ops = diffLines(['a'], ['a', 'b'])!;
    expect(ops.filter((o) => o.kind === 'ins')).toHaveLength(1);
    expect(ops.filter((o) => o.kind === 'del')).toHaveLength(0);
  });

  it('reports a pure deletion', () => {
    const ops = diffLines(['a', 'b'], ['a'])!;
    expect(ops.filter((o) => o.kind === 'del')).toHaveLength(1);
    expect(ops.filter((o) => o.kind === 'ins')).toHaveLength(0);
  });

  it('handles an empty left side', () => {
    const ops = diffLines([], ['a', 'b'])!;
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.kind === 'ins')).toBe(true);
  });

  it('handles an empty right side', () => {
    const ops = diffLines(['a', 'b'], [])!;
    expect(ops.every((o) => o.kind === 'del')).toBe(true);
  });

  // The classic worked example from Myers' paper.
  it('finds a minimal script for the canonical ABCABBA / CBABAC case', () => {
    const a = 'ABCABBA'.split('');
    const b = 'CBABAC'.split('');
    const ops = diffLines(a, b)!;
    const edits = ops.filter((o) => o.kind !== 'eq').length;
    expect(edits).toBe(5);
    expect(replay(ops, a, b).join('')).toBe('CBABAC');
  });

  it('replays back to the right-hand file for a realistic edit', () => {
    const a = ['import x', '', 'function f() {', '  return 1;', '}'];
    const b = ['import x', 'import y', '', 'function f() {', '  return 2;', '}'];
    const ops = diffLines(a, b)!;
    expect(replay(ops, a, b)).toEqual(b);
  });

  it('gives up rather than grinding when the files share nothing', () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
    expect(diffLines(a, b, 10)).toBeNull();
  });

  it('stays cheap when two large files differ by one line', () => {
    const a = Array.from({ length: 20_000 }, (_, i) => `line ${i}`);
    const b = a.slice();
    b[10_000] = 'changed';
    const started = process.hrtime.bigint();
    const ops = diffLines(a, b)!;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    expect(ops.filter((o) => o.kind !== 'eq')).toHaveLength(2);
    expect(ms).toBeLessThan(2000);
  });
});

describe('alignRows', () => {
  it('marks matching lines as same, with both line numbers', () => {
    expect(rows(['a'], ['a'])).toEqual([
      { leftNo: 1, rightNo: 1, left: 'a', right: 'a', kind: 'same' },
    ]);
  });

  it('pairs a delete-then-insert run into change rows', () => {
    const r = rows(['a', 'x', 'c'], ['a', 'y', 'c']);
    expect(r.map((x) => x.kind)).toEqual(['same', 'change', 'same']);
    expect(r[1]).toMatchObject({ left: 'x', right: 'y', leftNo: 2, rightNo: 2 });
  });

  it('leaves a pure insertion with an empty left cell', () => {
    const r = rows(['a'], ['a', 'b']);
    expect(r[1]).toEqual({ leftNo: null, rightNo: 2, left: null, right: 'b', kind: 'add' });
  });

  it('leaves a pure deletion with an empty right cell', () => {
    const r = rows(['a', 'b'], ['a']);
    expect(r[1]).toEqual({ leftNo: 2, rightNo: null, left: 'b', right: null, kind: 'del' });
  });

  it('pairs what it can and leaves the surplus as adds', () => {
    const r = rows(['a', 'x'], ['a', 'y', 'z']);
    expect(r.map((x) => x.kind)).toEqual(['same', 'change', 'add']);
  });

  it('keeps every left line exactly once, in order', () => {
    const a = ['1', '2', '3', '4', '5'];
    const b = ['1', '3', '9', '5'];
    const r = rows(a, b);
    expect(r.map((x) => x.left).filter((l): l is string => l !== null)).toEqual(a);
    expect(r.map((x) => x.right).filter((l): l is string => l !== null)).toEqual(b);
  });
});

describe('wholeFileRows', () => {
  it('lines files up positionally when a real diff is out of reach', () => {
    const r = wholeFileRows(['a', 'b'], ['a', 'c', 'd']);
    expect(r.map((x) => x.kind)).toEqual(['same', 'change', 'add']);
  });

  it('handles one side being empty', () => {
    expect(wholeFileRows(['a'], []).map((x) => x.kind)).toEqual(['del']);
  });
});
