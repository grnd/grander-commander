import type { FileEntry, OpError } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';
import { entryPath } from '@renderer/state/panelSlice';
import { sortEntries } from './sort';

/** The synthetic parent row every non-root listing carries. */
export function dotDotEntry(): FileEntry {
  return {
    name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false,
    isHidden: false, size: 0, mtime: 0, mode: 0,
  };
}

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
  requestKey?: string;
};

const latestNavRequest = new Map<string, number>();

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
  const requestKey = ctx.requestKey ?? '__default__';
  const requestId = (latestNavRequest.get(requestKey) ?? 0) + 1;
  latestNavRequest.set(requestKey, requestId);
  ctx.setPanel({ loading: true, error: null });
  const r = await ctx.api.fs.listDir(newPath, { showHidden: ctx.panel.showHidden });
  if (latestNavRequest.get(requestKey) !== requestId) return false;
  if (!r.ok) {
    ctx.setPanel({ loading: false, error: describeError(r.error) });
    return false;
  }
  const sorted = sortEntries(r.value, ctx.panel.sort);
  // Add synthetic ".." when not at root
  const entries = newPath === '/' ? sorted : [dotDotEntry(), ...sorted];
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
    // Any successful listing lands the panel back on the real filesystem, which
    // is how a virtual panel is left: type a path, or press Backspace.
    source: { kind: 'fs' },
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

/** Where ".." and Backspace lead out of a virtual panel. */
function exitOf(panel: PanelState): string | null {
  if (panel.source.kind === 'search') return panel.source.roots[0] ?? '/';
  return parentOf(panel.path);
}

export async function navigateInto(ctx: NavCtx) {
  const cur = ctx.panel.entries[ctx.panel.cursor];
  if (!cur) return;
  if (cur.name === '..') {
    const exit = exitOf(ctx.panel);
    if (!exit) return;
    // Only a real listing has a leaf worth putting the cursor back on.
    const cursorOn = ctx.panel.source.kind === 'fs' ? leafOf(ctx.panel.path) : undefined;
    await loadInto(ctx, exit, cursorOn);
    return;
  }
  // Directories are split into name+ext too, so always reassemble before
  // building a path — "GoogleDrive-x@gmail.com" lists as name+ext "com".
  // Search rows carry their own absolute location instead.
  const full = entryPath(ctx.panel, cur);
  if (cur.isDir) {
    await loadInto(ctx, full);
    return;
  }
  // App bundle or file → open with default app
  await ctx.api.shell.openPath(full);
}

export async function navigateUp(ctx: NavCtx) {
  const exit = exitOf(ctx.panel);
  if (!exit) return;
  const cursorOn = ctx.panel.source.kind === 'fs' ? leafOf(ctx.panel.path) : undefined;
  await loadInto(ctx, exit, cursorOn);
}

/** Show `full`'s containing folder with the cursor parked on it. */
export async function revealPath(ctx: NavCtx, full: string): Promise<boolean> {
  const parent = parentOf(full);
  if (!parent) return false;
  return loadInto(ctx, parent, leafOf(full));
}

/**
 * Install search results as a virtual listing. The panel keeps rendering like
 * any other, but its rows come from many directories, so each one carries its
 * own absolute path.
 */
export function showSearchResults(
  ctx: { panel: PanelState; setPanel: (patch: Partial<PanelState>) => void },
  opts: { label: string; roots: string[]; entries: FileEntry[] },
): void {
  const sorted = sortEntries(opts.entries, ctx.panel.sort);
  ctx.setPanel({
    path: opts.label,
    source: { kind: 'search', label: opts.label, roots: opts.roots },
    entries: [dotDotEntry(), ...sorted],
    cursor: sorted.length > 0 ? 1 : 0,
    selection: new Set(),
    loading: false,
    error: null,
  });
}

export async function navigateTo(ctx: NavCtx & { path: string }): Promise<boolean> {
  return loadInto(ctx, ctx.path);
}
