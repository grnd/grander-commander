// src/renderer/state/store.ts
import { create } from 'zustand';
import type { Volume } from '@shared/types';
import { initialPanelState, type PanelSide, type PanelState } from './panelSlice';

// Seed paths; real home comes from main at startup via gc.volumes.list(), at
// which point App.tsx calls navigateTo() for both panels. Renderer has no
// access to node `os`, so we can't read HOME here.
const DEFAULT_LEFT = '/';
const DEFAULT_RIGHT = '/';

export type AppState = {
  panels: { left: PanelState; right: PanelState };
  activeSide: PanelSide;
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';
  mouseMode: 'windows' | 'tc';
  volumes: Volume[];

  setActive: (side: PanelSide) => void;
  replacePanel: (side: PanelSide, patch: Partial<PanelState>) => void;
  setVolumes: (v: Volume[]) => void;
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

  setActive: (side) => set({ activeSide: side }),
  replacePanel: (side, patch) =>
    set((s) => ({ panels: { ...s.panels, [side]: { ...s.panels[side], ...patch } } })),
  setVolumes: (volumes) => set({ volumes }),
}));
