import { create } from 'zustand';
import type { Volume, DialogState, Favorite } from '@shared/types';
import { initialPanelState, type PanelSide, type PanelState } from './panelSlice';

const DEFAULT_LEFT = '/';
const DEFAULT_RIGHT = '/';

const FAVORITES_KEY = 'gc.favorites';
const BOOKMARKS_KEY = 'gc.bookmarks';

/** Ctrl+1..9 address these slots; index 0 is slot 1. */
export const BOOKMARK_COUNT = 9;

export type Bookmarks = (string | null)[];

function emptyBookmarks(): Bookmarks {
  return Array.from({ length: BOOKMARK_COUNT }, () => null);
}

function loadBookmarks(): Bookmarks {
  const slots = emptyBookmarks();
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return slots;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return slots;
    for (let i = 0; i < BOOKMARK_COUNT; i++) {
      const v = arr[i];
      if (typeof v === 'string' && v.length > 0) slots[i] = v;
    }
  } catch { /* corrupt storage falls back to empty slots */ }
  return slots;
}

function saveBookmarks(b: Bookmarks): void {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

const COLUMN_WIDTHS_KEY = 'gc.columnWidths';

export type ColumnKey = 'name' | 'ext' | 'size' | 'date';
export type ColumnWidths = Record<ColumnKey, number>;
export type SidedColumnWidths = { left: ColumnWidths; right: ColumnWidths };

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { name: 260, ext: 50, size: 90, date: 130 };
export const COLUMN_WIDTH_MIN = 30;
export const COLUMN_WIDTH_MAX = 800;

function pickWidths(source: unknown): ColumnWidths {
  const pick = (k: ColumnKey): number => {
    const v = (source as Record<string, unknown> | null | undefined)?.[k];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, v))
      : DEFAULT_COLUMN_WIDTHS[k];
  };
  return { name: pick('name'), ext: pick('ext'), size: pick('size'), date: pick('date') };
}

function loadColumnWidths(): SidedColumnWidths {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_KEY);
    if (!raw) return { left: { ...DEFAULT_COLUMN_WIDTHS }, right: { ...DEFAULT_COLUMN_WIDTHS } };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('left' in parsed || 'right' in parsed)) {
      return { left: pickWidths(parsed.left), right: pickWidths(parsed.right) };
    }
    // Migrate legacy flat schema: apply to both sides.
    const flat = pickWidths(parsed);
    return { left: { ...flat }, right: { ...flat } };
  } catch { return { left: { ...DEFAULT_COLUMN_WIDTHS }, right: { ...DEFAULT_COLUMN_WIDTHS } }; }
}

function saveColumnWidths(w: SidedColumnWidths): void {
  try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(w)); } catch { /* ignore */ }
}

function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v): Favorite | null => {
        if (typeof v === 'string') return { path: v };
        if (v && typeof v === 'object' && typeof v.path === 'string') {
          const label = typeof v.label === 'string' && v.label.length > 0 ? v.label : undefined;
          return { path: v.path, ...(label ? { label } : {}) };
        }
        return null;
      })
      .filter((v): v is Favorite => v !== null);
  } catch { return []; }
}

function saveFavorites(fav: Favorite[]): void {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(fav)); } catch { /* ignore */ }
}

/**
 * Tabs are stored as whole panel views. `panels[side]` is the live one and the
 * only copy that mutates; `tabs[side][activeTab[side]]` is its stale twin,
 * refreshed at the moment the user switches away. Keeping `panels` as the live
 * view means every existing reader of the active panel is unchanged by tabs.
 */
/**
 * The F4 editor. There is no view mode here on purpose: viewing belongs to
 * Viewer (F3), which pages through a file rather than holding all of it.
 */
export type EditorState = {
  path: string;
  /** Content as last read or saved; `current !== original` means dirty. */
  original: string;
  current: string;
};

export type AppState = {
  panels: { left: PanelState; right: PanelState };
  tabs: { left: PanelState[]; right: PanelState[] };
  activeTab: { left: number; right: number };
  activeSide: PanelSide;
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';
  mouseMode: 'windows' | 'tc';
  volumes: Volume[];
  dialog: DialogState | null;
  favorites: Favorite[];
  /** Nine numbered slots, independent of the favorites bar. */
  bookmarks: Bookmarks;
  favoritePickerOpen: boolean;
  quickSearch: { buffer: string; side: PanelSide } | null;
  terminalOpen: boolean;
  /** F3 full-window viewer. Owns the keyboard while open. */
  viewer: { path: string } | null;
  /** Ctrl+Q: the inactive panel mirrors the active panel's cursor as a preview. */
  quickView: boolean;
  /** F4 editor. Owns the keyboard while open. */
  editor: EditorState | null;
  /** Per-side column widths in px; persisted across launches. */
  columnWidths: SidedColumnWidths;

  setActive: (side: PanelSide) => void;
  replacePanel: (side: PanelSide, patch: Partial<PanelState>) => void;
  setVolumes: (v: Volume[]) => void;
  setDialog: (d: DialogState | null) => void;
  addFavorite: (path: string, label?: string) => void;
  renameFavorite: (path: string, label: string) => void;
  removeFavorite: (path: string) => void;
  moveFavorite: (from: number, to: number) => void;
  setFavoritePickerOpen: (open: boolean) => void;
  setQuickSearch: (qs: { buffer: string; side: PanelSide } | null) => void;
  setTerminalOpen: (open: boolean) => void;
  /** `slot` is 1-based. Passing null clears it. */
  setBookmark: (slot: number, path: string | null) => void;
  /** Opens a tab beside the current one, showing the same folder, and focuses it. */
  newTab: (side: PanelSide) => void;
  closeTab: (side: PanelSide, index: number) => void;
  selectTab: (side: PanelSide, index: number) => void;
  setViewer: (v: { path: string } | null) => void;
  setQuickView: (open: boolean) => void;
  setEditor: (e: EditorState | null) => void;
  updateEditorContent: (content: string) => void;
  setColumnWidth: (side: PanelSide, col: ColumnKey, width: number) => void;
  resetColumnWidth: (side: PanelSide, col: ColumnKey) => void;
};

const initialPanels = {
  left: initialPanelState(DEFAULT_LEFT),
  right: initialPanelState(DEFAULT_RIGHT),
};

export const useStore = create<AppState>((set) => ({
  panels: initialPanels,
  tabs: { left: [initialPanels.left], right: [initialPanels.right] },
  activeTab: { left: 0, right: 0 },
  activeSide: 'left',
  theme: 'light',
  effectiveTheme: 'light',
  mouseMode: 'windows',
  volumes: [],
  dialog: null,
  favorites: loadFavorites(),
  bookmarks: loadBookmarks(),
  favoritePickerOpen: false,
  quickSearch: null,
  terminalOpen: false,
  viewer: null,
  quickView: false,
  editor: null,
  columnWidths: loadColumnWidths(),

  setActive: (side) => set({ activeSide: side }),
  replacePanel: (side, patch) =>
    set((s) => ({ panels: { ...s.panels, [side]: { ...s.panels[side], ...patch } } })),
  setVolumes: (volumes) => set({ volumes }),
  setDialog: (d) => set({ dialog: d }),
  addFavorite: (path, label) => set((s) => {
    if (s.favorites.some((f) => f.path === path)) return s;
    const fav: Favorite = label ? { path, label } : { path };
    const next = [...s.favorites, fav];
    saveFavorites(next);
    return { favorites: next };
  }),
  renameFavorite: (path, label) => set((s) => {
    const next = s.favorites.map((f) =>
      f.path === path
        ? (label ? { path: f.path, label } : { path: f.path })
        : f,
    );
    saveFavorites(next);
    return { favorites: next };
  }),
  removeFavorite: (path) => set((s) => {
    const next = s.favorites.filter((f) => f.path !== path);
    saveFavorites(next);
    return { favorites: next };
  }),
  moveFavorite: (from, to) => set((s) => {
    if (from === to) return s;
    if (from < 0 || from >= s.favorites.length) return s;
    if (to < 0 || to >= s.favorites.length) return s;
    const next = s.favorites.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveFavorites(next);
    return { favorites: next };
  }),
  setFavoritePickerOpen: (open) => set({ favoritePickerOpen: open }),
  setQuickSearch: (qs) => set({ quickSearch: qs }),
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  setBookmark: (slot, path) => set((s) => {
    if (slot < 1 || slot > BOOKMARK_COUNT) return s;
    const next = s.bookmarks.slice();
    next[slot - 1] = path;
    saveBookmarks(next);
    return { bookmarks: next };
  }),
  newTab: (side) => set((s) => {
    const live = s.panels[side];
    const tabs = s.tabs[side].slice();
    tabs[s.activeTab[side]] = live;
    const index = s.activeTab[side] + 1;
    // Entries are left empty on purpose: the caller navigates the fresh tab,
    // which is what fills them.
    const fresh: PanelState = {
      ...initialPanelState(live.path),
      width: live.width,
      showHidden: live.showHidden,
      sort: live.sort,
    };
    tabs.splice(index, 0, fresh);
    return {
      tabs: { ...s.tabs, [side]: tabs },
      activeTab: { ...s.activeTab, [side]: index },
      panels: { ...s.panels, [side]: fresh },
    };
  }),
  closeTab: (side, index) => set((s) => {
    const tabs = s.tabs[side].slice();
    if (tabs.length <= 1) return s;               // a side always has one tab
    if (index < 0 || index >= tabs.length) return s;
    tabs[s.activeTab[side]] = s.panels[side];
    tabs.splice(index, 1);
    const active = s.activeTab[side];
    const nextActive = index < active ? active - 1 : Math.min(active, tabs.length - 1);
    return {
      tabs: { ...s.tabs, [side]: tabs },
      activeTab: { ...s.activeTab, [side]: nextActive },
      // The splitter position belongs to the side, not to the tab that happened
      // to be showing when it was dragged.
      panels: { ...s.panels, [side]: { ...tabs[nextActive], width: s.panels[side].width } },
    };
  }),
  selectTab: (side, index) => set((s) => {
    if (index < 0 || index >= s.tabs[side].length || index === s.activeTab[side]) return s;
    const tabs = s.tabs[side].slice();
    tabs[s.activeTab[side]] = s.panels[side];
    return {
      tabs: { ...s.tabs, [side]: tabs },
      activeTab: { ...s.activeTab, [side]: index },
      panels: { ...s.panels, [side]: { ...tabs[index], width: s.panels[side].width } },
    };
  }),
  setViewer: (viewer) => set({ viewer }),
  setQuickView: (quickView) => set({ quickView }),
  setEditor: (editor) => set({ editor }),
  updateEditorContent: (content) => set((s) => (
    s.editor ? { editor: { ...s.editor, current: content } } : s
  )),
  setColumnWidth: (side, col, width) => set((s) => {
    const clamped = Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Math.round(width)));
    if (s.columnWidths[side][col] === clamped) return s;
    const next: SidedColumnWidths = {
      ...s.columnWidths,
      [side]: { ...s.columnWidths[side], [col]: clamped },
    };
    saveColumnWidths(next);
    return { columnWidths: next };
  }),
  resetColumnWidth: (side, col) => set((s) => {
    if (s.columnWidths[side][col] === DEFAULT_COLUMN_WIDTHS[col]) return s;
    const next: SidedColumnWidths = {
      ...s.columnWidths,
      [side]: { ...s.columnWidths[side], [col]: DEFAULT_COLUMN_WIDTHS[col] },
    };
    saveColumnWidths(next);
    return { columnWidths: next };
  }),
}));
