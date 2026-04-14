import type { DialogState } from '@shared/types';
import type { PanelSide, PanelState } from '@renderer/state/panelSlice';
import { entryKey } from '@renderer/state/panelSlice';

const pathOf = (panel: PanelState, name: string) =>
  panel.path === '/' ? `/${name}` : `${panel.path}/${name}`;

function selectionPaths(panel: PanelState): string[] {
  const keys = panel.selection.size > 0
    ? [...panel.selection]
    : (() => {
        const cur = panel.entries[panel.cursor];
        if (!cur || cur.name === '..') return [];
        return [entryKey(cur)];
      })();
  return keys.map((k) => pathOf(panel, k));
}

type SetDialog = (d: DialogState | null) => void;
type Api = { fs: { trash: (p: string[]) => Promise<{ ok: true } | { ok: false; error: unknown }> } };

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

export async function requestTrash(ctx: { panel: PanelState; api: Api; afterDone: () => void }) {
  const paths = selectionPaths(ctx.panel);
  if (paths.length === 0) return;
  await ctx.api.fs.trash(paths);
  ctx.afterDone();
}

export function requestDeleteConfirm(ctx: { panel: PanelState; setDialog: SetDialog }) {
  const paths = selectionPaths(ctx.panel);
  if (paths.length === 0) return;
  ctx.setDialog({ kind: 'deleteConfirm', paths });
}
