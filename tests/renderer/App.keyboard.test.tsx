import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { FileEntry } from '@shared/types';
import { App } from '@renderer/App';
import { useStore } from '@renderer/state/store';
import { initialPanelState } from '@renderer/state/panelSlice';
import { keymapApi } from './keymapApi';

beforeAll(() => {
  // xterm asks for it as soon as the terminal pane mounts.
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
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

function mockApi() {
  return {
    keymap: keymapApi(),
    fs: {
      listDir: vi.fn().mockResolvedValue({
        ok: true,
        value: [entry('notes', 'txt'), entry('photos', '', true)],
      }),
      stat: vi.fn(), mkdir: vi.fn(), rename: vi.fn(),
      trash: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      duplicate: vi.fn(),
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
    menu: { onCommand: vi.fn(() => () => {}), popupFileContext: vi.fn() },
    update: {
      check: vi.fn(), download: vi.fn(), install: vi.fn(),
      status: vi.fn().mockResolvedValue({ kind: 'idle' }),
      onStatus: vi.fn(() => () => {}),
    },
  };
}

const cmdline = () => document.querySelector('.gc-cmdline-input') as HTMLInputElement;
const activePanel = () => {
  const s = useStore.getState();
  return s.panels[s.activeSide];
};

/**
 * The list is virtualized and the stubbed ResizeObserver never reports a size,
 * so no row ever reaches the DOM. Readiness is the listing itself.
 */
const listed = () => waitFor(() => expect(activePanel().entries.length).toBeGreaterThan(1));
const activePath = () => activePanel().path;
const cursorName = () => {
  const p = activePanel();
  const e = p.entries[p.cursor];
  return e.ext ? `${e.name}.${e.ext}` : e.name;
};

/**
 * Two matches of 'rep' with a non-match between them: dirs sort ahead of
 * files, so `stuff` lands between the matching folder and the matching file.
 */
function listReports() {
  const gc = (window as unknown as { gc: ReturnType<typeof mockApi> }).gc;
  gc.fs.listDir.mockResolvedValue({
    ok: true,
    value: [entry('report', 'txt'), entry('stuff', '', true), entry('repo', '', true), entry('zebra', 'txt')],
  });
}

/** Alt starts the search; the rest of the prefix is typed bare. */
function search(prefix: string) {
  const [first, ...rest] = prefix;
  fireEvent.keyDown(document, { key: first, code: `Key${first.toUpperCase()}`, altKey: true });
  for (const ch of rest) fireEvent.keyDown(document, { key: ch, code: `Key${ch.toUpperCase()}` });
}

/** Puts the active panel in a folder that has a parent to walk up to. */
function startIn(path: string) {
  useStore.setState((s) => ({
    panels: { ...s.panels, [s.activeSide]: { ...s.panels[s.activeSide], path } },
  }));
}

describe('keyboard routing', () => {
  beforeEach(() => {
    useStore.setState({
      dialog: null, favoritePickerOpen: false, terminalOpen: false, quickSearch: null,
      activeSide: 'left',
      panels: { left: initialPanelState('/home/u'), right: initialPanelState('/home/u/Documents') },
    });
    (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
  });

  // Typing focuses the command line, but clicking a row hands focus back to
  // the panel while the text stays put — and Backspace used to walk up a
  // folder with a half-typed command still sitting there.
  it('Backspace erases the command line rather than walking up a folder', async () => {
    render(<App />);
    await listed();
    startIn('/a/b');

    fireEvent.change(cmdline(), { target: { value: 'ls' } });
    cmdline().blur();
    fireEvent.keyDown(document, { key: 'Backspace', code: 'Backspace' });

    await waitFor(() => expect(cmdline().value).toBe('l'));
    expect(activePath()).toBe('/a/b');
  });

  it('Backspace still walks up once the command line is empty', async () => {
    render(<App />);
    await listed();
    startIn('/a/b');

    expect(cmdline().value).toBe('');
    fireEvent.keyDown(document, { key: 'Backspace', code: 'Backspace' });

    await waitFor(() => expect(activePath()).toBe('/a'));
  });

  it('Alt+letter opens the quick-search box and Escape closes it', async () => {
    render(<App />);
    await listed();

    fireEvent.keyDown(document, { key: 'n', code: 'KeyN', altKey: true });
    await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeTruthy());
    expect(screen.getByText('n')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeNull());
  });

  it('keeps the box up past the old 1.5s self-clear', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<App />);
      await listed();
      fireEvent.keyDown(document, { key: 'n', code: 'KeyN', altKey: true });
      await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeTruthy());

      act(() => { vi.advanceTimersByTime(5000); });
      expect(useStore.getState().quickSearch?.buffer).toBe('n');
      expect(document.querySelector('.gc-quicksearch')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  // Option starts a search; holding it down for every following letter is
  // what TC does not make you do.
  it('continues an open search from bare typing, without Option', async () => {
    render(<App />);
    await listed();

    fireEvent.keyDown(document, { key: 'n', code: 'KeyN', altKey: true });
    await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeTruthy());
    fireEvent.keyDown(document, { key: 'o', code: 'KeyO' });
    fireEvent.keyDown(document, { key: 't', code: 'KeyT' });

    await waitFor(() => expect(screen.getByText('not')).toBeInTheDocument());
    expect(cmdline().value).toBe('');
  });

  it('leaves bare typing to the command line once no search is open', async () => {
    render(<App />);
    await listed();

    fireEvent.keyDown(document, { key: 'o', code: 'KeyO' });

    await waitFor(() => expect(cmdline().value).toBe('o'));
    expect(document.querySelector('.gc-quicksearch')).toBeNull();
  });

  // Filenames are not ASCII. An ASCII-only test for "is this a character?"
  // stranded accented and non-Latin names and posted those keys to the
  // command line instead.
  it('continues a search with non-ASCII characters', async () => {
    render(<App />);
    await listed();

    fireEvent.keyDown(document, { key: 'n', code: 'KeyN', altKey: true });
    await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeTruthy());
    fireEvent.keyDown(document, { key: 'é', code: 'KeyE' });
    fireEvent.keyDown(document, { key: 'ר', code: 'KeyR' });

    await waitFor(() => expect(screen.getByText('néר')).toBeInTheDocument());
    expect(cmdline().value).toBe('');
  });

  // Names hold spaces, so Space types one into an open search instead of
  // previewing the file. With no search open it is still Quick Look.
  it('takes Space into the search buffer', async () => {
    render(<App />);
    await listed();
    const gc = (window as unknown as { gc: ReturnType<typeof mockApi> }).gc;

    fireEvent.keyDown(document, { key: 'n', code: 'KeyN', altKey: true });
    await waitFor(() => expect(screen.getByText('n')).toBeInTheDocument());
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });

    await waitFor(() => expect(useStore.getState().quickSearch?.buffer).toBe('n '));
    expect(gc.shell.quickLook).not.toHaveBeenCalled();
  });

  it('keeps Space as Quick Look while no search is open', async () => {
    render(<App />);
    await listed();
    const gc = (window as unknown as { gc: ReturnType<typeof mockApi> }).gc;

    // Quick Look only has something to show on a file, and directories sort first.
    const side = useStore.getState().activeSide;
    const onFile = activePanel().entries.findIndex((en) => !en.isDir);
    act(() => { useStore.getState().replacePanel(side, { cursor: onFile }); });
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });

    await waitFor(() => expect(gc.shell.quickLook).toHaveBeenCalled());
    expect(useStore.getState().quickSearch).toBeNull();
  });

  it('marks a prefix that matches nothing without moving the cursor', async () => {
    render(<App />);
    await listed();
    const before = activePanel().cursor;

    fireEvent.keyDown(document, { key: 'z', code: 'KeyZ', altKey: true });

    await waitFor(() => expect(document.querySelector('.gc-quicksearch.is-nomatch')).toBeTruthy());
    expect(activePanel().cursor).toBe(before);
  });

  // A search narrows the pane: walking it has to stay inside the matches,
  // which is the whole point of having typed a prefix.
  it('steps the cursor from match to match, skipping non-matches', async () => {
    listReports();
    render(<App />);
    await listed();

    search('rep');
    await waitFor(() => expect(cursorName()).toBe('repo'));

    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    await waitFor(() => expect(cursorName()).toBe('report.txt'));

    fireEvent.keyDown(document, { key: 'ArrowUp', code: 'ArrowUp' });
    await waitFor(() => expect(cursorName()).toBe('repo'));
  });

  it('stops at the ends of the match set', async () => {
    listReports();
    render(<App />);
    await listed();

    search('rep');
    await waitFor(() => expect(cursorName()).toBe('repo'));

    fireEvent.keyDown(document, { key: 'ArrowUp', code: 'ArrowUp' });
    await waitFor(() => expect(cursorName()).toBe('repo'));

    fireEvent.keyDown(document, { key: 'End', code: 'End' });
    await waitFor(() => expect(cursorName()).toBe('report.txt'));
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'PageDown', code: 'PageDown' });
    await waitFor(() => expect(cursorName()).toBe('report.txt'));

    fireEvent.keyDown(document, { key: 'Home', code: 'Home' });
    await waitFor(() => expect(cursorName()).toBe('repo'));
  });

  it('walks every row again once the search is closed', async () => {
    listReports();
    render(<App />);
    await listed();

    search('rep');
    await waitFor(() => expect(cursorName()).toBe('repo'));
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeNull());

    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    await waitFor(() => expect(cursorName()).toBe('stuff'));
  });

  it('pins the cursor while the prefix matches nothing', async () => {
    listReports();
    render(<App />);
    await listed();

    search('rep');
    await waitFor(() => expect(cursorName()).toBe('repo'));
    fireEvent.keyDown(document, { key: 'q', code: 'KeyQ' });
    await waitFor(() => expect(document.querySelector('.gc-quicksearch.is-nomatch')).toBeTruthy());

    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']) {
      fireEvent.keyDown(document, { key, code: key });
    }
    await waitFor(() => expect(cursorName()).toBe('repo'));
  });

  it('walks matches with the page keys too', async () => {
    listReports();
    render(<App />);
    await listed();

    search('rep');
    await waitFor(() => expect(cursorName()).toBe('repo'));
    fireEvent.keyDown(document, { key: 'PageDown', code: 'PageDown' });
    await waitFor(() => expect(cursorName()).toBe('report.txt'));
    fireEvent.keyDown(document, { key: 'PageUp', code: 'PageUp' });
    await waitFor(() => expect(cursorName()).toBe('repo'));
  });

  // Names are matched case-insensitively, and a click can park the cursor off
  // the match set — the next step has to find its way back onto it.
  it('matches regardless of case and recovers from an off-match cursor', async () => {
    const gc = (window as unknown as { gc: ReturnType<typeof mockApi> }).gc;
    gc.fs.listDir.mockResolvedValue({
      ok: true,
      value: [entry('Alpha', 'TXT'), entry('beta', 'txt'), entry('alpine', 'txt')],
    });
    render(<App />);
    await listed();

    search('al');
    await waitFor(() => expect(cursorName()).toBe('Alpha.TXT'));

    const side = useStore.getState().activeSide;
    act(() => { useStore.getState().replacePanel(side, { cursor: 1 }); });  // 'beta', off the match set
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    await waitFor(() => expect(cursorName()).toBe('alpine.txt'));
  });

  it('searches the pane that is active, not the left one', async () => {
    listReports();
    render(<App />);
    await listed();
    act(() => { useStore.setState({ activeSide: 'right' }); });
    await waitFor(() => expect(activePanel().entries.length).toBeGreaterThan(1));

    search('rep');
    await waitFor(() => expect(useStore.getState().quickSearch?.side).toBe('right'));
    expect(cursorName()).toBe('repo');
    expect(useStore.getState().panels.left.cursor).toBe(0);
  });

  // An empty command line has nothing to erase, so Backspace goes back to
  // meaning "parent folder" even though erasing left the focus in the line.
  it('walks up again once Backspace has emptied the command line', async () => {
    render(<App />);
    await listed();
    startIn('/a/b');

    fireEvent.change(cmdline(), { target: { value: 'l' } });
    cmdline().blur();
    fireEvent.keyDown(document, { key: 'Backspace', code: 'Backspace' });
    await waitFor(() => expect(cmdline().value).toBe(''));

    fireEvent.keyDown(cmdline(), { key: 'Backspace', code: 'Backspace' });
    await waitFor(() => expect(activePath()).toBe('/a'));
  });

  it('erases a command line by characters, not code units', async () => {
    render(<App />);
    await listed();

    fireEvent.change(cmdline(), { target: { value: 'echo 😀' } });
    cmdline().blur();
    fireEvent.keyDown(document, { key: 'Backspace', code: 'Backspace' });

    await waitFor(() => expect(cmdline().value).toBe('echo '));
  });

  it('closes the search box on Escape from inside the command line', async () => {
    listReports();
    render(<App />);
    await listed();

    search('rep');
    await waitFor(() => expect(document.querySelector('.gc-quicksearch')).toBeTruthy());
    cmdline().focus();
    fireEvent.keyDown(cmdline(), { key: 'Escape', code: 'Escape' });

    await waitFor(() => expect(useStore.getState().quickSearch).toBeNull());
  });
});

// xterm's helper element is a <textarea>, so the text-field branch used to pass
// the shell's own control keys to the panel: Ctrl+H toggled hidden files while
// the user was erasing a character in bash.
describe('terminal focus', () => {
  beforeEach(() => {
    useStore.setState({
      dialog: null, favoritePickerOpen: false, terminalOpen: true, quickSearch: null,
      activeSide: 'left',
      panels: { left: initialPanelState('/home/u'), right: initialPanelState('/home/u/Documents') },
    });
    (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
  });

  /** A textarea inside the terminal pane, which is what xterm gives focus to. */
  function terminalInput() {
    const pane = document.querySelector('.gc-terminal') as HTMLElement;
    const ta = document.createElement('textarea');
    pane.appendChild(ta);
    ta.focus();
    return ta;
  }

  it('leaves the shell its control keys', async () => {
    render(<App />);
    await listed();
    const before = activePanel().showHidden;
    const ta = terminalInput();

    fireEvent.keyDown(ta, { key: 'h', code: 'KeyH', ctrlKey: true });
    fireEvent.keyDown(ta, { key: 'u', code: 'KeyU', ctrlKey: true });
    fireEvent.keyDown(ta, { key: 'F5', code: 'F5' });

    await waitFor(() => expect(activePanel().showHidden).toBe(before));
    expect((window as unknown as { gc: ReturnType<typeof mockApi> }).gc.ops.start).not.toHaveBeenCalled();
  });

  it('still answers Cmd combos and the terminal toggle', async () => {
    render(<App />);
    await listed();
    const ta = terminalInput();

    fireEvent.keyDown(ta, { key: '`', code: 'Backquote', ctrlKey: true });
    await waitFor(() => expect(useStore.getState().terminalOpen).toBe(false));
  });
});

// A search box plus a focused field is reachable: Cmd+L during a search, or
// Backspace erasing the command line, both leave the caret in a text field —
// and what is typed there must land there, not in the search buffer.
describe('a focused field during a quick search', () => {
  beforeEach(() => {
    useStore.setState({
      dialog: null, favoritePickerOpen: false, terminalOpen: false, quickSearch: null,
      activeSide: 'left',
      panels: { left: initialPanelState('/home/u'), right: initialPanelState('/home/u/Documents') },
    });
    (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
  });

  it('types into the command line rather than the search buffer', async () => {
    render(<App />);
    await listed();

    fireEvent.keyDown(document, { key: 'n', code: 'KeyN', altKey: true });
    await waitFor(() => expect(useStore.getState().quickSearch?.buffer).toBe('n'));

    cmdline().focus();
    fireEvent.keyDown(cmdline(), { key: 'o', code: 'KeyO' });

    expect(useStore.getState().quickSearch?.buffer).toBe('n');
  });
});

// A controlled field reads empty until an IME commits, so a Backspace deleting
// a composing character used to look like "nothing to erase" and walked up a
// folder instead.
describe('Backspace and an input method', () => {
  beforeEach(() => {
    useStore.setState({
      dialog: null, favoritePickerOpen: false, terminalOpen: false, quickSearch: null,
      activeSide: 'left',
      panels: { left: initialPanelState('/home/u'), right: initialPanelState('/home/u/Documents') },
    });
    (window as unknown as { gc: ReturnType<typeof mockApi> }).gc = mockApi();
  });

  it('does not walk up a folder on a composing Backspace', async () => {
    render(<App />);
    await listed();
    startIn('/a/b');
    cmdline().focus();

    fireEvent.keyDown(cmdline(), { key: 'Backspace', code: 'Backspace', isComposing: true });

    await waitFor(() => expect(activePath()).toBe('/a/b'));
  });

  it('does not climb the tree while Backspace repeats', async () => {
    render(<App />);
    await listed();
    startIn('/a/b/c');
    cmdline().focus();

    fireEvent.keyDown(cmdline(), { key: 'Backspace', code: 'Backspace' });
    fireEvent.keyDown(cmdline(), { key: 'Backspace', code: 'Backspace', repeat: true });
    fireEvent.keyDown(cmdline(), { key: 'Backspace', code: 'Backspace', repeat: true });

    await waitFor(() => expect(activePath()).toBe('/a/b'));
  });
});
