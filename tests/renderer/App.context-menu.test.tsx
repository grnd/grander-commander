import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { FileEntry, MenuCommand, OpEvent } from '@shared/types';

vi.mock('@renderer/components/Terminal', () => ({
  Terminal: () => null,
}));

import { App } from '@renderer/App';
import { useStore } from '@renderer/state/store';
import { initialPanelState } from '@renderer/state/panelSlice';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(target: Element) {
      this.cb([{
        target,
        contentRect: { width: 640, height: 320 } as DOMRectReadOnly,
      } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
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

let menuCb: ((cmd: MenuCommand) => void) | null = null;
let opCb: ((ev: OpEvent) => void | Promise<void>) | null = null;
const opUnsub = vi.fn();

function mockApi() {
  menuCb = null;
  opCb = null;
  opUnsub.mockReset();
  return {
    fs: {
      listDir: vi.fn().mockResolvedValue({
        ok: true,
        value: [entry('alpha', 'txt'), entry('photos', '', true), entry('zeta', 'txt')],
      }),
      stat: vi.fn(),
      mkdir: vi.fn(),
      rename: vi.fn(),
      trash: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      duplicate: vi.fn(),
    },
    volumes: { list: vi.fn().mockResolvedValue([{ name: 'Home', path: '/home/u', kind: 'home' }]) },
    ops: {
      start: vi.fn().mockResolvedValue('op-1'),
      cancel: vi.fn(),
      answerConflict: vi.fn(),
      subscribe: vi.fn((_id: string, cb: (ev: OpEvent) => void | Promise<void>) => {
        opCb = cb;
        return opUnsub;
      }),
    },
    shell: {
      openPath: vi.fn(),
      quickLook: vi.fn(),
      openTerminal: vi.fn(),
      runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    },
    terminal: {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
    },
    menu: {
      onCommand: vi.fn((cb: (cmd: MenuCommand) => void) => {
        menuCb = cb;
        return () => {};
      }),
      popupFileContext: vi.fn(),
    },
    update: {
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
      status: vi.fn().mockResolvedValue({ kind: 'idle' }),
      onStatus: vi.fn(() => () => {}),
    },
  };
}

async function renderApp() {
  render(<App />);
  const gc = window.gc as ReturnType<typeof mockApi>;
  await waitFor(() => expect(gc.fs.listDir).toHaveBeenCalledTimes(2));
  return gc;
}

describe('App context-menu flows', () => {
  beforeEach(() => {
    useStore.setState((s) => ({
      ...s,
      panels: { left: initialPanelState('/'), right: initialPanelState('/') },
      activeSide: 'left',
      volumes: [],
      dialog: null,
      favorites: [],
      favoritePickerOpen: false,
      quickSearch: null,
      terminalOpen: false,
    }));
    (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the menu target folder to favorites instead of the current panel path', async () => {
    await renderApp();

    act(() => {
      menuCb!({ command: 'addToFavorites', targetPath: '/home/u/photos' });
    });

    expect(useStore.getState().favorites).toEqual([{ path: '/home/u/photos' }]);
  });

  it('alerts, unsubscribes, and refreshes both panels when a copy op errors', async () => {
    const gc = await renderApp();
    gc.fs.listDir.mockClear();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    act(() => {
      useStore.getState().setDialog({
        kind: 'copy',
        sources: ['/home/u/alpha.txt'],
        dstDefault: '/home/u/Documents',
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith({
      kind: 'copy',
      sources: ['/home/u/alpha.txt'],
      dst: '/home/u/Documents',
    }));

    await act(async () => {
      await opCb!({
        kind: 'error',
        error: { kind: 'permission', path: '/home/u/Documents' },
        path: '/home/u/Documents',
      });
    });

    await waitFor(() => expect(opUnsub).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith('Copy failed: Permission denied: /home/u/Documents');
    expect(gc.fs.listDir).toHaveBeenCalledTimes(2);
    expect(useStore.getState().dialog).toBeNull();
  });

  it('handles an immediate terminal op event without leaving the progress dialog stuck open', async () => {
    const gc = await renderApp();
    gc.fs.listDir.mockClear();
    gc.ops.subscribe.mockImplementationOnce((_id: string, cb: (ev: OpEvent) => void | Promise<void>) => {
      cb({ kind: 'complete', filesDone: 0, bytesDone: 0 });
      return opUnsub;
    });

    act(() => {
      useStore.getState().setDialog({
        kind: 'copy',
        sources: ['/home/u/alpha.txt'],
        dstDefault: '/home/u/Documents',
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith({
      kind: 'copy',
      sources: ['/home/u/alpha.txt'],
      dst: '/home/u/Documents',
    }));
    await waitFor(() => expect(opUnsub).toHaveBeenCalledTimes(1));
    expect(gc.fs.listDir).toHaveBeenCalledTimes(2);
    expect(useStore.getState().dialog).toBeNull();
  });

  it('surfaces trash failures and skips the success refresh', async () => {
    const gc = await renderApp();
    gc.fs.listDir.mockClear();
    gc.fs.trash.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'permission', path: '/home/u/alpha.txt' },
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    useStore.setState((s) => ({
      panels: {
        ...s.panels,
        left: { ...s.panels.left, cursor: 1, selection: new Set() },
      },
    }));

    act(() => { menuCb!('trash'); });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Move to Trash failed: Permission denied: /home/u/alpha.txt');
    });
    expect(gc.fs.listDir).not.toHaveBeenCalled();
  });
});
