import { describe, it, expect, vi } from 'vitest';
import { activeContext, createKeyRouter, type ActiveContext } from '@renderer/keys/router';
import { buildKeyTable } from '@shared/keymap/lookup';
import { defaultBindings } from '@shared/commands/catalog';

const idle = {
  dialogOpen: false, favoritePickerOpen: false, viewerOpen: false, editorOpen: false,
  quickSearchOpen: false, inTerminal: false, inTextField: false,
};

describe('activeContext', () => {
  it('is panel when nothing else is up', () => expect(activeContext(idle)).toBe('panel'));
  // A focused field owns printable keys even with the search box open: typing
  // into the path bar after Cmd+L must reach the path bar, not the buffer.
  it('prefers a focused field over an open quick search', () =>
    expect(activeContext({ ...idle, quickSearchOpen: true, inTextField: true })).toBe('input'));
  it('is quickSearch when the box is open and no field has focus', () =>
    expect(activeContext({ ...idle, quickSearchOpen: true })).toBe('quickSearch'));
  it('is modal while a dialog or the favorite picker owns the screen', () => {
    expect(activeContext({ ...idle, dialogOpen: true })).toBe('modal');
    expect(activeContext({ ...idle, favoritePickerOpen: true })).toBe('modal');
  });
  it('is editor before viewer', () =>
    expect(activeContext({ ...idle, editorOpen: true, viewerOpen: true })).toBe('editor'));
  // D4's rule, now stated rather than inferred from tagName.
  it('is terminal when focus is in the terminal pane, even though it is a textarea', () =>
    expect(activeContext({ ...idle, inTerminal: true, inTextField: true })).toBe('terminal'));
  it('is input when a text field has focus', () =>
    expect(activeContext({ ...idle, inTextField: true })).toBe('input'));
});

const harness = (context: ActiveContext, bindings = defaultBindings()) => {
  const dispatch = vi.fn();
  const toCommandLine = vi.fn();
  const startSearch = vi.fn();
  const extendSearch = vi.fn();
  const router = createKeyRouter({
    table: () => buildKeyTable(bindings),
    context: () => context,
    snapshot: () => ({
      dialogOpen: false, favoritePickerOpen: false, viewerOpen: context === 'viewer',
      editorOpen: context === 'editor', commandOutputOpen: false, activeSource: 'fs',
      mountedSurfaces: context === 'viewer' ? ['viewer'] : context === 'editor' ? ['editor'] : [],
    }),
    dispatch, startSearch, extendSearch, toCommandLine,
    applyTextEditing: () => false,
  });
  return { router, dispatch, toCommandLine, startSearch, extendSearch };
};

const key = (init: Partial<KeyboardEvent> & { isComposing?: boolean }) => {
  const e = new KeyboardEvent('keydown', {
    key: init.key ?? '', code: init.code ?? '', cancelable: true,
    metaKey: init.metaKey ?? false, ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false, shiftKey: init.shiftKey ?? false,
    repeat: init.repeat ?? false,
  });
  if (init.isComposing) Object.defineProperty(e, 'isComposing', { value: true });
  return e;
};

describe('routing', () => {
  it('keeps app-wide shortcuts alive in a text field', () => {
    const h = harness('input');
    h.router.onKeyDown(key({ key: 'F5', code: 'F5' }));
    h.router.onKeyDown(key({ key: 'h', code: 'KeyH', ctrlKey: true }));
    expect(h.dispatch.mock.calls.map((c) => c[0])).toEqual(['copy', 'toggleHidden']);
  });

  it('leaves bare keys to the text field', () => {
    const h = harness('input');
    for (const k of [{ key: 'Enter', code: 'Enter' }, { key: ' ', code: 'Space' },
                     { key: 'Backspace', code: 'Backspace' }, { key: 'x', code: 'KeyX' }]) {
      h.router.onKeyDown(key(k));
    }
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.toCommandLine).not.toHaveBeenCalled();
  });

  it('leaves the caret keys to the text field', () => {
    const h = harness('input');
    for (const k of [{ key: 'Backspace', code: 'Backspace', metaKey: true },
                     { key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true },
                     { key: 'Delete', code: 'Delete', metaKey: true }]) {
      h.router.onKeyDown(key(k));
    }
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  // D4, as a keymap rule rather than a special case.
  it('leaves the terminal its control keys but keeps its toggle', () => {
    const h = harness('terminal');
    h.router.onKeyDown(key({ key: 'h', code: 'KeyH', ctrlKey: true }));
    h.router.onKeyDown(key({ key: 'u', code: 'KeyU', ctrlKey: true }));
    h.router.onKeyDown(key({ key: 'F5', code: 'F5' }));
    expect(h.dispatch).not.toHaveBeenCalled();

    h.router.onKeyDown(key({ key: '`', code: 'Backquote', ctrlKey: true }));
    h.router.onKeyDown(key({ key: 'r', code: 'KeyR', metaKey: true }));
    expect(h.dispatch.mock.calls.map((c) => c[0])).toEqual(['toggleTerminal', 'refresh']);
  });

  it('starts a quick search from a free Alt+letter', () => {
    const h = harness('panel');
    h.router.onKeyDown(key({ key: 'ç', code: 'KeyC', altKey: true }));
    expect(h.startSearch).toHaveBeenCalledWith('c');
  });

  it('prefers a command bound to Alt+letter over quick search', () => {
    const h = harness('panel', { panel: { refresh: ['Alt+E'] } });
    h.router.onKeyDown(key({ key: '´', code: 'KeyE', altKey: true }));
    expect(h.dispatch).toHaveBeenCalledWith('refresh');
    expect(h.startSearch).not.toHaveBeenCalled();
  });

  it('sends an unbound printable key to the command line', () => {
    const h = harness('panel');
    h.router.onKeyDown(key({ key: 'l', code: 'KeyL' }));
    expect(h.toCommandLine).toHaveBeenCalledWith('l');
  });

  it('extends an open search with any printable key, including Space', () => {
    const h = harness('quickSearch');
    h.router.onKeyDown(key({ key: 'R', code: 'KeyR' }));
    h.router.onKeyDown(key({ key: ' ', code: 'Space' }));
    expect(h.extendSearch.mock.calls.map((c) => c[0])).toEqual(['r', ' ']);
  });

  it('keeps the row walk working during a search', () => {
    const h = harness('quickSearch');
    h.router.onKeyDown(key({ key: 'ArrowDown', code: 'ArrowDown' }));
    h.router.onKeyDown(key({ key: 'Escape', code: 'Escape' }));
    expect(h.dispatch.mock.calls.map((c) => c[0])).toEqual(['cursorDown', 'clearSelection']);
    expect(h.extendSearch).not.toHaveBeenCalled();
  });

  // Committed behaviour: these two keep their jobs while the box is open.
  it('leaves slash and question mark their commands during a search', () => {
    const h = harness('quickSearch');
    h.router.onKeyDown(key({ key: '/', code: 'Slash' }));
    h.router.onKeyDown(key({ key: '?', code: 'Slash', shiftKey: true }));
    expect(h.dispatch.mock.calls.map((c) => c[0])).toEqual(['focusPathBarRoot', 'toggleCheatsheet']);
    expect(h.extendSearch).not.toHaveBeenCalled();
  });

  it('extends a search from Alt+letter by physical key', () => {
    const h = harness('quickSearch');
    h.router.onKeyDown(key({ key: 'ç', code: 'KeyC', altKey: true }));
    expect(h.extendSearch).toHaveBeenCalledWith('c');
  });

  it('routes the viewer’s own keys while it is up', () => {
    const h = harness('viewer');
    h.router.onKeyDown(key({ key: 'PageDown', code: 'PageDown' }));
    h.router.onKeyDown(key({ key: 'Escape', code: 'Escape' }));
    expect(h.dispatch.mock.calls.map((c) => c[0])).toEqual(['viewerPageDown', 'viewerClose']);
  });

  it('refuses a panel command while the viewer is up', () => {
    const h = harness('viewer');
    h.router.onKeyDown(key({ key: 'F8', code: 'F8' }));
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('ignores every key while a modal owns the screen', () => {
    const h = harness('modal');
    h.router.onKeyDown(key({ key: 'F8', code: 'F8' }));
    h.router.onKeyDown(key({ key: 'x', code: 'KeyX' }));
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.toCommandLine).not.toHaveBeenCalled();
  });

  // Review Focus 1
  it('ignores a composing keystroke', () => {
    const h = harness('panel');
    h.router.onKeyDown(key({ key: 'e', code: 'KeyE', isComposing: true }));
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.toCommandLine).not.toHaveBeenCalled();
  });

  // Review Focus 3
  it('leaves a key it cannot name alone', () => {
    const h = harness('panel');
    const e = key({ key: 'AudioVolumeUp', code: 'AudioVolumeUp' });
    h.router.onKeyDown(e);
    expect(e.defaultPrevented).toBe(false);
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  // Review Focus 2
  it('repeats a held navigation key', () => {
    const h = harness('panel');
    h.router.onKeyDown(key({ key: 'ArrowDown', code: 'ArrowDown' }));
    h.router.onKeyDown(key({ key: 'ArrowDown', code: 'ArrowDown', repeat: true }));
    expect(h.dispatch.mock.calls.map((c) => c[0])).toEqual(['cursorDown', 'cursorDown']);
  });

  it('consumes what it dispatches, so late document listeners never see it', () => {
    const h = harness('editor');
    const e = key({ key: 'Escape', code: 'Escape' });
    const stopped = vi.spyOn(e, 'stopPropagation');
    h.router.onKeyDown(e);
    expect(h.dispatch).toHaveBeenCalledWith('editorClose');
    expect(e.defaultPrevented).toBe(true);
    expect(stopped).toHaveBeenCalled();
  });

  // applyTextEditing used to run before any gate. Once canRun came first, a
  // panel inside an archive — where `move` is refused — stopped Cmd+X from
  // cutting text in the command line, and the Edit menu does not claim it.
  it('still cuts text in a field when the command behind the key is refused', () => {
    const applyTextEditing = vi.fn(() => true);
    const dispatch = vi.fn();
    const router = createKeyRouter({
      table: () => buildKeyTable(defaultBindings()),
      context: () => 'input',
      snapshot: () => ({ dialogOpen: false, favoritePickerOpen: false, viewerOpen: false,
        editorOpen: false, commandOutputOpen: false, activeSource: 'archive', mountedSurfaces: [] }),
      dispatch, startSearch: vi.fn(), extendSearch: vi.fn(), toCommandLine: vi.fn(),
      applyTextEditing,
    });
    const el = document.createElement('input');
    const e = key({ key: 'x', code: 'KeyX', metaKey: true });
    Object.defineProperty(e, 'target', { value: el });
    router.onKeyDown(e);
    expect(applyTextEditing).toHaveBeenCalledWith('Cmd+X', el);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('applies text editing itself when the field owns the combo', () => {
    const applyTextEditing = vi.fn(() => true);
    const dispatch = vi.fn();
    const router = createKeyRouter({
      table: () => buildKeyTable(defaultBindings()),
      context: () => 'input',
      snapshot: () => ({ dialogOpen: false, favoritePickerOpen: false, viewerOpen: false,
        editorOpen: false, commandOutputOpen: false, activeSource: 'fs', mountedSurfaces: [] }),
      dispatch, startSearch: vi.fn(), extendSearch: vi.fn(), toCommandLine: vi.fn(),
      applyTextEditing,
    });
    const el = document.createElement('input');
    const e = key({ key: 'a', code: 'KeyA', metaKey: true });
    Object.defineProperty(e, 'target', { value: el });
    router.onKeyDown(e);
    expect(applyTextEditing).toHaveBeenCalledWith('Cmd+A', el);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
