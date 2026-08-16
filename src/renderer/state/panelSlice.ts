// src/renderer/state/panelSlice.ts
import type { FileEntry, SortCol, SortDir } from '@shared/types';

export type PanelSide = 'left' | 'right';

export type PanelState = {
  path: string;
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
    path,
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
 * Absolute path of the row under the cursor, or null when there is nothing
 * actionable there (empty panel, or the synthetic "..").
 */
export function cursorPath(panel: PanelState): string | null {
  const cur = panel.entries[panel.cursor];
  if (!cur || cur.name === '..') return null;
  return joinPath(panel.path, entryKey(cur));
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
  return targetNames(panel).map((n) => joinPath(panel.path, n));
}
