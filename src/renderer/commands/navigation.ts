import type { FileEntry, OpError } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';
import { sortEntries } from './sort';

type Api = {
  fs: {
    listDir: (path: string, opts: { showHidden: boolean }) =>
      Promise<{ ok: true; value: FileEntry[] } | { ok: false; error: OpError }>;
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

function describeError(e: OpError): string {
  switch (e.kind) {
    case 'not-found':  return `Not found: ${e.path}`;
    case 'permission': return `Permission denied: ${e.path}`;
    case 'unknown':    return e.message;
    default:           return e.kind;
  }
}

async function loadInto(ctx: NavCtx, newPath: string, cursorOnName?: string): Promise<boolean> {
  ctx.setPanel({ loading: true, error: null });
  const r = await ctx.api.fs.listDir(newPath, { showHidden: ctx.panel.showHidden });
  if (!r.ok) {
    ctx.setPanel({ loading: false, error: describeError(r.error) });
    return false;
  }
  const sorted = sortEntries(r.value, ctx.panel.sort);
  // Add synthetic ".." when not at root
  const entries = newPath === '/' ? sorted : [
    { name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false,
      isHidden: false, size: 0, mtime: 0, mode: 0 } as FileEntry,
    ...sorted,
  ];
  let cursor = 0;
  if (cursorOnName) {
    const idx = entries.findIndex((e) => {
      const full = e.ext ? `${e.name}.${e.ext}` : e.name;
      return full === cursorOnName;
    });
    if (idx >= 0) cursor = idx;
  }
  ctx.setPanel({
    path: newPath,
    entries,
    cursor,
    selection: new Set(),
    loading: false,
    error: null,
  });
  return true;
}

function leafOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

export async function navigateInto(ctx: NavCtx) {
  const cur = ctx.panel.entries[ctx.panel.cursor];
  if (!cur) return;
  if (cur.name === '..') {
    const parent = parentOf(ctx.panel.path);
    if (parent) await loadInto(ctx, parent, leafOf(ctx.panel.path));
    return;
  }
  // Directories are split into name+ext too, so always reassemble before
  // building a path — "GoogleDrive-x@gmail.com" lists as name+ext "com".
  const fullName = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
  const full = ctx.panel.path === '/' ? `/${fullName}` : `${ctx.panel.path}/${fullName}`;
  if (cur.isDir) {
    await loadInto(ctx, full);
    return;
  }
  // App bundle or file → open with default app
  await ctx.api.shell.openPath(full);
}

export async function navigateUp(ctx: NavCtx) {
  const parent = parentOf(ctx.panel.path);
  if (!parent) return;
  await loadInto(ctx, parent, leafOf(ctx.panel.path));
}

export async function navigateTo(ctx: NavCtx & { path: string }): Promise<boolean> {
  return loadInto(ctx, ctx.path);
}
