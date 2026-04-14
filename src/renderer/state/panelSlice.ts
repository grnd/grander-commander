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
