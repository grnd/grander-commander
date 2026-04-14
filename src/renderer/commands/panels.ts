import type { PanelState, PanelSide } from '@renderer/state/panelSlice';
import { sortEntries } from './sort';

type StoreLike = {
  get: () => { panels: { left: PanelState; right: PanelState }; activeSide: PanelSide };
  set: (patch: Partial<{ panels: { left: PanelState; right: PanelState }; activeSide: PanelSide }>) => void;
};

export async function swapPanels(ctx: StoreLike) {
  const { panels } = ctx.get();
  ctx.set({ panels: { left: panels.right, right: panels.left } });
}

export async function switchActive(ctx: StoreLike) {
  const { activeSide } = ctx.get();
  ctx.set({ activeSide: activeSide === 'left' ? 'right' : 'left' });
}

type Api = {
  fs: {
    listDir: (p: string, opts: { showHidden: boolean }) =>
      Promise<{ ok: true; value: import('@shared/types').FileEntry[] } | { ok: false; error: unknown }>;
  };
};

export async function sameDirToOther(ctx: StoreLike & { api: Api }) {
  const { panels, activeSide } = ctx.get();
  const active = panels[activeSide];
  const otherSide: PanelSide = activeSide === 'left' ? 'right' : 'left';
  const other = panels[otherSide];
  const r = await ctx.api.fs.listDir(active.path, { showHidden: other.showHidden });
  if (!r.ok) return;
  const sorted = sortEntries(r.value, other.sort);
  const entries = active.path === '/' ? sorted : [
    { name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false,
      isHidden: false, size: 0, mtime: 0, mode: 0 },
    ...sorted,
  ];
  ctx.set({
    panels: {
      ...panels,
      [otherSide]: { ...other, path: active.path, entries, cursor: 0, selection: new Set() },
    },
  });
}
