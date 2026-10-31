import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { FileEntry } from '@shared/types';
import { App } from '@renderer/App';
import { useStore } from '@renderer/state/store';
import { initialPanelState } from '@renderer/state/panelSlice';

let menuHandler: ((m: unknown) => void) | null = null;

function entry(name: string, ext = '', isDir = false): FileEntry {
  return { name, ext, isDir, isSymlink: false, isAppBundle: false,
    isHidden: false, size: 1, mtime: 0, mode: 0o644 };
}

function mockApi() {
  return {
    fs: {
      listDir: vi.fn().mockResolvedValue({ ok: true, value: [entry('notes', 'txt'), entry('photos', '', true)] }),
      stat: vi.fn(), mkdir: vi.fn(), rename: vi.fn(), duplicate: vi.fn(),
      trash: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      watchDir: vi.fn().mockResolvedValue(undefined),
      unwatchDir: vi.fn().mockResolvedValue(undefined),
      onDirChanged: vi.fn(() => () => {}),
    },
    volumes: { list: vi.fn().mockResolvedValue([{ name: 'Home', path: '/home/u', kind: 'home' }]) },
    ops: { start: vi.fn(), cancel: vi.fn(), answerConflict: vi.fn(), subscribe: vi.fn(() => () => {}) },
    shell: {
      openPath: vi.fn(), quickLook: vi.fn(), openTerminal: vi.fn(),
      openInFinder: vi.fn().mockResolvedValue(undefined),
      finderIcon: vi.fn().mockResolvedValue(null),
      runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    },
    terminal: {
      spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}),
    },
    menu: {
      onCommand: vi.fn((cb: (m: unknown) => void) => { menuHandler = cb; return () => {}; }),
      popupFileContext: vi.fn(),
    },
    update: {
      check: vi.fn(), download: vi.fn(), install: vi.fn(),
      status: vi.fn().mockResolvedValue({ kind: 'idle' }), onStatus: vi.fn(() => () => {}),
    },
  };
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  menuHandler = null;
  useStore.setState({
    dialog: null, favoritePickerOpen: false, terminalOpen: false, quickSearch: null,
    viewer: null, editor: null, activeSide: 'left',
    panels: { left: initialPanelState('/home/u'), right: initialPanelState('/home/u/Documents') },
  });
  (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
});

const api = () => (window as unknown as { gc: ReturnType<typeof mockApi> }).gc;
const ready = () => waitFor(() => {
  expect(menuHandler).not.toBeNull();
  expect(useStore.getState().panels.left.entries.length).toBeGreaterThan(1);
});

/**
 * Park the cursor on a real file. It starts on the synthetic '..' row, which is
 * never a target — so a trash that is refused by the gate and a trash that has
 * nothing to act on look identical.
 */
function cursorOnFile() {
  const onFile = useStore.getState().panels.left.entries.findIndex((e) => e.name === 'notes');
  act(() => { useStore.getState().replacePanel('left', { cursor: onFile }); });
}

describe('menu commands are gated like keys', () => {
  // The guards for these states lived in the keyboard router, and menu
  // commands call dispatch directly — so F8 from the menu trashed files
  // behind an open dialog.
  it('does not trash files while a dialog is open', async () => {
    render(<App />);
    await ready();
    cursorOnFile();
    act(() => { useStore.getState().setDialog({ kind: 'editorDirtyClose' }); });

    act(() => { menuHandler!('trash'); });

    await waitFor(() => expect(useStore.getState().dialog).not.toBeNull());
    expect(api().fs.trash).not.toHaveBeenCalled();
  });

  it('does not trash files while the viewer is up', async () => {
    render(<App />);
    await ready();
    cursorOnFile();
    act(() => { useStore.getState().setViewer({ path: '/home/u/notes.txt' }); });

    act(() => { menuHandler!('trash'); });

    await waitFor(() => expect(useStore.getState().viewer).not.toBeNull());
    expect(api().fs.trash).not.toHaveBeenCalled();
  });

  it('still runs a menu command when nothing is in the way', async () => {
    render(<App />);
    await ready();
    cursorOnFile();

    act(() => { menuHandler!('trash'); });

    await waitFor(() => expect(api().fs.trash).toHaveBeenCalled());
  });
});
