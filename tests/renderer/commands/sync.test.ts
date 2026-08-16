import { describe, it, expect } from 'vitest';
import { buildSyncPlan, countFor, isDestructive } from '@renderer/commands/sync';
import type { SyncEntry } from '@shared/types';

const entry = (over: Partial<SyncEntry> & { relPath: string; status: SyncEntry['status'] }): SyncEntry => ({
  isDir: false,
  leftSize: 1,
  rightSize: 1,
  leftMtime: 1,
  rightMtime: 1,
  newer: null,
  typeConflict: false,
  ...over,
});

const L = '/l';
const R = '/r';

const entries: SyncEntry[] = [
  entry({ relPath: 'onlyLeft.txt', status: 'left-only', rightSize: null, rightMtime: null }),
  entry({ relPath: 'onlyRight.txt', status: 'right-only', leftSize: null, leftMtime: null }),
  entry({ relPath: 'both.txt', status: 'differ', newer: 'left' }),
  entry({ relPath: 'equal.txt', status: 'same' }),
];

describe('isDestructive', () => {
  it('is true only for mirrors', () => {
    expect(isDestructive('mirror-right')).toBe(true);
    expect(isDestructive('mirror-left')).toBe(true);
    expect(isDestructive('copy-missing-right')).toBe(false);
    expect(isDestructive('copy-missing-left')).toBe(false);
  });
});

describe('buildSyncPlan — copy missing', () => {
  it('copies only what the destination lacks, and never deletes', () => {
    const plan = buildSyncPlan(entries, L, R, 'copy-missing-right');
    expect(plan.copies).toEqual([
      { src: '/l/onlyLeft.txt', dst: '/r/onlyLeft.txt', relPath: 'onlyLeft.txt' },
    ]);
    expect(plan.deletes).toEqual([]);
  });

  it('mirrors the direction for the other side', () => {
    const plan = buildSyncPlan(entries, L, R, 'copy-missing-left');
    expect(plan.copies).toEqual([
      { src: '/r/onlyRight.txt', dst: '/l/onlyRight.txt', relPath: 'onlyRight.txt' },
    ]);
    expect(plan.deletes).toEqual([]);
  });

  it('leaves files that merely differ alone', () => {
    const plan = buildSyncPlan(entries, L, R, 'copy-missing-right');
    expect(plan.copies.map((c) => c.relPath)).not.toContain('both.txt');
  });
});

describe('buildSyncPlan — mirror', () => {
  it('copies missing and differing files and trashes the extras', () => {
    const plan = buildSyncPlan(entries, L, R, 'mirror-right');
    expect(plan.copies.map((c) => c.relPath).sort()).toEqual(['both.txt', 'onlyLeft.txt']);
    expect(plan.deletes).toEqual(['/r/onlyRight.txt']);
  });

  it('never touches identical files', () => {
    const plan = buildSyncPlan(entries, L, R, 'mirror-right');
    expect(plan.copies.map((c) => c.relPath)).not.toContain('equal.txt');
    expect(plan.deletes).not.toContain('/r/equal.txt');
  });

  it('removes the destination first on a folder-versus-file clash', () => {
    const clash = [entry({ relPath: 'thing', status: 'differ', typeConflict: true })];
    const plan = buildSyncPlan(clash, L, R, 'mirror-right');
    expect(plan.deletes).toEqual(['/r/thing']);
    expect(plan.copies).toEqual([{ src: '/l/thing', dst: '/r/thing', relPath: 'thing' }]);
  });

  it('reverses source and destination for the leftward mirror', () => {
    const plan = buildSyncPlan(entries, L, R, 'mirror-left');
    expect(plan.copies.map((c) => c.relPath).sort()).toEqual(['both.txt', 'onlyRight.txt']);
    expect(plan.copies.every((c) => c.src.startsWith('/r/'))).toBe(true);
    expect(plan.deletes).toEqual(['/l/onlyLeft.txt']);
  });
});

describe('buildSyncPlan — selection and roots', () => {
  it('honours a selection', () => {
    const plan = buildSyncPlan(entries, L, R, 'mirror-right', new Set(['onlyLeft.txt']));
    expect(plan.copies.map((c) => c.relPath)).toEqual(['onlyLeft.txt']);
    expect(plan.deletes).toEqual([]);
  });

  it('plans nothing for an empty selection', () => {
    const plan = buildSyncPlan(entries, L, R, 'mirror-right', new Set());
    expect(plan).toEqual({ copies: [], deletes: [] });
  });

  it('preserves nested relative paths on both sides', () => {
    const nested = [entry({ relPath: 'a/b/c.txt', status: 'left-only' })];
    const plan = buildSyncPlan(nested, '/src', '/dst', 'copy-missing-right');
    expect(plan.copies[0]).toEqual({ src: '/src/a/b/c.txt', dst: '/dst/a/b/c.txt', relPath: 'a/b/c.txt' });
  });

  it('does not double the slash when a root is /', () => {
    const plan = buildSyncPlan([entry({ relPath: 'x', status: 'left-only' })], '/', '/dst', 'copy-missing-right');
    expect(plan.copies[0].src).toBe('/x');
  });
});

describe('countFor', () => {
  it('reports exactly what the plan would do', () => {
    expect(countFor(entries, L, R, 'mirror-right')).toEqual({ copies: 2, deletes: 1 });
    expect(countFor(entries, L, R, 'copy-missing-right')).toEqual({ copies: 1, deletes: 0 });
  });

  it('is zero when there is nothing to do', () => {
    const allSame = [entry({ relPath: 'equal.txt', status: 'same' })];
    expect(countFor(allSame, L, R, 'mirror-right')).toEqual({ copies: 0, deletes: 0 });
  });
});
