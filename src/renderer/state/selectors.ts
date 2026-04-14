// src/renderer/state/selectors.ts
import type { AppState } from './store';
import type { PanelSide, PanelState } from './panelSlice';

export const activePanel = (s: AppState): PanelState => s.panels[s.activeSide];
export const inactiveSide = (s: AppState): PanelSide => (s.activeSide === 'left' ? 'right' : 'left');
export const inactivePanel = (s: AppState): PanelState => s.panels[inactiveSide(s)];
