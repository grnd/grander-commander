import { describe, it, expect, vi } from 'vitest';
import type { FileEntry, Result } from '@shared/types';
import { initialPanelState, type PanelState } from '@renderer/state/panelSlice';
import type { EditorState } from '@renderer/state/store';
import {
  closeEditor, describeReadError, describeWriteError, openEditor, saveEditor,
} from '@renderer/commands/editor';

const entry = (name: string, ext = '', isDir = false): FileEntry => ({
  name, ext, isDir, size: 0, mtime: 0, isLink: false, isHidden: false,
});

const panel = (entries: FileEntry[], cursor = 0): PanelState => ({
  ...initialPanelState('/home'), entries, cursor,
});

const okRead = (content: string) =>
  vi.fn(async (): Promise<Result<{ content: string; size: number }>> =>
    ({ ok: true, value: { content, size: content.length } }));

describe('openEditor', () => {
  it('loads the file under the cursor into a clean buffer', async () => {
    const setEditor = vi.fn();
    await openEditor({ active: panel([entry('notes', 'txt')]), read: okRead('hi'), setEditor });
    expect(setEditor).toHaveBeenCalledWith({ path: '/home/notes.txt', original: 'hi', current: 'hi' });
  });

  it('does nothing when the cursor is on a directory', async () => {
    const setEditor = vi.fn();
    const read = okRead('hi');
    await openEditor({ active: panel([entry('sub', '', true)]), read, setEditor });
    expect(read).not.toHaveBeenCalled();
    expect(setEditor).not.toHaveBeenCalled();
  });

  it('does nothing on the synthetic ".." row', async () => {
    const setEditor = vi.fn();
    const read = okRead('hi');
    await openEditor({ active: panel([entry('..')]), read, setEditor });
    expect(read).not.toHaveBeenCalled();
    expect(setEditor).not.toHaveBeenCalled();
  });

  it('reports a read failure and opens nothing', async () => {
    const setEditor = vi.fn();
    const onError = vi.fn();
    const read = vi.fn(async (): Promise<Result<{ content: string; size: number }>> =>
      ({ ok: false, error: { kind: 'binary', path: '/home/notes.txt' } }));
    await openEditor({ active: panel([entry('notes', 'txt')]), read, setEditor, onError });
    expect(setEditor).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Cannot edit a binary file.');
  });
});

describe('saveEditor', () => {
  const ed: EditorState = { path: '/home/a.txt', original: 'old', current: 'new' };

  it('writes the buffer and rebases original so it reads clean', async () => {
    const write = vi.fn(async (): Promise<Result<void>> => ({ ok: true, value: undefined }));
    const setEditor = vi.fn();
    const saved = await saveEditor(ed, write, setEditor);
    expect(saved).toBe(true);
    expect(write).toHaveBeenCalledWith('/home/a.txt', 'new');
    expect(setEditor).toHaveBeenCalledWith({ path: '/home/a.txt', original: 'new', current: 'new' });
  });

  it('keeps the buffer dirty when the write fails', async () => {
    const write = vi.fn(async (): Promise<Result<void>> =>
      ({ ok: false, error: { kind: 'permission', path: '/home/a.txt' } }));
    const setEditor = vi.fn();
    const onError = vi.fn();
    const saved = await saveEditor(ed, write, setEditor, onError);
    expect(saved).toBe(false);
    expect(setEditor).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Permission denied: /home/a.txt');
  });
});

describe('closeEditor', () => {
  it('closes straight away when the buffer is clean', () => {
    const setEditor = vi.fn();
    const setDialog = vi.fn();
    closeEditor({ path: '/a', original: 'x', current: 'x' }, setEditor, setDialog);
    expect(setEditor).toHaveBeenCalledWith(null);
    expect(setDialog).not.toHaveBeenCalled();
  });

  it('prompts instead of discarding unsaved changes', () => {
    const setEditor = vi.fn();
    const setDialog = vi.fn();
    closeEditor({ path: '/a', original: 'x', current: 'y' }, setEditor, setDialog);
    expect(setEditor).not.toHaveBeenCalled();
    expect(setDialog).toHaveBeenCalledWith({ kind: 'editorDirtyClose' });
  });
});

describe('error descriptions', () => {
  it('renders the size of an oversized file', () => {
    expect(describeReadError({ kind: 'too-large', path: '/a', size: 12 * 1024 * 1024 }))
      .toBe('File too large to edit (12.0 MB).');
  });

  it('has a message for a full disk', () => {
    expect(describeWriteError({ kind: 'disk-full' })).toBe('Cannot save: disk is full.');
  });
});
