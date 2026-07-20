import { create } from 'zustand';
import type { Volume, DialogState } from '@shared/types';
import { initialPanelState, type PanelSide, type PanelState } from './panelSlice';

const DEFAULT_LEFT = '/';
const DEFAULT_RIGHT = '/';

const FAVORITES_KEY = 'gc.favorites';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];
  } catch { return []; }
}

function saveFavorites(fav: string[]): void {
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
  favorites: string[];
  favoritePickerOpen: boolean;
  quickSearch: { buffer: string; side: PanelSide } | null;

  setActive: (side: PanelSide) => void;
  replacePanel: (side: PanelSide, patch: Partial<PanelState>) => void;
  setVolumes: (v: Volume[]) => void;
  setDialog: (d: DialogState | null) => void;
  addFavorite: (path: string) => void;
  removeFavorite: (path: string) => void;
  setFavoritePickerOpen: (open: boolean) => void;
  setQuickSearch: (qs: { buffer: string; side: PanelSide } | null) => void;
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

  setActive: (side) => set({ activeSide: side }),
  replacePanel: (side, patch) =>
    set((s) => ({ panels: { ...s.panels, [side]: { ...s.panels[side], ...patch } } })),
  setVolumes: (volumes) => set({ volumes }),
  setDialog: (d) => set({ dialog: d }),
  addFavorite: (path) => set((s) => {
    if (s.favorites.includes(path)) return s;
    const next = [...s.favorites, path];
    saveFavorites(next);
    return { favorites: next };
  }),
  removeFavorite: (path) => set((s) => {
    const next = s.favorites.filter((p) => p !== path);
    saveFavorites(next);
    return { favorites: next };
  }),
  setFavoritePickerOpen: (open) => set({ favoritePickerOpen: open }),
  setQuickSearch: (qs) => set({ quickSearch: qs }),
}));
