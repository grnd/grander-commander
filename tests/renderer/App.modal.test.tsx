import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { FileEntry } from '@shared/types';
import { App } from '@renderer/App';
import { useStore } from '@renderer/state/store';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function entry(name: string, ext = '', isDir = false): FileEntry {
  return {
    name, ext, isDir, isSymlink: false, isAppBundle: false,
    isHidden: false, size: 1, mtime: 0, mode: 0o644,
  };
}

/** Captures the native-menu callback so a test can fire menu commands. */
let menuCb: ((cmd: string) => void) | null = null;

function mockApi() {
  menuCb = null;
  return {
    fs: {
      listDir: vi.fn().mockResolvedValue({
        ok: true,
        value: [entry('notes', 'txt'), entry('photos', '', true)],
      }),
      stat: vi.fn(), mkdir: vi.fn(), rename: vi.fn(),
      trash: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      duplicate: vi.fn(),
    },
    volumes: { list: vi.fn().mockResolvedValue([{ name: 'Home', path: '/home/u', kind: 'home' }]) },
    ops: { start: vi.fn(), cancel: vi.fn(), answerConflict: vi.fn(), subscribe: vi.fn(() => () => {}) },
    shell: {
      openPath: vi.fn(), quickLook: vi.fn(), openTerminal: vi.fn(),
      runCommand: vi.fn().mockResolvedValue({ stdout: 'hello', stderr: '', exitCode: 0 }),
    },
    terminal: {
      spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}),
    },
    menu: {
      onCommand: vi.fn((cb: (cmd: string) => void) => { menuCb = cb; return () => {}; }),
      popupFileContext: vi.fn(),
    },
  };
}

/** Renders App and leaves the command-output modal open. */
async function openOutputModal() {
  render(<App />);
  const input = await screen.findByRole('textbox', { name: '' })
    .catch(() => document.querySelector('.gc-cmdline-input') as HTMLInputElement);
  const cmdline = (input as HTMLInputElement) ?? document.querySelector('.gc-cmdline-input');
  fireEvent.change(cmdline, { target: { value: 'echo hello' } });
  fireEvent.keyDown(cmdline, { key: 'Enter' });
  await waitFor(() => expect(document.querySelector('.gc-cmdresult')).toBeTruthy());
}

describe('command-output modal owns the keyboard', () => {
  beforeEach(() => {
    useStore.setState({ dialog: null, favoritePickerOpen: false, terminalOpen: false });
    (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
  });

  it('swallows Tab so focus cannot escape to controls behind the backdrop', async () => {
    await openOutputModal();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    // Unprevented Tab performs default focus traversal out of the modal, after
    // which the router's INPUT guard bypasses the modal branch entirely.
    expect(evt.defaultPrevented).toBe(true);
  });

  it('ignores a native-menu trash command while the modal is open', async () => {
    await openOutputModal();
    const gc = (window as unknown as { gc: ReturnType<typeof mockApi> }).gc;

    // Park the cursor on a real file. Index 0 is the synthetic "..", for which
    // selectionPaths returns [] — leaving it there would make this test pass
    // whether or not the gate exists.
    const side = useStore.getState().activeSide;
    useStore.setState((s) => ({
      panels: { ...s.panels, [side]: { ...s.panels[side], cursor: 1 } },
    }));
    const cur = useStore.getState().panels[side];
    expect(cur.entries[cur.cursor]?.name).not.toBe('..');

    expect(menuCb).toBeTypeOf('function');
    menuCb!('trash');
    await waitFor(() => expect(document.querySelector('.gc-cmdresult')).toBeTruthy());
    // requestTrash calls fs.trash immediately — there is no confirmation step.
    expect(gc.fs.trash).not.toHaveBeenCalled();
  });
});
