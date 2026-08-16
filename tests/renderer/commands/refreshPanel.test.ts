import { describe, it, expect, vi } from 'vitest';
import { refreshPanel } from '@renderer/commands/navigation';
import { initialPanelState, type PanelState } from '@renderer/state/panelSlice';
import type { FileEntry } from '@shared/types';

const file = (name: string, ext = 'txt'): FileEntry =>
  ({ name, ext, isDir: false, isSymlink: false, isAppBundle: false, isHidden: false, size: 1, mtime: 0, mode: 0 });

const dotDot = file('..', '');

/** A panel at /dir listing a.txt, b.txt, c.txt with `..` first. */
function panel(cursor: number): PanelState {
  return {
    ...initialPanelState('/dir'),
    entries: [dotDot, file('a'), file('b'), file('c')],
    cursor,
  };
}

function api(after: FileEntry[]) {
  return {
    fs: { listDir: vi.fn(async () => ({ ok: true as const, value: after })) },
    shell: { openPath: vi.fn(async () => {}) },
  };
}

async function refresh(before: PanelState, after: FileEntry[]) {
  let next = before;
  await refreshPanel({
    panel: before,
    setPanel: (p) => { next = { ...next, ...p } as PanelState; },
    api: api(after),
    requestKey: `t-${Math.random()}`,
  });
  return next;
}

const nameAt = (p: PanelState) => p.entries[p.cursor]?.name;

describe('refreshPanel', () => {
  // After a copy the row is still there, so the cursor should not move at all.
  it('keeps the cursor on the same file when it survives', async () => {
    const next = await refresh(panel(2), [file('a'), file('b'), file('c')]);
    expect(nameAt(next)).toBe('b');
  });

  // After a delete the row is gone; TC leaves you on whatever moved up into
  // that slot, not at the top of the panel.
  it('lands on the row that took its place when the file is gone', async () => {
    const next = await refresh(panel(2), [file('a'), file('c')]);
    expect(nameAt(next)).toBe('c');
  });

  it('follows the file when the listing order shifts', async () => {
    const next = await refresh(panel(3), [file('a'), file('b'), file('bb'), file('c')]);
    expect(nameAt(next)).toBe('c');
  });

  it('clamps to the last row when the tail was deleted', async () => {
    const next = await refresh(panel(3), [file('a')]);
    expect(nameAt(next)).toBe('a');
    expect(next.cursor).toBe(1);
  });

  it('survives the folder emptying out entirely', async () => {
    const next = await refresh(panel(2), []);
    expect(next.cursor).toBe(0);
    expect(nameAt(next)).toBe('..');
  });

  it('stays on .. when that is where the cursor already was', async () => {
    const next = await refresh(panel(0), [file('a'), file('b'), file('c')]);
    expect(next.cursor).toBe(0);
  });

  it('re-lists the folder the panel is showing', async () => {
    const a = api([file('a')]);
    await refreshPanel({ panel: panel(1), setPanel: () => {}, api: a, requestKey: 'x' });
    expect(a.fs.listDir).toHaveBeenCalledWith('/dir', expect.anything());
  });

  it('clears the marked set, which the finished operation consumed', async () => {
    const before = { ...panel(2), selection: new Set(['a.txt']) };
    const next = await refresh(before, [file('a'), file('b')]);
    expect(next.selection.size).toBe(0);
  });
});
