import type { FileEntry } from '@shared/types';
import { entryKey, type PanelState } from '@renderer/state/panelSlice';
import type { NavCtx } from './navigation';
import { sortEntries } from './sort';

export type SilentRefreshCtx = NavCtx & { getPanel: () => PanelState };

const DOTDOT: FileEntry = {
  name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 0, mtime: 0, mode: 0,
};

export async function silentRefresh(ctx: SilentRefreshCtx): Promise<void> {
  const before = ctx.getPanel();
  const path = before.path;
  const cursorKey = before.entries[before.cursor]
    ? entryKey(before.entries[before.cursor])
    : null;

  const r = await ctx.api.fs.listDir(path, { showHidden: before.showHidden });

  const after = ctx.getPanel();
  if (after.path !== path) return; // navigated away mid-fetch

  if (!r.ok) {
    ctx.setPanel({ error: String((r as { error: unknown }).error) });
    return;
  }

  const sorted = sortEntries(r.value, after.sort);
  const entries = path === '/' ? sorted : [DOTDOT, ...sorted];

  let cursor = after.cursor;
  if (cursorKey) {
    const idx = entries.findIndex((e) => entryKey(e) === cursorKey);
    cursor = idx >= 0 ? idx : Math.max(0, Math.min(entries.length - 1, after.cursor));
  } else {
    cursor = Math.max(0, Math.min(entries.length - 1, after.cursor));
  }

  const keys = new Set(entries.map(entryKey));
  const selection = new Set([...after.selection].filter((k) => keys.has(k)));

  ctx.setPanel({ entries, cursor, selection, error: null });
}
