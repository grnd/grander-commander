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
  isLink: false,
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
    expect(plan).toEqual({ copies: [], deletes: [], skipped: [] });
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

// Regression: the scan reports both `clash` (folder here, file there) and
// `clash/inner.txt` (left-only). Copy-missing skips the conflict but used to
// still plan a write *underneath* it, which died mid-run with ENOTDIR.
describe('buildSyncPlan — folder/file conflicts', () => {
  const conflict: SyncEntry[] = [
    entry({ relPath: 'clash', status: 'differ', isDir: true, typeConflict: true }),
    entry({ relPath: 'clash/inner.txt', status: 'left-only' }),
    entry({ relPath: 'fine.txt', status: 'left-only' }),
  ];

  it('refuses to copy into a conflict copy-missing is not resolving', () => {
    const plan = buildSyncPlan(conflict, L, R, 'copy-missing-right');
    expect(plan.copies.map((c) => c.relPath)).toEqual(['fine.txt']);
    expect(plan.skipped.map((s) => s.relPath)).toEqual(['clash/inner.txt']);
  });

  it('explains why it skipped them', () => {
    const plan = buildSyncPlan(conflict, L, R, 'copy-missing-right');
    expect(plan.skipped[0].reason).toMatch(/conflict/);
  });

  it('resolves the conflict under mirror, and lets the folder carry its child', () => {
    const plan = buildSyncPlan(conflict, L, R, 'mirror-right');
    expect(plan.deletes).toEqual(['/r/clash']);
    expect(plan.copies.map((c) => c.relPath).sort()).toEqual(['clash', 'fine.txt']);
    expect(plan.skipped).toEqual([]);
  });

  it('never plans a child alongside the directory that already carries it', () => {
    const nested: SyncEntry[] = [
      entry({ relPath: 'dir', status: 'left-only', isDir: true }),
      entry({ relPath: 'dir/a.txt', status: 'left-only' }),
      entry({ relPath: 'dir/deep/b.txt', status: 'left-only' }),
    ];
    const plan = buildSyncPlan(nested, L, R, 'copy-missing-right');
    expect(plan.copies.map((c) => c.relPath)).toEqual(['dir']);
  });

  it('does not mistake a sibling with a shared prefix for a child', () => {
    const siblings: SyncEntry[] = [
      entry({ relPath: 'dir', status: 'left-only', isDir: true }),
      entry({ relPath: 'dirty.txt', status: 'left-only' }),
    ];
    const plan = buildSyncPlan(siblings, L, R, 'copy-missing-right');
    expect(plan.copies.map((c) => c.relPath).sort()).toEqual(['dir', 'dirty.txt']);
  });
});

// Deleting a folder takes its contents with it. A descendant scheduled
// separately fails with ENOENT and aborts the run — after the folder is gone
// and before its replacement is copied.
describe('buildSyncPlan — no delete under a delete', () => {
  it('drops descendant deletes when the folder above is already going', () => {
    const nested: SyncEntry[] = [
      entry({ relPath: 'thing', status: 'differ', isDir: true, typeConflict: true }),
      entry({ relPath: 'thing/sub.txt', status: 'right-only' }),
      entry({ relPath: 'thing/deep/x.txt', status: 'right-only' }),
    ];
    const plan = buildSyncPlan(nested, L, R, 'mirror-right');
    expect(plan.deletes).toEqual(['/r/thing']);
    // And the replacement still gets copied, which is the half that was lost.
    expect(plan.copies.map((c) => c.relPath)).toEqual(['thing']);
  });

  it('keeps independent deletes', () => {
    const two: SyncEntry[] = [
      entry({ relPath: 'a.txt', status: 'right-only' }),
      entry({ relPath: 'b.txt', status: 'right-only' }),
    ];
    expect(buildSyncPlan(two, L, R, 'mirror-right').deletes.sort())
      .toEqual(['/r/a.txt', '/r/b.txt']);
  });

  it('does not mistake a sibling sharing a prefix for a child', () => {
    const siblings: SyncEntry[] = [
      entry({ relPath: 'dir', status: 'right-only', isDir: true }),
      entry({ relPath: 'dirty.txt', status: 'right-only' }),
    ];
    expect(buildSyncPlan(siblings, L, R, 'mirror-right').deletes.sort())
      .toEqual(['/r/dir', '/r/dirty.txt']);
  });

  it('handles a destination root of /', () => {
    const nested: SyncEntry[] = [
      entry({ relPath: 'thing', status: 'right-only', isDir: true }),
      entry({ relPath: 'thing/sub.txt', status: 'right-only' }),
    ];
    expect(buildSyncPlan(nested, '/l', '/', 'mirror-right').deletes).toEqual(['/thing']);
  });
});
