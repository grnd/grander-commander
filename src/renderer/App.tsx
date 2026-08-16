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
import {
  cursorPath, entryKey, entryPath, targetNames, targetPaths, workingDir,
} from './state/panelSlice';
import { applyRenamePlan, type RenamePreviewRow } from './commands/multirename';
import { SYNC_LABELS, type SyncAction, type SyncPlan } from './commands/sync';
import { archiveDragMembers, archiveTargets } from './commands/archive';
import {
  GC_ARCHIVE, GC_PATHS, decodeArchiveDrag, decodePaths, dragPaths, dropTarget, encodeArchiveDrag,
  encodePaths, externalPaths, resolveDrop,
} from './commands/dnd';

import { eventToCombo, lookup, allowedFromInput } from './keybindings';
import type { CommandName } from './commands';
import { sortEntries } from './commands/sort';
import {
  cursorMove, cursorTo, navigateInto, navigateUp, navigateTo, openArchive, revealPath,
  showSearchResults,
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
import { opItemCount } from '@shared/types';
import type {
  ArchiveFormat, ArchiveOp, FileEntry, FileOp, OpEvent, OpId, ConflictAnswer, OpError, MenuCommand,
} from '@shared/types';

/**
 * Commands that assume the panel's rows are files on disk. An archive listing
 * has no such paths, so these are refused there rather than acting on a
 * synthesised one. Copy is the exception: inside an archive it means extract.
 */
const BLOCKED_IN_ARCHIVE: ReadonlySet<string> = new Set([
  'mkdir', 'rename', 'move', 'trash', 'deleteConfirm', 'deleteCursorConfirm',
  'duplicate', 'multiRename', 'quickLook', 'viewFile', 'compareFiles',
  'runShellCommand', 'packArchive',
]);

/**
 * Commands that write into "the folder this panel is showing". Search results
 * come from many folders at once and an archive listing from none, so there is
 * no single directory for these to mean.
 */
const NEEDS_REAL_DIR: ReadonlySet<string> = new Set(['mkdir', 'rename', 'multiRename']);

/** fs:trash validates at most 1024 paths per call; a mirror can plan more. */
const TRASH_CHUNK = 1000;

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

const OP_LABEL: Record<FileOp['kind'], string> = {
  copy: 'Copy',
  move: 'Move',
  syncCopy: 'Sync',
};

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
  // Set when a plain click landed on an already-marked row; the selection is
  // cleared on mouseup instead, so a drag starting from that row keeps it.
  const pendingClearRef = useRef<PanelSide | null>(null);
  const DBL_CLICK_MS = 450;
  const cmdRef = useRef<HTMLInputElement>(null);
  const qsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cheatVisible, setCheatVisible] = useState(false);
  // Which panel, and which folder row inside it, a drag in flight is over.
  const [dropHint, setDropHint] = useState<{ side: PanelSide; index: number | null } | null>(null);
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

  /**
   * Re-list a panel in place. Virtual panels are skipped: their `path` is a
   * label, and listing it would replace search results or an archive listing
   * with a "not found" error.
   */
  const refreshSide = useCallback(async (side: PanelSide) => {
    const panel = useStore.getState().panels[side];
    if (panel.source.kind !== 'fs') return false;
    return navigateTo({
      panel, setPanel: (patch) => setPanel(side, patch), api, path: panel.path, requestKey: side,
    });
  }, [api, setPanel]);

  /**
   * Run a pack/unpack. These are one external process with no progress to
   * report, so the dialog is an honest indeterminate bar with a Cancel that
   * kills the child.
   */
  const runArchive = useCallback(async (op: ArchiveOp, title: string, detail: string) => {
    const token = `arc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const setDialog = useStore.getState().setDialog;
    setDialog({ kind: 'busy', title, detail, token });
    const r = await api.archive.run(token, op);
    // Only clear the dialog if this op still owns it.
    const current = useStore.getState().dialog;
    if (current?.kind === 'busy' && current.token === token) setDialog(null);
    await Promise.all([refreshSide('left'), refreshSide('right')]);
    if (!r.ok) alert(`${title} failed: ${describeOpError(r.error)}`);
  }, [api, refreshSide]);

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

    if (active.source.kind === 'archive' && BLOCKED_IN_ARCHIVE.has(cmd)) return;
    if (active.source.kind !== 'fs' && NEEDS_REAL_DIR.has(cmd)) return;
    // A virtual panel's `path` is a label, so folder-level tools have nothing
    // real to work with.
    if (cmd === 'syncFolders'
      && (s.panels.left.source.kind !== 'fs' || s.panels.right.source.kind !== 'fs')) return;

    // Bookmark commands are generated per slot (gotoBookmark1..9 /
    // setBookmark1..9), so they are matched rather than listed in the switch.
    // Switching or closing a tab swaps a whole panel view in; the incoming one
    // may have been loaded minutes ago, so it is re-listed on arrival.
    const reloadActiveTab = async (side: PanelSide) => {
      const panel = useStore.getState().panels[side];
      await navigateTo({
        panel,
        setPanel: (patch) => setPanel(side, patch),
        api,
        path: panel.path,
        requestKey: side,
      });
    };

    const tabSelect = /^selectTab([1-9])$/.exec(cmd);
    if (tabSelect) {
      const index = Number(tabSelect[1]) - 1;
      if (index >= useStore.getState().tabs[s.activeSide].length) return;
      useStore.getState().selectTab(s.activeSide, index);
      return reloadActiveTab(s.activeSide);
    }

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
        // Only a real listing filters by the flag; a virtual panel just records
        // it for whatever it lists next.
        if (active.source.kind !== 'fs') return;
        return navigateTo({
          panel: { ...active, showHidden: newShow }, setPanel: setActive, api, path: active.path, requestKey: s.activeSide,
        });
      }
      case 'refresh': {
        // Re-listing a virtual panel by its `path` would replace it with a
        // "not found" error, since that path is a label.
        if (active.source.kind === 'archive') {
          return openArchive(navCtx, active.source.archivePath, active.source.innerPath).then(() => {});
        }
        if (active.source.kind !== 'fs') return;
        return navigateTo({ panel: active, setPanel: setActive, api, path: active.path, requestKey: s.activeSide });
      }
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
        // Inside an archive, "copy to the other panel" is an extraction.
        if (active.source.kind === 'archive') {
          const members = archiveTargets(active);
          if (members.length === 0) return;
          const dest = s.panels[s.activeSide === 'left' ? 'right' : 'left'];
          if (dest.source.kind !== 'fs') return;
          void runArchive(
            {
              kind: 'extract',
              archivePath: active.source.archivePath,
              members,
              dest: dest.path,
              // Lift the members out of the folder being browsed, so what lands
              // in the other panel is what the user can see selected.
              stripPrefix: active.source.innerPath,
            },
            'Extracting',
            `${members.length} item(s) → ${dest.path}`,
          );
          return;
        }
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
        useStore.getState().addFavorite(workingDir(active));
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
      case 'newTab':
        useStore.getState().newTab(s.activeSide);
        return reloadActiveTab(s.activeSide);
      case 'closeTab': {
        const st = useStore.getState();
        // Cmd+W on the last tab closes the window, as it does everywhere else
        // on macOS — otherwise binding it here would quietly take the shortcut
        // away from the user.
        if (st.tabs[s.activeSide].length <= 1) { window.close(); return; }
        st.closeTab(s.activeSide, st.activeTab[s.activeSide]);
        return reloadActiveTab(s.activeSide);
      }
      case 'packArchive': {
        const sources = targetPaths(active);
        if (sources.length === 0 || active.source.kind !== 'fs') return;
        const other = s.panels[s.activeSide === 'left' ? 'right' : 'left'];
        const destDir = other.source.kind === 'fs' ? other.path : active.path;
        const leaf = active.path.slice(active.path.lastIndexOf('/') + 1) || 'archive';
        const defaultName = sources.length === 1
          ? sources[0].slice(sources[0].lastIndexOf('/') + 1)
          : leaf;
        useStore.getState().setDialog({ kind: 'pack', sources, destDir, defaultName });
        return;
      }
      case 'openSearch':
        useStore.getState().setDialog({
          kind: 'search',
          side: s.activeSide,
          root: workingDir(active),
          otherRoot: workingDir(s.panels[s.activeSide === 'left' ? 'right' : 'left']),
        });
        return;
      case 'revealInPanel': {
        // The way out of a search listing: jump to the row's real folder with
        // the cursor already on it.
        const full = cursorPath(active);
        if (!full) return;
        return revealPath({ panel: active, setPanel: setActive, api, requestKey: s.activeSide }, full);
      }
      case 'syncFolders':
        useStore.getState().setDialog({
          kind: 'sync', leftRoot: s.panels.left.path, rightRoot: s.panels.right.path,
        });
        return;
      case 'compareFiles': {
        // Two marked files in one panel is the explicit gesture; otherwise fall
        // back to "the file under each panel's cursor", which is the dual-pane
        // way to line two versions up.
        const marked = targetPaths(active);
        const pair: [string, string] | null =
          marked.length === 2
            ? [marked[0], marked[1]]
            : (() => {
                const l = cursorPath(s.panels.left);
                const r = cursorPath(s.panels.right);
                return l && r ? [l, r] : null;
              })();
        if (!pair) return;
        useStore.getState().setDialog({ kind: 'compare', left: pair[0], right: pair[1] });
        return;
      }
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
        void api.shell.openTerminal(workingDir(active));
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
  }, [api, setPanel, runArchive]);

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
      return;
    }
    if (ev.metaKey) {
      setSide({ cursor: index });
      toggleMark({ panel: { ...panel, cursor: index }, setPanel: setSide });
      return;
    }

    const entry = panel.entries[index];
    const grabbedMarked = Boolean(entry) && panel.selection.has(entryKey(entry));
    if (!grabbedMarked) {
      setSide({ cursor: index, selection: new Set() });
      return;
    }

    // Pressing on a row that is already marked must not clear the selection
    // yet: mousedown fires before dragstart, so clearing here is what made a
    // multi-file drag carry a single file. Defer the clear to mouseup, and
    // cancel it if a drag actually starts.
    setSide({ cursor: index });
    pendingClearRef.current = side;
    const onUp = () => {
      const pendingSide = pendingClearRef.current;
      pendingClearRef.current = null;
      if (pendingSide) setPanel(pendingSide, { selection: new Set() });
    };
    document.addEventListener('mouseup', onUp, { once: true });
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
    const fullPath = entryPath(panel, entry);
    void api.menu.popupFileContext({
      x: ev.clientX,
      y: ev.clientY,
      fullPath,
      isDir: !!entry.isDir,
      isDotDot,
      isAppBundle: !!entry.isAppBundle,
    });
  };

  /**
   * Start a drag. A plain drag is an ordinary HTML5 one, which is what makes a
   * drop on the other panel work. Alt hands the files to the OS instead so they
   * can land in Finder — Electron's native drag takes the gesture over
   * completely, so the two cannot share one drag.
   */
  const onRowDragStart = (side: PanelSide) => (index: number, ev: React.DragEvent) => {
    // The click that began this drag was on a marked row; keep the marks.
    pendingClearRef.current = null;
    const panel = useStore.getState().panels[side];

    // Archive members have no path on disk, so they travel as an extraction
    // request. Alt-dragging one out to Finder is not possible for the same
    // reason — there is nothing yet for the OS to hand over.
    if (panel.source.kind === 'archive') {
      const members = archiveDragMembers(panel, index);
      if (members.length === 0 || ev.altKey) { ev.preventDefault(); return; }
      ev.dataTransfer.setData(GC_ARCHIVE, encodeArchiveDrag({
        archivePath: panel.source.archivePath,
        stripPrefix: panel.source.innerPath,
        members,
      }));
      ev.dataTransfer.effectAllowed = 'copy';
      return;
    }

    const paths = dragPaths(panel, index);
    if (paths.length === 0) { ev.preventDefault(); return; }

    if (ev.altKey) {
      ev.preventDefault();
      void api.shell.startDrag(paths);
      return;
    }
    // Deliberately no text/plain: Finder accepts it and writes a "Text
    // Clipping" file named after the path, which looks like a broken copy.
    // Dragging out to another app is Alt+drag, which hands over real files.
    ev.dataTransfer.setData(GC_PATHS, encodePaths(paths));
    ev.dataTransfer.effectAllowed = 'copyMove';
  };

  const onDragOverTarget = (side: PanelSide) => (index: number | null, ev: React.DragEvent) => {
    const panel = useStore.getState().panels[side];
    if (panel.source.kind !== 'fs') return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = ev.shiftKey ? 'move' : 'copy';
    const overFolder = index !== null
      && panel.entries[index]?.isDir
      && panel.entries[index]?.name !== '..';
    setDropHint({ side, index: overFolder ? index : null });
  };

  const onDropOnTarget = (side: PanelSide) => (index: number | null, ev: React.DragEvent) => {
    ev.preventDefault();
    setDropHint(null);
    const panel = useStore.getState().panels[side];

    // Dropped out of an archive: same work F5 does, aimed at wherever it landed.
    const fromArchive = decodeArchiveDrag(ev.dataTransfer.getData(GC_ARCHIVE));
    if (fromArchive) {
      const dest = dropTarget(panel, index);
      if (!dest) return;
      void runArchive(
        { kind: 'extract', ...fromArchive, dest },
        'Extracting',
        `${fromArchive.members.length} item(s) → ${dest}`,
      );
      return;
    }

    const internal = decodePaths(ev.dataTransfer.getData(GC_PATHS));
    const sources = internal.length > 0 ? internal : externalPaths(ev.dataTransfer.files);
    const dest = dropTarget(panel, index);
    const intent = resolveDrop(sources, dest, { shiftKey: ev.shiftKey });
    if (!intent) return;

    // Files arriving from Finder are always copied: moving them out from under
    // another app on a plain drag is not a decision to make for the user.
    const kind = internal.length > 0 ? intent.kind : 'copy';
    const other: PanelSide = side === 'left' ? 'right' : 'left';
    void runOp(
      { kind, sources: intent.sources, dst: intent.dest },
      `${kind === 'copy' ? 'Copying' : 'Moving'} ${intent.sources.length} item(s)…`,
      side, other,
    );
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

  const runOp = async (op: FileOp, title: string, side: PanelSide, otherSide: PanelSide) => {
    const setDialog = useStore.getState().setDialog;
    const id: OpId = await api.ops.start(op);
    setDialog({
      kind: 'progress', opId: id, title,
      filesDone: 0, filesTotal: opItemCount(op), bytesDone: 0, bytesTotal: 0, currentFile: '',
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
        alert(`${OP_LABEL[op.kind]} failed: ${describeOpError(ev.error)}`);
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
    onPack: (sources: string[], destDir: string, name: string, format: ArchiveFormat) => {
      void runArchive(
        { kind: 'create', format, archivePath: `${destDir === '/' ? '' : destDir}/${name}`, sources },
        'Packing',
        `${sources.length} item(s) → ${name}`,
      );
    },
    onCancelArchive: (token: string) => {
      void api.archive.cancel(token);
    },
    onSearchResults: (side: PanelSide, label: string, roots: string[], entries: FileEntry[]) => {
      // Results open in their own tab so the folder you searched from is still
      // one Cmd+1 away.
      useStore.getState().newTab(side);
      const panel = useStore.getState().panels[side];
      showSearchResults(
        { panel, setPanel: (patch) => setPanel(side, patch) },
        { label, roots, entries },
      );
      useStore.setState({ activeSide: side });
    },
    onSyncRun: async (action: SyncAction, plan: SyncPlan) => {
      // Deletions first: mirroring a folder over a file needs the file gone
      // before the copy can land.
      for (let i = 0; i < plan.deletes.length; i += TRASH_CHUNK) {
        const r = await api.fs.trash(plan.deletes.slice(i, i + TRASH_CHUNK));
        if (!r.ok) {
          alert(`${SYNC_LABELS[action]} failed while deleting: ${describeOpError(r.error)}`);
          await Promise.all([refreshSide('left'), refreshSide('right')]);
          return;
        }
      }
      if (plan.copies.length === 0) {
        await Promise.all([refreshSide('left'), refreshSide('right')]);
        return;
      }
      await runOp(
        { kind: 'syncCopy', pairs: plan.copies.map(({ src, dst }) => ({ src, dst })), overwrite: true },
        `${SYNC_LABELS[action]} — ${plan.copies.length} item(s)…`,
        'left', 'right',
      );
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
  // Shell, terminal and drive bar all need a real folder; in a virtual panel
  // `path` is a label.
  const activeDir = workingDir(active);

  // Archive rows have no path on disk, so there is nothing for the viewer to
  // read; search hits carry their real location and preview normally.
  const quickViewTarget = state.quickView && active.source.kind !== 'archive'
    ? cursorPath(active)
    : null;
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
        tabs={state.tabs[side].map((t, i) => ({
          id: t.id,
          // The active tab's stored copy is stale by design — its live path
          // lives in `panels`.
          path: i === state.activeTab[side] ? panel.path : t.path,
        }))}
        activeTab={state.activeTab[side]}
        onSelectTab={(i) => {
          useStore.setState({ activeSide: side });
          useStore.getState().selectTab(side, i);
          void refreshSide(side);
        }}
        onCloseTab={(i) => {
          useStore.getState().closeTab(side, i);
          void refreshSide(side);
        }}
        onNewTab={() => {
          useStore.setState({ activeSide: side });
          useStore.getState().newTab(side);
          void refreshSide(side);
        }}
        onRowDragStart={onRowDragStart(side)}
        onDragOverTarget={onDragOverTarget(side)}
        onDropOnTarget={onDropOnTarget(side)}
        onDragLeavePanel={() => setDropHint((h) => (h?.side === side ? null : h))}
        dropTargetIndex={dropHint?.side === side ? dropHint.index : null}
        isDropActive={dropHint?.side === side}
      />
    );
  };

  return (
    <div className="gc-app">
      <UpdateBanner />
      <DriveBar volumes={state.volumes} currentPath={activeDir} onPick={goTo} />
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
          cwd={activeDir}
          onClose={closeTerminal}
        />
      )}
      <CommandLine
        cwd={activeDir}
        label={(() => {
          const home = state.volumes.find((v) => v.kind === 'home')?.path;
          if (home && (activeDir === home || activeDir.startsWith(home + '/'))) {
            return '~' + activeDir.slice(home.length);
          }
          return activeDir;
        })()}
        inputRef={cmdRef}
        onCursorUp={() => void dispatch('cursorUp')}
        onCursorDown={() => void dispatch('cursorDown')}
        onRun={async (cmd) => {
          const r = await api.shell.runCommand(cmd, activeDir);
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
