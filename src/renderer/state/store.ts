import { create } from 'zustand';
import type { Volume, DialogState, Favorite } from '@shared/types';
import { initialPanelState, type PanelSide, type PanelState } from './panelSlice';

const DEFAULT_LEFT = '/';
const DEFAULT_RIGHT = '/';

const FAVORITES_KEY = 'gc.favorites';

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

export type AppState = {
  panels: { left: PanelState; right: PanelState };
  activeSide: PanelSide;
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';
  mouseMode: 'windows' | 'tc';
  volumes: Volume[];
  dialog: DialogState | null;
  favorites: Favorite[];
  favoritePickerOpen: boolean;
  quickSearch: { buffer: string; side: PanelSide } | null;
  terminalOpen: boolean;
  /** F3 full-window viewer. Owns the keyboard while open. */
  viewer: { path: string } | null;
  /** Ctrl+Q: the inactive panel mirrors the active panel's cursor as a preview. */
  quickView: boolean;

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
  setViewer: (v: { path: string } | null) => void;
  setQuickView: (open: boolean) => void;
};

export const useStore = create<AppState>((set) => ({
  panels: {
    left: initialPanelState(DEFAULT_LEFT),
    right: initialPanelState(DEFAULT_RIGHT),
  },
  activeSide: 'left',
  theme: 'light',
  effectiveTheme: 'light',
  mouseMode: 'windows',
  volumes: [],
  dialog: null,
  favorites: loadFavorites(),
  favoritePickerOpen: false,
  quickSearch: null,
  terminalOpen: false,
  viewer: null,
  quickView: false,

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
  setViewer: (viewer) => set({ viewer }),
  setQuickView: (quickView) => set({ quickView }),
}));
