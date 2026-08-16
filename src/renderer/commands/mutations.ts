import type { DialogState, FileEntry } from '@shared/types';
import type { PanelSide, PanelState } from '@renderer/state/panelSlice';
import { entryKey, targetPaths } from '@renderer/state/panelSlice';

const selectionPaths = targetPaths;

export function selectionForContextTarget(panel: PanelState, entry: FileEntry): Set<string> {
  if (entry.name === '..') return new Set();
  const key = entryKey(entry);
  return panel.selection.has(key) ? new Set(panel.selection) : new Set([key]);
}

type SetDialog = (d: DialogState | null) => void;
type TrashResult = { ok: true } | { ok: false; error: unknown };
type Api = { fs: { trash: (p: string[]) => Promise<TrashResult> } };

export function openMkdirDialog(ctx: { side: PanelSide; setDialog: SetDialog }) {
  ctx.setDialog({ kind: 'mkdir', side: ctx.side });
}

export function openRenameDialog(ctx: { side: PanelSide; panel: PanelState; setDialog: SetDialog }) {
  const cur = ctx.panel.entries[ctx.panel.cursor];
  if (!cur || cur.name === '..') return;
  const oldName = cur.ext ? `${cur.name}.${cur.ext}` : cur.name;
  ctx.setDialog({ kind: 'rename', side: ctx.side, oldName });
}

export function openCopyDialog(ctx: { activePath: string; active: PanelState; inactive: PanelState; setDialog: SetDialog }) {
  const sources = selectionPaths(ctx.active);
  if (sources.length === 0) return;
  ctx.setDialog({ kind: 'copy', sources, dstDefault: ctx.inactive.path });
}

export function openMoveDialog(ctx: { active: PanelState; inactive: PanelState; setDialog: SetDialog }) {
  const sources = selectionPaths(ctx.active);
  if (sources.length === 0) return;
  ctx.setDialog({ kind: 'move', sources, dstDefault: ctx.inactive.path });
}

export async function requestTrash(ctx: { panel: PanelState; api: Api; afterDone: () => void }): Promise<TrashResult | null> {
  const paths = selectionPaths(ctx.panel);
  if (paths.length === 0) return null;
  const result = await ctx.api.fs.trash(paths);
  if (result.ok) ctx.afterDone();
  return result;
}

export function requestDeleteConfirm(ctx: { panel: PanelState; setDialog: SetDialog }) {
  const paths = selectionPaths(ctx.panel);
  if (paths.length === 0) return;
  ctx.setDialog({ kind: 'deleteConfirm', paths });
}
