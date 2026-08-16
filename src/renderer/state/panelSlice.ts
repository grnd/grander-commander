// src/renderer/state/panelSlice.ts
import type { FileEntry, PanelSource, SortCol, SortDir } from '@shared/types';

export type PanelSide = 'left' | 'right';

let tabSeq = 0;

export type PanelState = {
  /** Stable identity for the tab strip's React keys. */
  id: string;
  path: string;
  /** `fs` lists `path`; a virtual source supplies rows from elsewhere. */
  source: PanelSource;
  entries: FileEntry[];     // sorted per `sort`
  sort: { col: SortCol; dir: SortDir };
  cursor: number;           // index into entries
  selection: Set<string>;   // entry keys: `${name}.${ext}` or `${name}` if no ext
  showHidden: boolean;
  history: string[];
  loading: boolean;
  error: string | null;
  width: number;            // percent (0..100), left width; right = 100 - left
};

export function initialPanelState(path: string): PanelState {
  return {
    id: `tab-${++tabSeq}`,
    path,
    source: { kind: 'fs' },
    entries: [],
    sort: { col: 'name', dir: 'asc' },
    cursor: 0,
    selection: new Set(),
    showHidden: false,
    history: [],
    loading: false,
    error: null,
    width: 50,
  };
}

export function entryKey(e: FileEntry): string {
  return e.ext ? `${e.name}.${e.ext}` : e.name;
}

/** Join a directory and a basename without doubling the slash at the root. */
export function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/**
 * Absolute path of a row. Search results carry their own location, since they
 * were gathered from many directories and do not live under `panel.path`.
 */
export function entryPath(panel: PanelState, entry: FileEntry): string {
  return entry.srcPath ?? joinPath(panel.path, entryKey(entry));
}

/**
 * Absolute path of the row under the cursor, or null when there is nothing
 * actionable there (empty panel, or the synthetic "..").
 */
export function cursorPath(panel: PanelState): string | null {
  const cur = panel.entries[panel.cursor];
  if (!cur || cur.name === '..') return null;
  return entryPath(panel, cur);
}

/**
 * Paths the next operation should act on: every marked row, or — when nothing
 * is marked — just the row under the cursor. This is Total Commander's rule and
 * every mutation command follows it.
 */
export function targetNames(panel: PanelState): string[] {
  if (panel.selection.size > 0) {
    // Panel order, not Set insertion order: the multi-rename counter has to
    // follow what the user sees.
    const marked = panel.selection;
    return panel.entries
      .filter((e) => e.name !== '..' && marked.has(entryKey(e)))
      .map(entryKey);
  }
  const cur = panel.entries[panel.cursor];
  if (!cur || cur.name === '..') return [];
  return [entryKey(cur)];
}

export function targetPaths(panel: PanelState): string[] {
  const marked = panel.selection;
  const rows = marked.size > 0
    ? panel.entries.filter((e) => e.name !== '..' && marked.has(entryKey(e)))
    : (() => {
        const cur = panel.entries[panel.cursor];
        return cur && cur.name !== '..' ? [cur] : [];
      })();
  return rows.map((e) => entryPath(panel, e));
}
