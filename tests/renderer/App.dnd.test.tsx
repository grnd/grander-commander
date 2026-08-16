import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, createEvent, waitFor } from '@testing-library/react';
import type { FileEntry } from '@shared/types';

vi.mock('@renderer/components/Terminal', () => ({ Terminal: () => null }));

import { App } from '@renderer/App';
import { useStore } from '@renderer/state/store';
import { initialPanelState } from '@renderer/state/panelSlice';
import { GC_PATHS } from '@renderer/commands/dnd';

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

const entry = (name: string, ext = '', isDir = false): FileEntry =>
  ({ name, ext, isDir, isSymlink: false, isAppBundle: false, isHidden: false, size: 1, mtime: 0, mode: 0o644 });

const ROWS = [entry('alpha', 'txt'), entry('photos', '', true), entry('zeta', 'txt')];

function mockApi() {
  return {
    fs: {
      listDir: vi.fn().mockResolvedValue({ ok: true, value: ROWS }),
      stat: vi.fn(), mkdir: vi.fn(), rename: vi.fn(),
      trash: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      duplicate: vi.fn(), readChunk: vi.fn(), complete: vi.fn().mockResolvedValue([]),
      compare: vi.fn(), syncScan: vi.fn(), search: vi.fn(), cancelSearch: vi.fn(),
    },
    archive: {
      isArchive: vi.fn().mockResolvedValue(false),
      list: vi.fn(), run: vi.fn(), cancel: vi.fn(), extractToTemp: vi.fn(),
    },
    volumes: { list: vi.fn().mockResolvedValue([{ name: 'Home', path: '/home/u', kind: 'home' }]) },
    ops: {
      start: vi.fn().mockResolvedValue('op-1'),
      cancel: vi.fn(), answerConflict: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    },
    shell: {
      openPath: vi.fn(), quickLook: vi.fn(), openTerminal: vi.fn(),
      runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
      startDrag: vi.fn().mockResolvedValue(undefined),
    },
    terminal: {
      spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}),
    },
    menu: { onCommand: vi.fn(() => () => {}), popupFileContext: vi.fn() },
    update: {
      check: vi.fn(), download: vi.fn(), install: vi.fn(),
      status: vi.fn().mockResolvedValue({ kind: 'idle' }),
      releaseNotes: vi.fn(), onStatus: vi.fn(() => () => {}),
    },
  };
}

/** Minimal stand-in for DataTransfer; jsdom does not implement it. */
function dataTransfer(files: { path: string }[] = []) {
  const store = new Map<string, string>();
  return {
    setData: (k: string, v: string) => { store.set(k, v); },
    getData: (k: string) => store.get(k) ?? '',
    files: files as unknown as FileList,
    effectAllowed: '',
    dropEffect: '',
  };
}

/**
 * jsdom has no DragEvent, so fireEvent's init object drops altKey/shiftKey —
 * React then sees them as undefined and every modifier rule reads as "off".
 * Defining them on the native event is what makes them visible.
 */
type DragKind = 'dragStart' | 'dragOver' | 'drop';
function fireDrag(
  el: HTMLElement,
  kind: DragKind,
  init: { dataTransfer: unknown; altKey?: boolean; shiftKey?: boolean },
) {
  const ev = createEvent[kind](el, { dataTransfer: init.dataTransfer } as never);
  if (init.altKey) Object.defineProperty(ev, 'altKey', { value: true });
  if (init.shiftKey) Object.defineProperty(ev, 'shiftKey', { value: true });
  fireEvent(el, ev);
}

async function renderApp() {
  render(<App />);
  const gc = window.gc as unknown as ReturnType<typeof mockApi>;
  await waitFor(() => expect(gc.fs.listDir).toHaveBeenCalledTimes(2));
  return gc;
}

const row = (name: string) => screen.getAllByText(name)[0].parentElement as HTMLElement;
const panelBody = (index: number) =>
  document.querySelectorAll('.gc-panel-body')[index] as HTMLElement;

/** Mark rows in the left panel without going through the mouse. */
function markLeft(...keys: string[]) {
  useStore.setState((s) => ({
    panels: { ...s.panels, left: { ...s.panels.left, selection: new Set(keys) } },
  }));
}

describe('App drag and drop', () => {
  beforeEach(() => {
    useStore.setState((s) => ({
      ...s,
      panels: { left: initialPanelState('/'), right: initialPanelState('/') },
      tabs: { left: [initialPanelState('/')], right: [initialPanelState('/')] },
      activeTab: { left: 0, right: 0 },
      activeSide: 'left',
      volumes: [], dialog: null, favorites: [], favoritePickerOpen: false,
      quickSearch: null, terminalOpen: false, viewer: null, quickView: false,
    }));
    (window as unknown as { gc: unknown }).gc = mockApi();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  // The bug: mousedown cleared the selection before dragstart fired, so a
  // multi-file drag carried exactly one file.
  it('keeps the marked set when the drag starts on a marked row', async () => {
    await renderApp();
    markLeft('alpha.txt', 'zeta.txt');

    fireEvent.mouseDown(row('alpha'));
    expect(useStore.getState().panels.left.selection.size).toBe(2);

    const dt = dataTransfer();
    fireDrag(row('alpha'), 'dragStart', { dataTransfer: dt });
    expect(JSON.parse(dt.getData(GC_PATHS))).toEqual(['/home/u/alpha.txt', '/home/u/zeta.txt']);
  });

  it('still clears the selection on a plain click that is not a drag', async () => {
    await renderApp();
    markLeft('alpha.txt', 'zeta.txt');

    fireEvent.mouseDown(row('alpha'));
    fireEvent.mouseUp(document);
    await waitFor(() => expect(useStore.getState().panels.left.selection.size).toBe(0));
  });

  it('clears the selection immediately when the click lands off the marked set', async () => {
    await renderApp();
    markLeft('alpha.txt');

    fireEvent.mouseDown(row('zeta'));
    expect(useStore.getState().panels.left.selection.size).toBe(0);
  });

  it('drags just the grabbed row when nothing is marked', async () => {
    await renderApp();
    const dt = dataTransfer();
    fireDrag(row('zeta'), 'dragStart', { dataTransfer: dt });
    expect(JSON.parse(dt.getData(GC_PATHS))).toEqual(['/home/u/zeta.txt']);
  });

  it('hands the whole marked set to the OS on Alt+drag, without an HTML5 payload', async () => {
    const gc = await renderApp();
    markLeft('alpha.txt', 'zeta.txt');

    const dt = dataTransfer();
    fireDrag(row('alpha'), 'dragStart', { dataTransfer: dt, altKey: true });

    expect(gc.shell.startDrag).toHaveBeenCalledWith(['/home/u/alpha.txt', '/home/u/zeta.txt']);
    expect(dt.getData(GC_PATHS)).toBe('');
  });

  it('copies a drop from the other panel', async () => {
    const gc = await renderApp();
    const dt = dataTransfer();
    dt.setData(GC_PATHS, JSON.stringify(['/other/one.txt', '/other/two.txt']));

    fireDrag(panelBody(1), 'dragOver', { dataTransfer: dt });
    fireDrag(panelBody(1), 'drop', { dataTransfer: dt });

    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith({
      kind: 'copy',
      sources: ['/other/one.txt', '/other/two.txt'],
      dst: '/home/u/Documents',
    }));
  });

  it('moves instead when Shift is held', async () => {
    const gc = await renderApp();
    const dt = dataTransfer();
    dt.setData(GC_PATHS, JSON.stringify(['/other/one.txt']));

    fireDrag(panelBody(1), 'drop', { dataTransfer: dt, shiftKey: true });
    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'move' }),
    ));
  });

  it('drops into the folder row under the pointer', async () => {
    const gc = await renderApp();
    const dt = dataTransfer();
    dt.setData(GC_PATHS, JSON.stringify(['/other/one.txt']));

    fireDrag(row('photos'), 'drop', { dataTransfer: dt });
    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith(
      expect.objectContaining({ dst: '/home/u/photos' }),
    ));
  });

  it('copies files dropped in from Finder', async () => {
    const gc = await renderApp();
    const dt = dataTransfer([{ path: '/Users/me/from-finder.txt' }]);

    fireDrag(panelBody(1), 'drop', { dataTransfer: dt });
    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith({
      kind: 'copy',
      sources: ['/Users/me/from-finder.txt'],
      dst: '/home/u/Documents',
    }));
  });

  // Taking a file out from under another app on a plain drag is not a call to
  // make for the user.
  it('never moves a drop that came from outside, even with Shift', async () => {
    const gc = await renderApp();
    const dt = dataTransfer([{ path: '/Users/me/from-finder.txt' }]);

    fireDrag(panelBody(1), 'drop', { dataTransfer: dt, shiftKey: true });
    await waitFor(() => expect(gc.ops.start).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'copy' }),
    ));
  });

  it('ignores a drop of nothing it understands', async () => {
    const gc = await renderApp();
    fireDrag(panelBody(1), 'drop', { dataTransfer: dataTransfer() });
    await new Promise((r) => setTimeout(r, 10));
    expect(gc.ops.start).not.toHaveBeenCalled();
  });
});
