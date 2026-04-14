import type { FileEntry } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';
import { sortEntries } from './sort';

type Api = {
  fs: {
    listDir: (path: string, opts: { showHidden: boolean }) =>
      Promise<{ ok: true; value: FileEntry[] } | { ok: false; error: unknown }>;
  };
  shell: { openPath: (path: string) => Promise<void> };
};

export type NavCtx = {
  panel: PanelState;
  setPanel: (patch: Partial<PanelState>) => void;
  api: Api;
};

export async function cursorMove(ctx: Omit<NavCtx, 'api'> & { delta: number }) {
  const next = Math.max(0, Math.min(ctx.panel.entries.length - 1, ctx.panel.cursor + ctx.delta));
  ctx.setPanel({ cursor: next });
}

export async function cursorTo(ctx: Omit<NavCtx, 'api'> & { index: number }) {
  const next = Math.max(0, Math.min(ctx.panel.entries.length - 1, ctx.index));
  ctx.setPanel({ cursor: next });
}

function parentOf(path: string): string | null {
  if (path === '/') return null;
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return '/';
  return path.slice(0, idx);
}

async function loadInto(ctx: NavCtx, newPath: string) {
  ctx.setPanel({ loading: true, error: null });
  const r = await ctx.api.fs.listDir(newPath, { showHidden: ctx.panel.showHidden });
  if (!r.ok) {
    ctx.setPanel({ loading: false, error: String((r as { error: unknown }).error) });
    return;
  }
  const sorted = sortEntries(r.value, ctx.panel.sort);
  // Add synthetic ".." when not at root
  const entries = newPath === '/' ? sorted : [
    { name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false,
      isHidden: false, size: 0, mtime: 0, mode: 0 } as FileEntry,
    ...sorted,
  ];
  ctx.setPanel({
    path: newPath,
    entries,
    cursor: 0,
    selection: new Set(),
    loading: false,
    error: null,
  });
}

export async function navigateInto(ctx: NavCtx) {
  const cur = ctx.panel.entries[ctx.panel.cursor];
  if (!cur) return;
  if (cur.name === '..') {
    const parent = parentOf(ctx.panel.path);
    if (parent) await loadInto(ctx, parent);
    return;
  }
  if (cur.isDir) {
    const joined = ctx.panel.path === '/' ? `/${cur.name}` : `${ctx.panel.path}/${cur.name}`;
    await loadInto(ctx, joined);
    return;
  }
  // App bundle or file → open with default app
  const fullName = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
  const full = ctx.panel.path === '/' ? `/${fullName}` : `${ctx.panel.path}/${fullName}`;
  await ctx.api.shell.openPath(full);
}

export async function navigateUp(ctx: NavCtx) {
  const parent = parentOf(ctx.panel.path);
  if (!parent) return;
  await loadInto(ctx, parent);
}

export async function navigateTo(ctx: NavCtx & { path: string }) {
  await loadInto(ctx, ctx.path);
}
