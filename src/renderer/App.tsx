// src/renderer/App.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './state/store';
import { Cheatsheet } from './components/Cheatsheet';
import { FavoritesBar } from './components/FavoritesBar';
import { BookmarkBar } from './components/BookmarkBar';
import { FavoritePicker } from './components/FavoritePicker';
import { CommandLine } from './components/CommandLine';
import { FKeyBar } from './components/FKeyBar';
import { Terminal } from './components/Terminal';
import { Viewer } from './components/Viewer';
import type { PanelSide } from './state/panelSlice';
import { cursorPath, entryKey, targetNames } from './state/panelSlice';
import { applyRenamePlan, type RenamePreviewRow } from './commands/multirename';
import { eventToCombo, lookup, allowedFromInput } from './keybindings';
import type { CommandName } from './commands';
import { sortEntries } from './commands/sort';
import {
  cursorMove, cursorTo, navigateInto, navigateUp, navigateTo,
} from './commands/navigation';
import {
  toggleMark, selectAll, clearSelection, rangeSelect,
} from './commands/selection';
import {
  swapPanels, switchActive, sameDirToOther,
} from './commands/panels';
import { DriveBar } from './components/DriveBar';
import { UpdateBanner } from './components/UpdateBanner';
import { Panel } from './components/Panel';
import { Splitter } from './components/Splitter';
import type { SortCol } from '@shared/types';
import type { PanelState } from './state/panelSlice';
import {
  openMkdirDialog, openRenameDialog, openCopyDialog, openMoveDialog,
  requestTrash, requestDeleteConfirm, selectionForContextTarget,
} from './commands/mutations';
import { Dialogs } from './components/dialogs';
import type { FileOp, OpEvent, OpId, ConflictAnswer, OpError, MenuCommand } from '@shared/types';

function applySort(
  panel: PanelState,
  col: SortCol,
  setPanel: (patch: Partial<PanelState>) => void,
) {
  const dir = panel.sort.col === col && panel.sort.dir === 'asc' ? 'desc' : 'asc';
  const dotDot = panel.entries.find((e) => e.name === '..');
  const body = panel.entries.filter((e) => e.name !== '..');
  const sorted = sortEntries(body, { col, dir });
  const entries = dotDot ? [dotDot, ...sorted] : sorted;
  setPanel({ sort: { col, dir }, entries });
}

function describeOpError(error: unknown): string {
  if (!error || typeof error !== 'object' || !('kind' in error)) return 'Unknown error';
  const opError = error as OpError;
  switch (opError.kind) {
    case 'permission': return `Permission denied: ${opError.path}`;
    case 'not-found': return `Not found: ${opError.path}`;
    case 'disk-full': return 'Disk full';
    case 'cross-device': return `Cross-device move: ${opError.src} -> ${opError.dst}`;
    case 'exists': return `Already exists: ${opError.path}`;
    case 'name-invalid': return `Invalid name: ${opError.reason}`;
    case 'unknown': return opError.message;
    default: return 'Unknown error';
  }
}

export function App() {
  const state = useStore();
  const api = window.gc;
  const leftPathRef = useRef<HTMLInputElement>(null);
  const rightPathRef = useRef<HTMLInputElement>(null);
  const lastClickRef = useRef<{ side: PanelSide; index: number; time: number } | null>(null);
  const DBL_CLICK_MS = 450;
  const cmdRef = useRef<HTMLInputElement>(null);
  const qsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cheatVisible, setCheatVisible] = useState(false);
  const [cmdOutput, setCmdOutput] = useState<{ cmd: string; stdout: string; stderr: string; exitCode: number } | null>(null);
  // Mirrors cmdOutput for the global key router, which is registered once and
  // can't see this component state directly.
  const cmdOutputRef = useRef(cmdOutput);
  cmdOutputRef.current = cmdOutput;

  const setPanel = useCallback((side: PanelSide, patch: Partial<typeof state.panels.left>) => {
    useStore.setState((s) => ({ panels: { ...s.panels, [side]: { ...s.panels[side], ...patch } } }));
    // state is referenced only at the type level (typeof state.panels.left); no runtime dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Must be referentially stable: Terminal's effect depends on onClose, so a
  // fresh arrow on every App render would kill and respawn the pty session.
  const closeTerminal = useCallback(() => useStore.getState().setTerminalOpen(false), []);

  // Initial volumes + initial paths
  useEffect(() => {
    (async () => {
      const vols = await api.volumes.list();
      useStore.setState({ volumes: vols });
      const home = vols.find((v) => v.kind === 'home')?.path ?? '/';
      // Load both panels
      await navigateTo({ panel: state.panels.left, setPanel: (p) => setPanel('left', p), api, path: home, requestKey: 'left' });
      const docs = `${home}/Documents`;
      await navigateTo({ panel: state.panels.right, setPanel: (p) => setPanel('right', p), api, path: docs, requestKey: 'right' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatch = useCallback(async (cmd: CommandName) => {
    // Commands arrive from the native menu and the F-key bar as well as the key
    // router, and those paths never consulted the modal state. Gating here
    // covers every source — `trash` calls fs.trash with no confirmation step.
    if (cmdOutputRef.current) return;
    const s = useStore.getState();
    const active = s.panels[s.activeSide];
    const setActive = (patch: Partial<typeof active>) => setPanel(s.activeSide, patch);

    const navCtx = { panel: active, setPanel: setActive, api, requestKey: s.activeSide };
    const selCtx = { panel: active, setPanel: setActive };

    // Bookmark commands are generated per slot (gotoBookmark1..9 /
    // setBookmark1..9), so they are matched rather than listed in the switch.
    const bookmark = /^(goto|set)Bookmark([1-9])$/.exec(cmd);
    if (bookmark) {
      const slot = Number(bookmark[2]);
      if (bookmark[1] === 'set') {
        useStore.getState().setBookmark(slot, active.path);
        return;
      }
      const target = useStore.getState().bookmarks[slot - 1];
      if (!target) return;
      return navigateTo({ panel: active, setPanel: setActive, api, path: target, requestKey: s.activeSide });
    }

    switch (cmd) {
      case 'cursorUp':        return cursorMove({ panel: active, delta: -1, setPanel: setActive });
      case 'cursorDown':      return cursorMove({ panel: active, delta: 1, setPanel: setActive });
      case 'cursorPageUp':    return cursorMove({ panel: active, delta: -20, setPanel: setActive });
      case 'cursorPageDown':  return cursorMove({ panel: active, delta: 20, setPanel: setActive });
      case 'cursorHome':      return cursorTo({ panel: active, index: 0, setPanel: setActive });
      case 'cursorEnd':       return cursorTo({ panel: active, index: active.entries.length - 1, setPanel: setActive });
      case 'navigateInto':    return navigateInto(navCtx);
      case 'navigateUp':      return navigateUp(navCtx);
      case 'toggleMark':      return toggleMark(selCtx);
      case 'selectAll':       return selectAll(selCtx);
      case 'clearSelection':  return clearSelection(selCtx);
      case 'switchActive':    return switchActive({
        get: () => useStore.getState(),
        set: (p) => useStore.setState(p as Partial<ReturnType<typeof useStore.getState>>),
      });
      case 'swapPanels':      return swapPanels({
        get: () => useStore.getState(),
        set: (p) => useStore.setState(p as Partial<ReturnType<typeof useStore.getState>>),
      });
      case 'sameDirToOther':  return sameDirToOther({
        get: () => useStore.getState(),
        set: (p) => useStore.setState(p as Partial<ReturnType<typeof useStore.getState>>),
        api,
      });
      case 'sameDirFromOther': {
        const other = s.panels[s.activeSide === 'left' ? 'right' : 'left'];
        return navigateTo({ panel: active, setPanel: setActive, api, path: other.path, requestKey: s.activeSide });
      }
      case 'markAndDown': {
        await toggleMark(selCtx);
        const after = useStore.getState().panels[s.activeSide];
        return cursorMove({ panel: after, delta: 1, setPanel: setActive });
      }
      case 'markAndUp': {
        await toggleMark(selCtx);
        const after = useStore.getState().panels[s.activeSide];
        return cursorMove({ panel: after, delta: -1, setPanel: setActive });
      }
      case 'sortByName': return applySort(active, 'name', setActive);
      case 'sortByExt':  return applySort(active, 'ext',  setActive);
      case 'sortBySize': return applySort(active, 'size', setActive);
      case 'sortByDate': return applySort(active, 'date', setActive);
      case 'toggleHidden': {
        const newShow = !active.showHidden;
        setActive({ showHidden: newShow });
        return navigateTo({
          panel: { ...active, showHidden: newShow }, setPanel: setActive, api, path: active.path, requestKey: s.activeSide,
        });
      }
      case 'refresh':         return navigateTo({ panel: active, setPanel: setActive, api, path: active.path, requestKey: s.activeSide });
      case 'focusPathBar': {
        const el = (s.activeSide === 'left' ? leftPathRef : rightPathRef).current;
        if (el) { el.focus(); el.select(); }
        return;
      }
      case 'focusPathBarRoot': {
        const el = (s.activeSide === 'left' ? leftPathRef : rightPathRef).current;
        if (el) {
          // Controlled input: use the native setter + input event so React picks up the change.
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(el, '/');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.focus();
          el.setSelectionRange(1, 1);
        }
        return;
      }
      case 'mkdir':
        openMkdirDialog({ side: s.activeSide, setDialog: useStore.getState().setDialog });
        return;
      case 'rename':
        openRenameDialog({ side: s.activeSide, panel: active, setDialog: useStore.getState().setDialog });
        return;
      case 'copy':
        openCopyDialog({
          activePath: active.path, active,
          inactive: s.panels[s.activeSide === 'left' ? 'right' : 'left'],
          setDialog: useStore.getState().setDialog,
        });
        return;
      case 'move':
        openMoveDialog({
          active,
          inactive: s.panels[s.activeSide === 'left' ? 'right' : 'left'],
          setDialog: useStore.getState().setDialog,
        });
        return;
      case 'trash':
        void requestTrash({
          panel: active, api,
          afterDone: () => {
            const setSide = (p: Partial<typeof active>) => setPanel(s.activeSide, p);
            void navigateTo({ panel: active, setPanel: setSide, api, path: active.path, requestKey: s.activeSide });
          },
        }).then((result) => {
          if (result && !result.ok) alert(`Move to Trash failed: ${describeOpError(result.error)}`);
        });
        return;
      case 'deleteConfirm':
        requestDeleteConfirm({ panel: active, setDialog: useStore.getState().setDialog });
        return;
      case 'deleteCursorConfirm': {
        const full = cursorPath(active);
        if (!full) return;
        useStore.getState().setDialog({ kind: 'deleteConfirm', paths: [full] });
        return;
      }
      case 'duplicate': {
        const full = cursorPath(active);
        if (!full) return;
        void (async () => {
          const r = await api.fs.duplicate(full);
          if (!r.ok) { alert(`Duplicate failed: ${r.error.kind}`); return; }
          await (async () => {
            const side = useStore.getState().activeSide;
            const panel = useStore.getState().panels[side];
            const setSide = (p: Partial<typeof panel>) => setPanel(side, p);
            await navigateTo({ panel, setPanel: setSide, api, path: panel.path, requestKey: side });
          })();
        })();
        return;
      }
      case 'copyPath': {
        const full = cursorPath(active);
        if (!full) return;
        void navigator.clipboard.writeText(full);
        return;
      }
      case 'addToFavorites': {
        useStore.getState().addFavorite(active.path);
        return;
      }
      case 'pickFavorite':
        useStore.getState().setFavoritePickerOpen(true);
        return;
      case 'quickLook': {
        const full = cursorPath(active);
        if (!full) return;
        void api.shell.quickLook(full);
        return;
      }
      case 'viewFile': {
        const cur = active.entries[active.cursor];
        const full = cursorPath(active);
        // Directories have nothing to view; Enter is the gesture for those.
        if (!full || !cur || cur.isDir) return;
        useStore.getState().setViewer({ path: full });
        return;
      }
      case 'toggleQuickView':
        useStore.getState().setQuickView(!useStore.getState().quickView);
        return;
      case 'multiRename': {
        const names = targetNames(active);
        if (names.length === 0) return;
        useStore.getState().setDialog({
          kind: 'multiRename',
          side: s.activeSide,
          dir: active.path,
          names,
          // Everything in the folder, so a new name that lands on an untouched
          // neighbour is caught in the preview instead of at rename time.
          existingNames: active.entries.filter((e) => e.name !== '..').map(entryKey),
        });
        return;
      }
      case 'openTerminal':
        void api.shell.openTerminal(active.path);
        return;
      case 'toggleTerminal':
        useStore.getState().setTerminalOpen(!useStore.getState().terminalOpen);
        return;
      case 'quitApp':
        window.close();
        return;
      case 'runShellCommand':
        // Invoked inline with command string from CommandLine; no-op from key dispatch.
        return;
    }
  }, [api, setPanel]);

  // Global keyboard router
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The command-output overlay owns the keyboard while it is open. This is
      // checked before the INPUT guard below: letting Tab through moves focus
      // to a control behind the backdrop, and once an input is focused that
      // guard would skip this branch entirely. Swallow every key, so nothing
      // reaches the panels and focus cannot escape the modal.
      if (cmdOutputRef.current) {
        e.preventDefault();
        if (e.key === 'Escape' || e.key === 'Enter') setCmdOutput(null);
        return;
      }
      // Don't route panel shortcuts while a modal/picker owns the keyboard
      const s = useStore.getState();
      if (s.dialog || s.favoritePickerOpen) return;

      // The F3 viewer is modal: it owns the keyboard so arrows scroll the
      // document instead of moving a panel cursor the user cannot see. Keys are
      // deliberately not preventDefault'ed, which leaves native scrolling of the
      // focused viewer body intact.
      if (s.viewer) {
        if (e.key === 'Escape' || e.key === 'F3') {
          e.preventDefault();
          s.setViewer(null);
        }
        return;
      }

      // An input has focus (PathBar / cmdline). Plain typing belongs to it, but
      // app shortcuts must still work: the fallback below sends unmapped
      // printable keys to the command line, so one letter would otherwise
      // disable every shortcut until the user clicked back into a panel.
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const inputCombo = eventToCombo(e);
        if (!inputCombo || !allowedFromInput(inputCombo)) return;
        const inputCmd = lookup(inputCombo);
        if (!inputCmd) return;
        e.preventDefault();
        dispatch(inputCmd);
        return;
      }

      // Escape clears active quick search before falling through to clearSelection
      if (e.key === 'Escape' && s.quickSearch) {
        e.preventDefault();
        s.setQuickSearch(null);
        if (qsTimeout.current) clearTimeout(qsTimeout.current);
        return;
      }

      // Alt+letter/digit → TC-style quick search in active pane
      if (e.altKey && !e.metaKey && !e.ctrlKey && (/^Key[A-Z]$/.test(e.code) || /^Digit[0-9]$/.test(e.code))) {
        e.preventDefault();
        const ch = /^Key/.test(e.code) ? e.code.slice(3).toLowerCase() : e.code.slice(5);
        const prev = s.quickSearch;
        const side = s.activeSide;
        const buffer = prev && prev.side === side ? prev.buffer + ch : ch;
        const active = s.panels[side];
        const idx = active.entries.findIndex((ent) => {
          const full = (ent.ext ? `${ent.name}.${ent.ext}` : ent.name).toLowerCase();
          return full.startsWith(buffer);
        });
        if (idx >= 0) setPanel(side, { cursor: idx });
        s.setQuickSearch({ buffer, side });
        if (qsTimeout.current) clearTimeout(qsTimeout.current);
        qsTimeout.current = setTimeout(() => useStore.getState().setQuickSearch(null), 1500);
        return;
      }

      const combo = eventToCombo(e);
      if (!combo) return;
      const cmd = lookup(combo);
      if (cmd) {
        e.preventDefault();
        dispatch(cmd);
        return;
      }

      // Unmapped printable char → focus command line, prefill with it.
      // Except '?' — reserved for the cheatsheet overlay (handled below).
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && e.key !== '?') {
        const cl = cmdRef.current;
        if (!cl) return;
        e.preventDefault();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(cl, e.key);
        cl.dispatchEvent(new Event('input', { bubbles: true }));
        cl.focus();
        cl.setSelectionRange(e.key.length, e.key.length);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch, setPanel]);

  useEffect(() => {
    const unsub = api.menu.onCommand((message: MenuCommand) => {
      if (typeof message !== 'string') {
        if (message.command === 'addToFavorites' && message.targetPath) {
          useStore.getState().addFavorite(message.targetPath);
          return;
        }
        void dispatch(message.command as import('./commands').CommandName);
        return;
      }
      void dispatch(message as import('./commands').CommandName);
    });
    return unsub;
  }, [dispatch, api]);

  // Cheatsheet: show while '?' is held
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === '?') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setCheatVisible(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'Shift') setCheatVisible(false);
    };
    const blur = () => setCheatVisible(false);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const left = state.panels.left;
  const right = state.panels.right;
  const active = state.panels[state.activeSide];
  const leftWidth = left.width;

  const onRowMouseDown = (side: PanelSide) => (index: number, ev: React.MouseEvent) => {
    useStore.setState({ activeSide: side });
    const panel = useStore.getState().panels[side];
    const setSide = (p: Partial<typeof panel>) => setPanel(side, p);

    const now = Date.now();
    const prev = lastClickRef.current;
    const isDouble =
      !ev.shiftKey && !ev.metaKey &&
      prev !== null && prev.side === side && prev.index === index && now - prev.time < DBL_CLICK_MS;

    if (isDouble) {
      lastClickRef.current = null;
      navigateInto({ panel: { ...panel, cursor: index }, setPanel: setSide, api, requestKey: side });
      return;
    }
    lastClickRef.current = { side, index, time: now };

    if (ev.shiftKey) {
      rangeSelect({ panel, setPanel: setSide, toIndex: index });
    } else if (ev.metaKey) {
      setSide({ cursor: index });
      toggleMark({ panel: { ...panel, cursor: index }, setPanel: setSide });
    } else {
      setSide({ cursor: index, selection: new Set() });
    }
  };

  // Double-click navigation is handled via onRowMouseDown timing above, so
  // onRowDouble is a no-op — prevents duplicate navigate on browsers that do
  // fire the native dblclick.
  const onRowDouble = (_side: PanelSide) => (_index: number, _e: React.MouseEvent) => {};

  const onRowContextMenu = (side: PanelSide) => (index: number, ev: React.MouseEvent) => {
    ev.preventDefault();
    useStore.setState({ activeSide: side });
    const panel = useStore.getState().panels[side];
    const entry = panel.entries[index];
    if (!entry) return;
    const isDotDot = entry.name === '..';
    const nextSelection = selectionForContextTarget(panel, entry);
    setPanel(side, { cursor: index, selection: nextSelection });
    const name = entry.ext ? `${entry.name}.${entry.ext}` : entry.name;
    const fullPath = panel.path === '/' ? `/${name}` : `${panel.path}/${name}`;
    void api.menu.popupFileContext({
      x: ev.clientX,
      y: ev.clientY,
      fullPath,
      isDir: !!entry.isDir,
      isDotDot,
      isAppBundle: !!entry.isAppBundle,
    });
  };

  const onPathCommit = (side: PanelSide) => async (p: string): Promise<boolean> => {
    const panel = useStore.getState().panels[side];
    const setSide = (patch: Partial<typeof panel>) => setPanel(side, patch);
    return navigateTo({ panel, setPanel: setSide, api, path: p, requestKey: side });
  };

  const onSort = (side: PanelSide) => (col: SortCol) => {
    const panel = useStore.getState().panels[side];
    applySort(panel, col, (patch) => setPanel(side, patch));
  };

  /** Navigate whichever panel is active to `path`. Shared by every place that
   *  offers a destination: drive bar, bookmarks, favorites bar and picker. */
  const goTo = (path: string) => {
    const side = useStore.getState().activeSide;
    const panel = useStore.getState().panels[side];
    const setSide = (patch: Partial<typeof panel>) => setPanel(side, patch);
    void navigateTo({ panel, setPanel: setSide, api, path, requestKey: side });
  };

  const refreshSide = (side: PanelSide) => {
    const panel = useStore.getState().panels[side];
    const setSide = (p: Partial<typeof panel>) => setPanel(side, p);
    return navigateTo({ panel, setPanel: setSide, api, path: panel.path, requestKey: side });
  };

  const runOp = async (op: FileOp, title: string, side: PanelSide, otherSide: PanelSide) => {
    const setDialog = useStore.getState().setDialog;
    const id: OpId = await api.ops.start(op);
    setDialog({
      kind: 'progress', opId: id, title,
      filesDone: 0, filesTotal: op.sources.length, bytesDone: 0, bytesTotal: 0, currentFile: '',
    });
    let settled = false;
    const subscription: { unsubscribe: null | (() => void) } = { unsubscribe: null };
    const closeAndRefresh = async () => {
      if (settled) return;
      settled = true;
      setDialog(null);
      const unsubscribe = subscription.unsubscribe;
      subscription.unsubscribe = null;
      unsubscribe?.();
      await Promise.all([refreshSide(side), refreshSide(otherSide)]);
    };
    subscription.unsubscribe = api.ops.subscribe(id, async (ev: OpEvent) => {
      if (ev.kind === 'progress') {
        setDialog({
          kind: 'progress', opId: id, title,
          filesDone: ev.filesDone, filesTotal: ev.filesTotal,
          bytesDone: ev.bytesDone, bytesTotal: ev.bytesTotal, currentFile: ev.currentFile,
        });
      } else if (ev.kind === 'conflict') {
        setDialog({ kind: 'overwrite', opId: id, srcPath: ev.srcPath, dstPath: ev.dstPath });
      } else if (ev.kind === 'error') {
        await closeAndRefresh();
        alert(`${op.kind === 'copy' ? 'Copy' : 'Move'} failed: ${describeOpError(ev.error)}`);
      } else if (ev.kind === 'complete' || ev.kind === 'cancelled') {
        await closeAndRefresh();
      }
    });
    if (settled) {
      const unsubscribe = subscription.unsubscribe;
      subscription.unsubscribe = null;
      unsubscribe?.();
    }
  };

  const dialogHandlers = {
    onMkdir: async (side: PanelSide, name: string) => {
      const panel = useStore.getState().panels[side];
      const r = await api.fs.mkdir(panel.path, name);
      if (!r.ok) { alert(`Could not create folder: ${r.error.kind}`); return; }
      await refreshSide(side);
      const refreshed = useStore.getState().panels[side];
      const idx = refreshed.entries.findIndex((e) => e.name === name && e.isDir);
      if (idx >= 0) setPanel(side, { cursor: idx });
    },
    onRename: async (side: PanelSide, oldName: string, newName: string) => {
      const panel = useStore.getState().panels[side];
      const from = panel.path === '/' ? `/${oldName}` : `${panel.path}/${oldName}`;
      const to = panel.path === '/' ? `/${newName}` : `${panel.path}/${newName}`;
      const r = await api.fs.rename(from, to);
      if (r.ok) await refreshSide(side);
      else alert(`Could not rename: ${r.error.kind}`);
    },
    onDeleteConfirmed: async (paths: string[]) => {
      const r = await api.fs.delete(paths);
      if (!r.ok) alert(`Delete failed: ${r.error.kind}`);
      await Promise.all([refreshSide('left'), refreshSide('right')]);
    },
    onCopyConfirmed: (sources: string[], dst: string) => {
      const side = useStore.getState().activeSide;
      const other: PanelSide = side === 'left' ? 'right' : 'left';
      void runOp({ kind: 'copy', sources, dst }, `Copying ${sources.length} item(s)…`, side, other);
    },
    onMoveConfirmed: (sources: string[], dst: string) => {
      const side = useStore.getState().activeSide;
      const other: PanelSide = side === 'left' ? 'right' : 'left';
      void runOp({ kind: 'move', sources, dst }, `Moving ${sources.length} item(s)…`, side, other);
    },
    onOverwriteAnswer: (opId: string, a: ConflictAnswer) => {
      void api.ops.answerConflict(opId, a);
    },
    onCancelOp: (opId: string) => {
      void api.ops.cancel(opId);
    },
    onFavoriteSaved: (path: string, label: string) => {
      useStore.getState().renameFavorite(path, label);
    },
    onFavoriteRemoved: (path: string) => {
      useStore.getState().removeFavorite(path);
    },
    onMultiRename: async (side: PanelSide, dir: string, rows: RenamePreviewRow[]) => {
      const outcome = await applyRenamePlan(api, dir, rows);
      await refreshSide(side);
      if (outcome.failures.length > 0) {
        const detail = outcome.failures
          .slice(0, 8)
          .map((f) => `${f.name}: ${f.reason}`)
          .join('\n');
        const more = outcome.failures.length > 8 ? `\n…and ${outcome.failures.length - 8} more` : '';
        alert(`Renamed ${outcome.renamed}, failed ${outcome.failures.length}:\n${detail}${more}`);
      }
    },
  };

  // Ctrl+Q turns the *other* pane into a live preview of the active cursor, so
  // one side keeps browsing while the other renders whatever it lands on.
  const quickViewTarget = state.quickView ? cursorPath(active) : null;
  const quickViewIsDir = active.entries[active.cursor]?.isDir ?? false;

  const renderPane = (side: PanelSide) => {
    if (state.quickView && side !== state.activeSide) {
      if (!quickViewTarget || quickViewIsDir) {
        return (
          <div className="gc-viewer gc-viewer-embedded" data-testid="gc-quickview-empty">
            <div className="gc-viewer-head">
              <span className="gc-viewer-name">Quick view</span>
              <button type="button" className="gc-viewer-close" onClick={() => useStore.getState().setQuickView(false)} aria-label="Close viewer">✕</button>
            </div>
            <div className="gc-viewer-body">
              <div className="gc-viewer-empty">
                {quickViewIsDir ? 'Folder selected — nothing to preview.' : 'Nothing selected.'}
              </div>
            </div>
          </div>
        );
      }
      return (
        <Viewer
          path={quickViewTarget}
          variant="embedded"
          onClose={() => useStore.getState().setQuickView(false)}
        />
      );
    }
    const panel = side === 'left' ? left : right;
    return (
      <Panel
        side={side} panel={panel} isActive={state.activeSide === side}
        onActivate={() => useStore.setState({ activeSide: side })}
        onRowMouseDown={onRowMouseDown(side)}
        onRowDouble={onRowDouble(side)}
        onRowContextMenu={onRowContextMenu(side)}
        onPathCommit={onPathCommit(side)}
        onSort={onSort(side)}
        pathBarRef={side === 'left' ? leftPathRef : rightPathRef}
        searchBuffer={state.quickSearch && state.quickSearch.side === side ? state.quickSearch.buffer : null}
      />
    );
  };

  return (
    <div className="gc-app">
      <UpdateBanner />
      <DriveBar volumes={state.volumes} currentPath={active.path} onPick={goTo} />
      <BookmarkBar
        bookmarks={state.bookmarks}
        onPick={goTo}
        onClear={(slot) => useStore.getState().setBookmark(slot, null)}
      />
      <FavoritesBar
        favorites={state.favorites}
        onPick={goTo}
        onEdit={(f) => useStore.getState().setDialog({
          kind: 'favoriteEdit', path: f.path, label: f.label ?? '',
        })}
        onReorder={(from, to) => useStore.getState().moveFavorite(from, to)}
      />
      <div className="gc-panel-row">
        <div style={{ width: `${leftWidth}%` }}>{renderPane('left')}</div>
        <Splitter
          onDrag={(pct) => {
            setPanel('left', { width: pct });
            setPanel('right', { width: 100 - pct });
          }}
          onReset={() => {
            setPanel('left', { width: 50 });
            setPanel('right', { width: 50 });
          }}
        />
        <div style={{ width: `${100 - leftWidth}%` }}>{renderPane('right')}</div>
      </div>
      {state.terminalOpen && (
        <Terminal
          cwd={active.path}
          onClose={closeTerminal}
        />
      )}
      <CommandLine
        cwd={(() => {
          const home = state.volumes.find((v) => v.kind === 'home')?.path;
          if (home && (active.path === home || active.path.startsWith(home + '/'))) {
            return '~' + active.path.slice(home.length);
          }
          return active.path;
        })()}
        inputRef={cmdRef}
        onCursorUp={() => void dispatch('cursorUp')}
        onCursorDown={() => void dispatch('cursorDown')}
        onRun={async (cmd) => {
          const r = await api.shell.runCommand(cmd, active.path);
          setCmdOutput({ cmd, ...r });
          // Refresh both panels in case the command changed files.
          await Promise.all([refreshSide('left'), refreshSide('right')]);
        }}
      />
      <FKeyBar onInvoke={(cmd) => void dispatch(cmd)} />
      {cmdOutput && (
        <div className="gc-modal-backdrop" onMouseDown={() => setCmdOutput(null)}>
          <div className="gc-modal gc-cmdresult" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gc-modal-title">{cmdOutput.exitCode === 0 ? '✓' : '✗'} {cmdOutput.cmd}</div>
            <div className="gc-modal-body">
              {cmdOutput.stdout && <pre className="gc-cmd-stdout">{cmdOutput.stdout}</pre>}
              {cmdOutput.stderr && <pre className="gc-cmd-stderr">{cmdOutput.stderr}</pre>}
              {!cmdOutput.stdout && !cmdOutput.stderr && <p>(no output)</p>}
              <div className="gc-modal-actions">
                <button autoFocus onClick={() => setCmdOutput(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Dialogs {...dialogHandlers} />
      {state.viewer && (
        <div className="gc-viewer-backdrop">
          <Viewer
            path={state.viewer.path}
            variant="overlay"
            onClose={() => useStore.getState().setViewer(null)}
          />
        </div>
      )}
      {cheatVisible && <Cheatsheet />}
      {state.favoritePickerOpen && (
        <FavoritePicker
          favorites={state.favorites}
          onPick={(p) => {
            useStore.getState().setFavoritePickerOpen(false);
            goTo(p);
          }}
          onCancel={() => useStore.getState().setFavoritePickerOpen(false)}
        />
      )}
    </div>
  );
}
