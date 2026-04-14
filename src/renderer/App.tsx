// src/renderer/App.tsx
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from './state/store';
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
    }
  }, [api, setPanel]);

  // Global keyboard router
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys when an input is focused (PathBar)
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const combo = eventToCombo(e);
      if (!combo) return;
      const cmd = lookup(combo);
      if (!cmd) return;
      e.preventDefault();
      dispatch(cmd);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const left = state.panels.left;
  const right = state.panels.right;
  const active = state.panels[state.activeSide];
  const leftWidth = left.width;

  const onRowClick = (side: PanelSide) => (index: number, ev: React.MouseEvent) => {
    if (state.activeSide !== side) useStore.setState({ activeSide: side });
    const panel = useStore.getState().panels[side];
    const setSide = (p: Partial<typeof panel>) => setPanel(side, p);
    if (ev.shiftKey) {
      rangeSelect({ panel, setPanel: setSide, toIndex: index });
    } else if (ev.metaKey) {
      setSide({ cursor: index });
      toggleMark({ panel: { ...panel, cursor: index }, setPanel: setSide });
    } else {
      setSide({ cursor: index, selection: new Set() });
    }
  };

  const onRowDouble = (side: PanelSide) => (index: number) => {
    useStore.setState({ activeSide: side });
    const panel = useStore.getState().panels[side];
    const setSide = (p: Partial<typeof panel>) => setPanel(side, p);
    navigateInto({ panel: { ...panel, cursor: index }, setPanel: setSide, api });
  };

  const onPathCommit = (side: PanelSide) => (p: string) => {
    const panel = useStore.getState().panels[side];
    const setSide = (patch: Partial<typeof panel>) => setPanel(side, patch);
    navigateTo({ panel, setPanel: setSide, api, path: p });
  };

  const onSort = (side: PanelSide) => (col: SortCol) => {
    const panel = useStore.getState().panels[side];
    applySort(panel, col, (patch) => setPanel(side, patch));
  };

  return (
    <div className="gc-app">
      <DriveBar volumes={state.volumes} currentPath={active.path} onPick={(p) => {
        const panel = useStore.getState().panels[state.activeSide];
        const setSide = (patch: Partial<typeof panel>) => setPanel(state.activeSide, patch);
        navigateTo({ panel, setPanel: setSide, api, path: p });
      }} />
      <div className="gc-panel-row">
        <div style={{ width: `${leftWidth}%` }}>
          <Panel
            side="left" panel={left} isActive={state.activeSide === 'left'}
            onActivate={() => useStore.setState({ activeSide: 'left' })}
            onRowClick={onRowClick('left')}
            onRowDouble={onRowDouble('left')}
            onPathCommit={onPathCommit('left')}
            onSort={onSort('left')}
            pathBarRef={leftPathRef}
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
            onRowClick={onRowClick('right')}
            onRowDouble={onRowDouble('right')}
            onPathCommit={onPathCommit('right')}
            onSort={onSort('right')}
            pathBarRef={rightPathRef}
          />
        </div>
      </div>
    </div>
  );
}
