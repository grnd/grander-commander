import { canRun, type AvailabilitySnapshot } from '@shared/commands/availability';
import type { Context } from '@shared/commands/catalog';
import type { CommandId } from '@shared/commands/ids';
import { keyIdFromEvent, type KeyId } from '@shared/keys/identity';
import { lookupKey, type KeyTable } from '@shared/keymap/lookup';

export type ContextInput = {
  dialogOpen: boolean;
  favoritePickerOpen: boolean;
  viewerOpen: boolean;
  editorOpen: boolean;
  quickSearchOpen: boolean;
  inTerminal: boolean;
  inTextField: boolean;
};

/** `modal` is not a keymap context: it says the keymap does not apply. */
export type ActiveContext = Context | 'modal';

/**
 * Which keymap a key is resolved against, decided from state rather than from
 * `event.target.tagName` — xterm's helper element is a <textarea>, so asking
 * the DOM made the terminal look like a text field and handed bash's control
 * keys to the panel.
 */
export function activeContext(i: ContextInput): ActiveContext {
  if (i.quickSearchOpen) return 'quickSearch';
  if (i.dialogOpen || i.favoritePickerOpen) return 'modal';
  if (i.editorOpen) return 'editor';
  if (i.viewerOpen) return 'viewer';
  if (i.inTerminal) return 'terminal';
  if (i.inTextField) return 'input';
  return 'panel';
}

export type RouterDeps = {
  table: () => KeyTable;
  context: (target: EventTarget | null) => ActiveContext;
  snapshot: () => AvailabilitySnapshot;
  dispatch: (cmd: CommandId) => void;
  /** Quick search: start one from a bare Alt+letter, or extend an open one. */
  startSearch: (ch: string) => void;
  extendSearch: (ch: string) => void;
  /** The panel's fallback for an unbound printable key. */
  toCommandLine: (ch: string) => void;
  applyTextEditing: (id: KeyId, el: HTMLInputElement) => boolean;
};

/** Alt+letter / Alt+digit, which starts or extends a search by physical key. */
function altChar(id: KeyId): string | null {
  const m = /^Alt\+([A-Z0-9])$/.exec(id);
  return m ? m[1].toLowerCase() : null;
}

/** One unmodified character — what typing means in a panel or a search box. */
function bareChar(e: KeyboardEvent): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return e.key.length === 1 ? e.key : null;
}

export function createKeyRouter(deps: RouterDeps) {
  const consume = (e: KeyboardEvent) => {
    e.preventDefault();
    // Stopping here matters as much as preventing: DialogShell registers its own
    // document Escape listener in a layout effect, and without this the keypress
    // that raised the dirty-close prompt would also dismiss it.
    e.stopPropagation();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    // A composing keystroke is text, never a shortcut.
    if (e.isComposing) return;

    const context = deps.context(e.target);
    if (context === 'modal') return;

    const id = keyIdFromEvent(e);
    // A key we cannot name is left entirely alone rather than swallowed.
    if (!id) return;

    // An open search box claims typing before the keymap does: Space belongs
    // in a filename, and the panel underneath has it bound to Quick Look. The
    // two exceptions are the keys that are not really typing here — '/' opens
    // the path bar at root and '?' the cheatsheet.
    if (context === 'quickSearch') {
      const typed = altChar(id) ?? bareChar(e);
      if (typed && typed !== '/' && typed !== '?') {
        consume(e);
        deps.extendSearch(typed.toLowerCase());
        return;
      }
    }

    const command = lookupKey(deps.table(), context, id);
    if (command && allowedHere(deps.table(), context, id) && canRun(command, deps.snapshot())) {
      // In a text field a bound editing combo is applied here, because the menu
      // deliberately does not register those accelerators.
      if (context === 'input' && e.target instanceof HTMLInputElement
        && deps.applyTextEditing(id, e.target)) {
        consume(e);
        return;
      }
      consume(e);
      deps.dispatch(command);
      return;
    }

    // Nothing bound: each context decides what a bare key means.
    if (context === 'quickSearch') return;
    if (context === 'panel') {
      // Alt+letter starts a search only when that combo is free, so a command
      // bound to Alt+E wins instead of being shadowed by the search.
      const alt = altChar(id);
      if (alt) { consume(e); deps.startSearch(alt); return; }
      const ch = bareChar(e);
      if (ch) { consume(e); deps.toCommandLine(ch); }
      return;
    }
    // input and terminal: an unbound key belongs to the field or the pty, and
    // must not be preventDefault'ed.
  };

  return { onKeyDown };
}

/**
 * The terminal is a split pane rather than a modal, so `canRun` has no reason
 * to refuse a panel command while focus is inside it. Only keys bound in the
 * `terminal` keymap and Cmd combos are the app's there; everything else is
 * readline's — Ctrl+H, Ctrl+U and Ctrl+R especially.
 */
function allowedHere(table: KeyTable, context: ActiveContext, id: KeyId): boolean {
  if (context !== 'terminal') return true;
  if (table.get(`terminal|${id}`)) return true;
  return id.startsWith('Cmd+');
}
