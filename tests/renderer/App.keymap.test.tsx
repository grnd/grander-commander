import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import type { FileEntry } from '@shared/types';
import { App } from '@renderer/App';
import { useStore } from '@renderer/state/store';
import { initialPanelState } from '@renderer/state/panelSlice';
import { defaultBindings } from '@shared/commands/catalog';
import { keymapApi, snapshotOf } from './keymapApi';

let onChanged: ((s: unknown) => void) | null = null;

function entry(name: string, ext = '', isDir = false): FileEntry {
  return { name, ext, isDir, isSymlink: false, isAppBundle: false,
    isHidden: false, size: 1, mtime: 0, mode: 0o644 };
}

function mockApi() {
  const keymap = keymapApi();
  keymap.onChanged = vi.fn((cb: (s: unknown) => void) => { onChanged = cb; return () => {}; });
  return {
    keymap,
    fs: {
      listDir: vi.fn().mockResolvedValue({
        ok: true, value: [entry('notes', 'txt'), entry('photos', '', true)],
      }),
      stat: vi.fn(), mkdir: vi.fn(), rename: vi.fn(), duplicate: vi.fn(),
      trash: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      watchDir: vi.fn().mockResolvedValue(undefined),
      unwatchDir: vi.fn().mockResolvedValue(undefined),
      onDirChanged: vi.fn(() => () => {}),
      readChunk: vi.fn().mockResolvedValue({ ok: true, value: { bytes: new Uint8Array(), size: 0 } }),
    },
    volumes: { list: vi.fn().mockResolvedValue([{ name: 'Home', path: '/home/u', kind: 'home' }]) },
    ops: { start: vi.fn(), cancel: vi.fn(), answerConflict: vi.fn(), subscribe: vi.fn(() => () => {}) },
    shell: {
      openPath: vi.fn(), quickLook: vi.fn(), openTerminal: vi.fn(), quit: vi.fn(),
      openInFinder: vi.fn().mockResolvedValue(undefined),
      finderIcon: vi.fn().mockResolvedValue(null),
      runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    },
    terminal: {
      spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}),
    },
    menu: { onCommand: vi.fn(() => () => {}), popupFileContext: vi.fn() },
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
  onChanged = null;
  useStore.setState({
    dialog: null, favoritePickerOpen: false, terminalOpen: false, quickSearch: null,
    viewer: null, editor: null, activeSide: 'left',
    panels: { left: initialPanelState('/home/u'), right: initialPanelState('/home/u/Documents') },
  });
  (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
});

const listed = () => waitFor(() =>
  expect(useStore.getState().panels.left.entries.length).toBeGreaterThan(1));

describe('the renderer follows the keymap', () => {
  it('hydrates from main on boot', async () => {
    render(<App />);
    await waitFor(() => expect(useStore.getState().keymap.revision).toBe(1));
  });

  // Review Focus 5: the edit happened in the other window.
  it('routes by the broadcast keymap, with no restart', async () => {
    render(<App />);
    await listed();
    await waitFor(() => expect(onChanged).not.toBeNull());
    const before = useStore.getState().panels.left.showHidden;
    const base = defaultBindings();

    act(() => {
      onChanged!(snapshotOf({ ...base, global: { ...base.global, toggleHidden: ['F12'] } }, 2));
    });

    fireEvent.keyDown(document, { key: 'h', code: 'KeyH', ctrlKey: true });
    await waitFor(() => expect(useStore.getState().panels.left.showHidden).toBe(before));
    fireEvent.keyDown(document, { key: 'F12', code: 'F12' });
    await waitFor(() => expect(useStore.getState().panels.left.showHidden).toBe(!before));
  });

  it('shows the new key in the F-key bar and the cheatsheet', async () => {
    render(<App />);
    await listed();
    await waitFor(() => expect(onChanged).not.toBeNull());
    const base = defaultBindings();

    act(() => { onChanged!(snapshotOf({ ...base, global: { ...base.global, copy: ['F12'] } }, 2)); });

    await waitFor(() => expect(screen.getByRole('button', { name: /F12.*Copy/ })).toBeInTheDocument());
    fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
    const sheet = await waitFor(() => document.querySelector('.gc-cheatsheet') as HTMLElement);
    expect(within(sheet).getByText('F12')).toBeInTheDocument();
  });

  // The closing half of hold-to-show has to follow the rebind too.
  it('closes the cheatsheet when the rebound key comes back up', async () => {
    render(<App />);
    await listed();
    await waitFor(() => expect(onChanged).not.toBeNull());
    const base = defaultBindings();
    act(() => {
      onChanged!(snapshotOf({ ...base, panel: { ...base.panel, toggleCheatsheet: ['F12'] } }, 2));
    });

    fireEvent.keyDown(document, { key: 'F12', code: 'F12' });
    await waitFor(() => expect(document.querySelector('.gc-cheatsheet')).toBeTruthy());
    fireEvent.keyUp(document, { key: 'F12', code: 'F12' });
    await waitFor(() => expect(document.querySelector('.gc-cheatsheet')).toBeNull());
  });
});
