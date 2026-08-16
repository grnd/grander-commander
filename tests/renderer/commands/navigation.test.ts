import { describe, it, expect, vi } from 'vitest';
import { navigateInto, navigateUp, navigateTo, cursorMove } from '@renderer/commands/navigation';
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
  return { panel, setPanel, api, requestKey: 'left' as const };
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
    await navigateInto({ panel, setPanel, api, requestKey: 'left' });
    expect(api.fs.listDir).toHaveBeenCalledWith('/tmp/sub', { showHidden: false });
    expect(setPanel).toHaveBeenCalledWith(expect.objectContaining({
      path: '/tmp/sub',
      cursor: 0,
      loading: false,
    }));
  });

  it('keeps the extension when entering a directory whose name contains a dot', async () => {
    const { panel, setPanel, api } = mkCtx();
    // listDir splits a dotted directory name into name+ext exactly as it does
    // for files — e.g. the Google Drive CloudStorage mount.
    panel.entries = [
      mkEntry({ name: 'GoogleDrive-danny.grander@gmail', ext: 'com', isDir: true }),
    ];
    panel.cursor = 0;
    await navigateInto({ panel, setPanel, api, requestKey: 'left' });
    expect(api.fs.listDir).toHaveBeenCalledWith(
      '/tmp/GoogleDrive-danny.grander@gmail.com',
      { showHidden: false },
    );
  });

  it('opens non-directory via shell.openPath and does NOT navigate', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.cursor = 2; // readme.md
    await navigateInto({ panel, setPanel, api, requestKey: 'left' });
    expect(api.shell.openPath).toHaveBeenCalledWith('/tmp/readme.md');
    expect(api.fs.listDir).not.toHaveBeenCalled();
  });

  it('on ".." entry, navigates to parent', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.cursor = 0; // '..'
    await navigateInto({ panel, setPanel, api, requestKey: 'left' });
    expect(api.fs.listDir).toHaveBeenCalledWith('/', { showHidden: false });
  });
});

describe('failed navigation', () => {
  it('reports a readable message instead of "[object Object]"', async () => {
    const { panel, setPanel, api } = mkCtx();
    api.fs.listDir.mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', path: '/tmp/gone' },
    });
    const ok = await navigateTo({ panel, setPanel, api, path: '/tmp/gone', requestKey: 'left' });
    expect(ok).toBe(false);
    expect(setPanel).toHaveBeenCalledWith({
      loading: false,
      error: 'Not found: /tmp/gone',
    });
  });

  it('reports permission errors with the path', async () => {
    const { panel, setPanel, api } = mkCtx();
    api.fs.listDir.mockResolvedValue({
      ok: false,
      error: { kind: 'permission', path: '/tmp/secret' },
    });
    await navigateTo({ panel, setPanel, api, path: '/tmp/secret', requestKey: 'left' });
    expect(setPanel).toHaveBeenCalledWith({
      loading: false,
      error: 'Permission denied: /tmp/secret',
    });
  });

  it('ignores an older in-flight response after a newer destination starts loading', async () => {
    const { panel, setPanel, api } = mkCtx();
    let resolveFirst!: (value: { ok: true; value: FileEntry[] }) => void;
    let resolveSecond!: (value: { ok: true; value: FileEntry[] }) => void;
    api.fs.listDir
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const first = navigateTo({ panel, setPanel, api, path: '/tmp/older', requestKey: 'left' });
    const second = navigateTo({ panel, setPanel, api, path: '/tmp/newer', requestKey: 'left' });

    resolveSecond({ ok: true, value: [mkEntry({ name: 'fresh' })] });
    await expect(second).resolves.toBe(true);
    resolveFirst({ ok: true, value: [mkEntry({ name: 'stale' })] });
    await expect(first).resolves.toBe(false);

    const pathUpdates = setPanel.mock.calls
      .map(([patch]) => patch as Partial<ReturnType<typeof initialPanelState>>)
      .filter((patch) => typeof patch.path === 'string');
    expect(pathUpdates).toEqual([
      expect.objectContaining({ path: '/tmp/newer' }),
    ]);
  });
});

describe('navigateUp', () => {
  it('navigates to parent of current path', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.path = '/tmp/foo';
    await navigateUp({ panel, setPanel, api, requestKey: 'left' });
    expect(api.fs.listDir).toHaveBeenCalledWith('/tmp', { showHidden: false });
  });

  it('is a no-op at root', async () => {
    const { panel, setPanel, api } = mkCtx();
    panel.path = '/';
    await navigateUp({ panel, setPanel, api, requestKey: 'left' });
    expect(api.fs.listDir).not.toHaveBeenCalled();
    expect(setPanel).not.toHaveBeenCalled();
  });
});
