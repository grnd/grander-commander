import { create } from 'zustand';
import type { Volume, DialogState } from '@shared/types';
import { initialPanelState, type PanelSide, type PanelState } from './panelSlice';

const DEFAULT_LEFT = '/';
const DEFAULT_RIGHT = '/';

export type AppState = {
  panels: { left: PanelState; right: PanelState };
  activeSide: PanelSide;
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';
  mouseMode: 'windows' | 'tc';
  volumes: Volume[];
  dialog: DialogState | null;

  setActive: (side: PanelSide) => void;
  replacePanel: (side: PanelSide, patch: Partial<PanelState>) => void;
  setVolumes: (v: Volume[]) => void;
  setDialog: (d: DialogState | null) => void;
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

  setActive: (side) => set({ activeSide: side }),
  replacePanel: (side, patch) =>
    set((s) => ({ panels: { ...s.panels, [side]: { ...s.panels[side], ...patch } } })),
  setVolumes: (volumes) => set({ volumes }),
  setDialog: (d) => set({ dialog: d }),
}));
