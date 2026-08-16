import type { ArchiveEntry, FileEntry, OpError } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';
import { entryPath } from '@renderer/state/panelSlice';
import { sortEntries } from './sort';
import { archiveChildren, archiveLabel, innerJoin, innerParent, normaliseInner } from './archive';

/** The synthetic parent row every non-root listing carries. */
export function dotDotEntry(): FileEntry {
  return {
    name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false,
    isHidden: false, size: 0, mtime: 0, mode: 0,
  };
}

type ApiResult<T> = { ok: true; value: T } | { ok: false; error: OpError };

type Api = {
  fs: {
    listDir: (path: string, opts: { showHidden: boolean }) => Promise<ApiResult<FileEntry[]>>;
  };
  shell: { openPath: (path: string) => Promise<void> };
  archive?: {
    list: (archivePath: string) => Promise<ApiResult<ArchiveEntry[]>>;
    extractToTemp: (archivePath: string, member: string) => Promise<ApiResult<string>>;
  };
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

async function loadInto(
  ctx: NavCtx,
  newPath: string,
  cursorOnName?: string,
  /**
   * Where to leave the cursor when `cursorOnName` is gone from the listing.
   * A refresh after a delete or a move wants the row that took its place, not
   * the top of the panel.
   */
  fallbackIndex?: number,
): Promise<boolean> {
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
  const clamp = (i: number) => Math.max(0, Math.min(i, entries.length - 1));
  let cursor = 0;
  const named = cursorOnName
    ? entries.findIndex((e) => (e.ext ? `${e.name}.${e.ext}` : e.name) === cursorOnName)
    : -1;
  if (named >= 0) cursor = named;
  else if (fallbackIndex !== undefined) cursor = clamp(fallbackIndex);
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

  const source = ctx.panel.source;
  if (source.kind === 'archive') {
    const key = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
    if (cur.name === '..') {
      const inner = normaliseInner(source.innerPath);
      // At the archive root, ".." leaves the archive entirely and lands on it
      // in its own folder.
      if (inner === '') { await revealPath(ctx, source.archivePath); return; }
      await openArchive(ctx, source.archivePath, innerParent(inner));
      return;
    }
    if (cur.isDir) {
      await openArchive(ctx, source.archivePath, innerJoin(source.innerPath, key));
      return;
    }
    // A file inside an archive has no path on disk; give it one, then open it.
    const member = innerJoin(source.innerPath, key);
    const extracted = await ctx.api.archive?.extractToTemp(source.archivePath, member);
    if (extracted?.ok) await ctx.api.shell.openPath(extracted.value);
    else if (extracted) ctx.setPanel({ error: describeError(extracted.error) });
    return;
  }

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
  // An archive opens as a listing rather than in whatever app claims .zip —
  // travelling inside it without extracting is the whole point.
  if (ctx.api.archive && isKnownArchive(full)) {
    const opened = await openArchive(ctx, full, '');
    if (opened) return;
  }
  // App bundle or file → open with default app
  await ctx.api.shell.openPath(full);
}

const ARCHIVE_SUFFIXES = [
  '.tar.gz', '.tar.bz2', '.tar.xz', '.tgz', '.tbz', '.tbz2', '.txz',
  '.tar', '.zip', '.jar', '.7z',
];

/** Mirror of the main-side check, so Enter does not need a round trip first. */
export function isKnownArchive(path: string): boolean {
  const lower = path.toLowerCase();
  return ARCHIVE_SUFFIXES.some((s) => lower.endsWith(s));
}

/**
 * List an archive (or one folder inside it) into the panel. Returns false when
 * the archive could not be read, so the caller can fall back to opening the
 * file with its default app.
 */
export async function openArchive(ctx: NavCtx, archivePath: string, innerPath: string): Promise<boolean> {
  if (!ctx.api.archive) return false;
  ctx.setPanel({ loading: true, error: null });
  const r = await ctx.api.archive.list(archivePath);
  if (!r.ok) {
    ctx.setPanel({ loading: false, error: describeError(r.error) });
    return false;
  }
  const inner = normaliseInner(innerPath);
  const children = archiveChildren(r.value, inner);
  const sorted = sortEntries(children, ctx.panel.sort);
  ctx.setPanel({
    path: archiveLabel(archivePath, inner),
    source: { kind: 'archive', archivePath, innerPath: inner },
    entries: [dotDotEntry(), ...sorted],
    cursor: sorted.length > 0 ? 1 : 0,
    selection: new Set(),
    loading: false,
    error: null,
  });
  return true;
}

export async function navigateUp(ctx: NavCtx) {
  const source = ctx.panel.source;
  if (source.kind === 'archive') {
    const inner = normaliseInner(source.innerPath);
    if (inner === '') { await revealPath(ctx, source.archivePath); return; }
    await openArchive(ctx, source.archivePath, innerParent(inner));
    return;
  }
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

/**
 * Re-list the folder a panel is already showing, keeping the cursor where the
 * user left it.
 *
 * The row it was on is found by name, so a copy leaves the cursor on the same
 * file. When that row is gone — after a delete or a move — the cursor holds its
 * *index* instead, which lands it on whatever moved up into that slot. Both are
 * what a file manager should do; resetting to ".." is what it should never do.
 */
export async function refreshPanel(ctx: NavCtx): Promise<boolean> {
  const current = ctx.panel.entries[ctx.panel.cursor];
  const key = current && current.name !== '..'
    ? (current.ext ? `${current.name}.${current.ext}` : current.name)
    : undefined;
  return loadInto(ctx, ctx.panel.path, key, ctx.panel.cursor);
}
