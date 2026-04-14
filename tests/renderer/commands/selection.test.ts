import { describe, it, expect, vi } from 'vitest';
import { toggleMark, selectAll, clearSelection, rangeSelect } from '@renderer/commands/selection';
import type { FileEntry } from '@shared/types';
import { initialPanelState, entryKey } from '@renderer/state/panelSlice';

const e = (name: string, isDir = false): FileEntry => ({
  name, ext: '', isDir, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 0, mtime: 0, mode: 0,
});

describe('toggleMark', () => {
  it('adds entry to selection if absent', async () => {
    const panel = initialPanelState('/');
    panel.entries = [e('..', true), e('a'), e('b')];
    panel.cursor = 1;
    const setPanel = vi.fn();
    await toggleMark({ panel, setPanel });
    expect(setPanel).toHaveBeenCalled();
    const patch = setPanel.mock.calls[0][0];
    expect(patch.selection.has('a')).toBe(true);
  });

  it('removes entry from selection if present', async () => {
    const panel = initialPanelState('/');
    panel.entries = [e('..', true), e('a')];
    panel.cursor = 1;
    panel.selection = new Set(['a']);
    const setPanel = vi.fn();
    await toggleMark({ panel, setPanel });
    expect(setPanel.mock.calls[0][0].selection.has('a')).toBe(false);
  });

  it('never marks the ".." entry', async () => {
    const panel = initialPanelState('/');
    panel.entries = [e('..', true), e('a')];
    panel.cursor = 0;
    const setPanel = vi.fn();
    await toggleMark({ panel, setPanel });
    expect(setPanel).not.toHaveBeenCalled();
  });
});

describe('selectAll', () => {
  it('marks every entry except ".."', async () => {
    const panel = initialPanelState('/');
    panel.entries = [e('..', true), e('a'), e('b'), e('c')];
    const setPanel = vi.fn();
    await selectAll({ panel, setPanel });
    const sel = setPanel.mock.calls[0][0].selection as Set<string>;
    expect(sel.size).toBe(3);
    expect(sel.has('..')).toBe(false);
  });
});

describe('clearSelection', () => {
  it('resets selection to empty', async () => {
    const panel = initialPanelState('/');
    panel.selection = new Set(['a', 'b']);
    const setPanel = vi.fn();
    await clearSelection({ panel, setPanel });
    expect(setPanel.mock.calls[0][0].selection.size).toBe(0);
  });
});

describe('rangeSelect', () => {
  it('toggles marks for indices between cursor and new index (inclusive), then moves cursor', async () => {
    const panel = initialPanelState('/');
    panel.entries = [e('..', true), e('a'), e('b'), e('c'), e('d')];
    panel.cursor = 1; // 'a'
    const setPanel = vi.fn();
    await rangeSelect({ panel, setPanel, toIndex: 3 });
    const patch = setPanel.mock.calls[0][0];
    expect(patch.selection.has('a')).toBe(true);
    expect(patch.selection.has('b')).toBe(true);
    expect(patch.selection.has('c')).toBe(true);
    expect(patch.cursor).toBe(3);
  });
});
