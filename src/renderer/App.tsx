// src/renderer/App.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './state/store';
import { Cheatsheet } from './components/Cheatsheet';
import { FavoritesBar } from './components/FavoritesBar';
import { FavoritePicker } from './components/FavoritePicker';
import { CommandLine } from './components/CommandLine';
import { FKeyBar } from './components/FKeyBar';
import type { PanelSide } from './state/panelSlice';
import { eventToCombo, lookup } from './keybindings';
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
import { Panel } from './components/Panel';
import { Splitter } from './components/Splitter';
import type { SortCol } from '@shared/types';
import type { PanelState } from './state/panelSlice';
import {
  openMkdirDialog, openRenameDialog, openCopyDialog, openMoveDialog,
  requestTrash, requestDeleteConfirm,
} from './commands/mutations';
import { Dialogs } from './components/dialogs';
import type { FileOp, OpEvent, OpId, ConflictAnswer } from '@shared/types';

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

  const setPanel = useCallback((side: PanelSide, patch: Partial<typeof state.panels.left>) => {
    useStore.setState((s) => ({ panels: { ...s.panels, [side]: { ...s.panels[side], ...patch } } }));
    // state is referenced only at the type level (typeof state.panels.left); no runtime dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial volumes + initial paths
  useEffect(() => {
    (async () => {
      const vols = await api.volumes.list();
      useStore.setState({ volumes: vols });
      const home = vols.find((v) => v.kind === 'home')?.path ?? '/';
      // Load both panels
      await navigateTo({ panel: state.panels.left, setPanel: (p) => setPanel('left', p), api, path: home });
      const docs = `${home}/Documents`;
      await navigateTo({ panel: state.panels.right, setPanel: (p) => setPanel('right', p), api, path: docs });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatch = useCallback(async (cmd: CommandName) => {
    const s = useStore.getState();
    const active = s.panels[s.activeSide];
    const setActive = (patch: Partial<typeof active>) => setPanel(s.activeSide, patch);

    const navCtx = { panel: active, setPanel: setActive, api };
    const selCtx = { panel: active, setPanel: setActive };

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
        return navigateTo({ panel: active, setPanel: setActive, api, path: other.path });
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
        return navigateTo({ panel: { ...active, showHidden: newShow }, setPanel: setActive, api, path: active.path });
      }
      case 'refresh':         return navigateTo({ panel: active, setPanel: setActive, api, path: active.path });
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
            navigateTo({ panel: active, setPanel: setSide, api, path: active.path });
          },
        });
        return;
      case 'deleteConfirm':
        requestDeleteConfirm({ panel: active, setDialog: useStore.getState().setDialog });
        return;
      case 'deleteCursorConfirm': {
        const cur = active.entries[active.cursor];
        if (!cur || cur.name === '..') return;
        const name = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
        const full = active.path === '/' ? `/${name}` : `${active.path}/${name}`;
        useStore.getState().setDialog({ kind: 'deleteConfirm', paths: [full] });
        return;
      }
      case 'duplicate': {
        const cur = active.entries[active.cursor];
        if (!cur || cur.name === '..') return;
        const name = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
        const full = active.path === '/' ? `/${name}` : `${active.path}/${name}`;
        void (async () => {
          const r = await api.fs.duplicate(full);
          if (!r.ok) { alert(`Duplicate failed: ${r.error.kind}`); return; }
          await (async () => {
            const side = useStore.getState().activeSide;
            const panel = useStore.getState().panels[side];
            const setSide = (p: Partial<typeof panel>) => setPanel(side, p);
            await navigateTo({ panel, setPanel: setSide, api, path: panel.path });
          })();
        })();
        return;
      }
      case 'copyPath': {
        const cur = active.entries[active.cursor];
        if (!cur || cur.name === '..') return;
        const name = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
        const full = active.path === '/' ? `/${name}` : `${active.path}/${name}`;
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
        const cur = active.entries[active.cursor];
        if (!cur || cur.name === '..') return;
        const name = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
        const full = active.path === '/' ? `/${name}` : `${active.path}/${name}`;
        void api.shell.quickLook(full);
        return;
      }
      case 'openTerminal':
        void api.shell.openTerminal(active.path);
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
      // Don't steal keys when an input is focused (PathBar / cmdline)
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Don't route panel shortcuts while a modal/picker owns the keyboard
      const s = useStore.getState();
      if (s.dialog || s.favoritePickerOpen) return;

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
    const unsub = api.menu.onCommand((cmd) => {
      void dispatch(cmd as import('./commands').CommandName);
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
      navigateInto({ panel: { ...panel, cursor: index }, setPanel: setSide, api });
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
    // Move cursor onto the right-clicked row without altering existing selection
    setPanel(side, { cursor: index });
    const panel = useStore.getState().panels[side];
    const entry = panel.entries[index];
    if (!entry) return;
    const isDotDot = entry.name === '..';
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
    return navigateTo({ panel, setPanel: setSide, api, path: p });
  };

  const onSort = (side: PanelSide) => (col: SortCol) => {
    const panel = useStore.getState().panels[side];
    applySort(panel, col, (patch) => setPanel(side, patch));
  };

  const refreshSide = (side: PanelSide) => {
    const panel = useStore.getState().panels[side];
    const setSide = (p: Partial<typeof panel>) => setPanel(side, p);
    return navigateTo({ panel, setPanel: setSide, api, path: panel.path });
  };

  const runOp = async (op: FileOp, title: string, side: PanelSide, otherSide: PanelSide) => {
    const setDialog = useStore.getState().setDialog;
    const id: OpId = await api.ops.start(op);
    setDialog({
      kind: 'progress', opId: id, title,
      filesDone: 0, filesTotal: op.sources.length, bytesDone: 0, bytesTotal: 0, currentFile: '',
    });
    const unsub = api.ops.subscribe(id, async (ev: OpEvent) => {
      if (ev.kind === 'progress') {
        setDialog({
          kind: 'progress', opId: id, title,
          filesDone: ev.filesDone, filesTotal: ev.filesTotal,
          bytesDone: ev.bytesDone, bytesTotal: ev.bytesTotal, currentFile: ev.currentFile,
        });
      } else if (ev.kind === 'conflict') {
        setDialog({ kind: 'overwrite', opId: id, srcPath: ev.srcPath, dstPath: ev.dstPath });
      } else if (ev.kind === 'error') {
        setDialog(null);
      } else if (ev.kind === 'complete' || ev.kind === 'cancelled') {
        setDialog(null);
        unsub();
        await Promise.all([refreshSide(side), refreshSide(otherSide)]);
      }
    });
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
  };

  return (
    <div className="gc-app">
      <DriveBar volumes={state.volumes} currentPath={active.path} onPick={(p) => {
        const panel = useStore.getState().panels[state.activeSide];
        const setSide = (patch: Partial<typeof panel>) => setPanel(state.activeSide, patch);
        navigateTo({ panel, setPanel: setSide, api, path: p });
      }} />
      <FavoritesBar
        favorites={state.favorites}
        onPick={(p) => {
          const panel = useStore.getState().panels[state.activeSide];
          const setSide = (patch: Partial<typeof panel>) => setPanel(state.activeSide, patch);
          void navigateTo({ panel, setPanel: setSide, api, path: p });
        }}
        onRemove={(p) => useStore.getState().removeFavorite(p)}
      />
      <div className="gc-panel-row">
        <div style={{ width: `${leftWidth}%` }}>
          <Panel
            side="left" panel={left} isActive={state.activeSide === 'left'}
            onActivate={() => useStore.setState({ activeSide: 'left' })}
            onRowMouseDown={onRowMouseDown('left')}
            onRowDouble={onRowDouble('left')}
            onRowContextMenu={onRowContextMenu('left')}
            onPathCommit={onPathCommit('left')}
            onSort={onSort('left')}
            pathBarRef={leftPathRef}
            searchBuffer={state.quickSearch && state.quickSearch.side === 'left' ? state.quickSearch.buffer : null}
          />
        </div>
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
        <div style={{ width: `${100 - leftWidth}%` }}>
          <Panel
            side="right" panel={right} isActive={state.activeSide === 'right'}
            onActivate={() => useStore.setState({ activeSide: 'right' })}
            onRowMouseDown={onRowMouseDown('right')}
            onRowDouble={onRowDouble('right')}
            onRowContextMenu={onRowContextMenu('right')}
            onPathCommit={onPathCommit('right')}
            onSort={onSort('right')}
            pathBarRef={rightPathRef}
            searchBuffer={state.quickSearch && state.quickSearch.side === 'right' ? state.quickSearch.buffer : null}
          />
        </div>
      </div>
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
      {cheatVisible && <Cheatsheet />}
      {state.favoritePickerOpen && (
        <FavoritePicker
          favorites={state.favorites}
          onPick={(p) => {
            useStore.getState().setFavoritePickerOpen(false);
            const side = useStore.getState().activeSide;
            const panel = useStore.getState().panels[side];
            const setSide = (patch: Partial<typeof panel>) => setPanel(side, patch);
            void navigateTo({ panel, setPanel: setSide, api, path: p });
          }}
          onCancel={() => useStore.getState().setFavoritePickerOpen(false)}
        />
      )}
    </div>
  );
}
