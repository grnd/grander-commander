import { describe, it, expect, vi } from 'vitest';
import { openMkdirDialog, openRenameDialog, openCopyDialog, openMoveDialog, requestTrash, requestDeleteConfirm }
  from '@renderer/commands/mutations';
import { initialPanelState, entryKey } from '@renderer/state/panelSlice';

const e = (name: string, ext = '', isDir = false) => ({
  name, ext, isDir, isSymlink: false, isAppBundle: false, isHidden: false,
  size: 0, mtime: 0, mode: 0,
});

const mkCtx = () => {
  const active = initialPanelState('/tmp');
  active.entries = [e('..', '', true), e('a', 'txt'), e('b', 'txt')];
  active.cursor = 1;
  active.selection = new Set();
  const inactive = initialPanelState('/dst');
  const setDialog = vi.fn();
  const api = {
    fs: {
      trash: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
  return { active, inactive, setDialog, api };
};

describe('openMkdirDialog', () => {
  it('opens mkdir dialog for active side', () => {
    const { setDialog } = mkCtx();
    openMkdirDialog({ side: 'left', setDialog });
    expect(setDialog).toHaveBeenCalledWith({ kind: 'mkdir', side: 'left' });
  });
});

describe('openRenameDialog', () => {
  it('uses cursor entry name', () => {
    const { active, setDialog } = mkCtx();
    openRenameDialog({ side: 'left', panel: active, setDialog });
    expect(setDialog).toHaveBeenCalledWith({ kind: 'rename', side: 'left', oldName: 'a.txt' });
  });

  it('is a no-op on ".." cursor', () => {
    const { active, setDialog } = mkCtx();
    active.cursor = 0;
    openRenameDialog({ side: 'left', panel: active, setDialog });
    expect(setDialog).not.toHaveBeenCalled();
  });
});

describe('openCopyDialog', () => {
  it('uses selection if present, else cursor entry; dst=inactive path', () => {
    const { active, inactive, setDialog } = mkCtx();
    active.selection = new Set([entryKey(active.entries[1]), entryKey(active.entries[2])]);
    openCopyDialog({ activePath: active.path, active, inactive, setDialog });
    const arg = setDialog.mock.calls[0][0];
    expect(arg.kind).toBe('copy');
    expect(arg.sources.sort()).toEqual(['/tmp/a.txt', '/tmp/b.txt'].sort());
    expect(arg.dstDefault).toBe('/dst');
  });
});

describe('requestTrash', () => {
  it('calls api.fs.trash with selection paths', async () => {
    const { active, api } = mkCtx();
    active.selection = new Set([entryKey(active.entries[1])]);
    const afterDone = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requestTrash({ panel: active, api: api as any, afterDone });
    expect(api.fs.trash).toHaveBeenCalledWith(['/tmp/a.txt']);
    expect(afterDone).toHaveBeenCalled();
  });
});

describe('requestDeleteConfirm', () => {
  it('opens deleteConfirm dialog with selection paths', () => {
    const { active, setDialog } = mkCtx();
    active.selection = new Set([entryKey(active.entries[1])]);
    requestDeleteConfirm({ panel: active, setDialog });
    expect(setDialog).toHaveBeenCalledWith({ kind: 'deleteConfirm', paths: ['/tmp/a.txt'] });
  });
});

describe('openMoveDialog', () => {
  it('passes sources and default dst', () => {
    const { active, inactive, setDialog } = mkCtx();
    active.selection = new Set([entryKey(active.entries[1])]);
    openMoveDialog({ active, inactive, setDialog });
    expect(setDialog).toHaveBeenCalledWith({ kind: 'move', sources: ['/tmp/a.txt'], dstDefault: '/dst' });
  });
});
