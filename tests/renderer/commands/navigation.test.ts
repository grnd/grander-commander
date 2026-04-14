import { describe, it, expect, vi } from 'vitest';
import { navigateInto, navigateUp, cursorMove } from '@renderer/commands/navigation';
import type { FileEntry } from '@shared/types';
import { initialPanelState } from '@renderer/state/panelSlice';

const mkEntry = (over: Partial<FileEntry>): FileEntry => ({
  name: 'x', ext: '', isDir: false, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 0, mtime: 0, mode: 0, ...over,
});

const mkCtx = () => {
  const panel = initialPanelState('/tmp');
  panel.entries = [
    mkEntry({ name: '..', isDir: true }),
    mkEntry({ name: 'sub', isDir: true }),
    mkEntry({ name: 'readme', ext: 'md' }),
  ];
  const setPanel = vi.fn();
  const api = {
    fs: {
      listDir: vi.fn().mockResolvedValue({
        ok: true,
        value: [mkEntry({ name: 'x' })],
      }),
      stat: vi.fn(),
    },
    shell: { openPath: vi.fn().mockResolvedValue(undefined) },
  };
  return { panel, setPanel, api };
};

describe('cursorMove', () => {
  it('clamps cursor to [0, entries.length-1]', async () => {
    const { panel, setPanel } = mkCtx();
    panel.cursor = 1;
    await cursorMove({ panel, delta: 5, setPanel });
    expect(setPanel).toHaveBeenCalledWith({ cursor: 2 });
  });

  it('clamps below 0', async () => {
    const { panel, setPanel } = mkCtx();
    panel.cursor = 1;
    await cursorMove({ panel, delta: -10, setPanel });
    expect(setPanel).toHaveBeenCalledWith({ cursor: 0 });
  });
});

describe('navigateInto', () => {
  it('reads new dir and replaces entries when cursor is on a directory', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.cursor = 1; // 'sub' directory
    await navigateInto({ panel, setPanel, api });
    expect(api.fs.listDir).toHaveBeenCalledWith('/tmp/sub', { showHidden: false });
    expect(setPanel).toHaveBeenCalledWith(expect.objectContaining({
      path: '/tmp/sub',
      cursor: 0,
      loading: false,
    }));
  });

  it('opens non-directory via shell.openPath and does NOT navigate', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.cursor = 2; // readme.md
    await navigateInto({ panel, setPanel, api });
    expect(api.shell.openPath).toHaveBeenCalledWith('/tmp/readme.md');
    expect(api.fs.listDir).not.toHaveBeenCalled();
  });

  it('on ".." entry, navigates to parent', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.cursor = 0; // '..'
    await navigateInto({ panel, setPanel, api });
    expect(api.fs.listDir).toHaveBeenCalledWith('/', { showHidden: false });
  });
});

describe('navigateUp', () => {
  it('navigates to parent of current path', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.path = '/tmp/foo';
    await navigateUp({ panel, setPanel, api });
    expect(api.fs.listDir).toHaveBeenCalledWith('/tmp', { showHidden: false });
  });

  it('is a no-op at root', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.path = '/';
    await navigateUp({ panel, setPanel, api });
    expect(api.fs.listDir).not.toHaveBeenCalled();
    expect(setPanel).not.toHaveBeenCalled();
  });
});
