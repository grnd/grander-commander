import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Editor } from '@renderer/components/Editor';
import { Dialogs } from '@renderer/components/dialogs';
import { useStore } from '@renderer/state/store';

const noop = () => {};
const handlers = {
  onMkdir: noop, onNewFile: noop, onRename: noop, onDeleteConfirmed: noop,
  onCopyConfirmed: noop, onMoveConfirmed: noop, onOverwriteAnswer: noop,
  onCancelOp: noop, onFavoriteSaved: noop, onFavoriteRemoved: noop,
  onMultiRename: noop, onSyncRun: noop, onSearchResults: noop, onPack: noop,
  onCancelArchive: noop, onEditorSave: noop, onEditorDiscard: noop,
};

/** Editor and Dialogs are siblings in App, so the race needs both mounted. */
const renderBoth = () => render(<><Dialogs {...handlers} /><Editor /></>);

beforeEach(() => {
  useStore.setState({ editor: null, dialog: null });
  window.gc = {
    fs: { writeTextFile: vi.fn(async () => ({ ok: true, value: undefined })) },
  } as unknown as typeof window.gc;
});

describe('Editor', () => {
  it('renders the path and the buffer', () => {
    useStore.setState({ editor: { path: '/tmp/a.txt', original: 'hi', current: 'hi' } });
    renderBoth();
    expect(screen.getByText('/tmp/a.txt')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hi');
  });

  it('marks the buffer modified once it diverges from disk', () => {
    useStore.setState({ editor: { path: '/tmp/a.txt', original: 'hi', current: 'hi' } });
    renderBoth();
    expect(document.querySelector('.gc-editor-badge.is-dirty')).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi there' } });
    expect(document.querySelector('.gc-editor-badge.is-dirty')).not.toBeNull();
  });

  it('closes on Escape when the buffer is clean', () => {
    useStore.setState({ editor: { path: '/tmp/a.txt', original: 'hi', current: 'hi' } });
    renderBoth();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(useStore.getState().editor).toBeNull();
  });

  // Regression guard. In Chromium, DialogShell's document-level Escape
  // listener was live before the opening keypress finished propagating, so the
  // prompt was dismissed by the very Escape that raised it and the buffer's
  // unsaved-changes guard silently did nothing. jsdom flushes effects after
  // dispatch and so cannot stage that race — this asserts the fix's actual
  // contract instead: the editor consumes Escape, so nothing on document sees it.
  it('does not let the closing Escape reach document-level listeners', () => {
    const onDocKey = vi.fn();
    document.addEventListener('keydown', onDocKey);
    try {
      useStore.setState({ editor: { path: '/tmp/a.txt', original: 'hi', current: 'changed' } });
      renderBoth();
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
      expect(onDocKey).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', onDocKey);
    }
  });

  it('raises the dirty-close prompt and keeps the buffer behind it', () => {
    useStore.setState({ editor: { path: '/tmp/a.txt', original: 'hi', current: 'changed' } });
    renderBoth();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(useStore.getState().dialog).toEqual({ kind: 'editorDirtyClose' });
    expect(screen.getByText('The file has unsaved changes.')).toBeTruthy();
    // The buffer must still be there behind the prompt.
    expect(useStore.getState().editor).not.toBeNull();
  });

  it('saves on Cmd+S and rebases the dirty marker', async () => {
    useStore.setState({ editor: { path: '/tmp/a.txt', original: 'hi', current: 'changed' } });
    renderBoth();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 's', metaKey: true });
    await vi.waitFor(() => {
      expect(useStore.getState().editor).toEqual({
        path: '/tmp/a.txt', original: 'changed', current: 'changed',
      });
    });
    expect(window.gc.fs.writeTextFile).toHaveBeenCalledWith('/tmp/a.txt', 'changed');
  });
});
