import { entryKey, type PanelState } from '@renderer/state/panelSlice';

type Ctx = { panel: PanelState; setPanel: (patch: Partial<PanelState>) => void };

export async function toggleMark(ctx: Ctx) {
  const cur = ctx.panel.entries[ctx.panel.cursor];
  if (!cur || cur.name === '..') return;
  const key = entryKey(cur);
  const sel = new Set(ctx.panel.selection);
  if (sel.has(key)) sel.delete(key); else sel.add(key);
  ctx.setPanel({ selection: sel });
}

export async function selectAll(ctx: Ctx) {
  const sel = new Set<string>();
  for (const e of ctx.panel.entries) {
    if (e.name === '..') continue;
    sel.add(entryKey(e));
  }
  ctx.setPanel({ selection: sel });
}

export async function clearSelection(ctx: Ctx) {
  ctx.setPanel({ selection: new Set() });
}

export async function rangeSelect(ctx: Ctx & { toIndex: number }) {
  const sel = new Set(ctx.panel.selection);
  const lo = Math.min(ctx.panel.cursor, ctx.toIndex);
  const hi = Math.max(ctx.panel.cursor, ctx.toIndex);
  for (let i = lo; i <= hi; i++) {
    const e = ctx.panel.entries[i];
    if (!e || e.name === '..') continue;
    sel.add(entryKey(e));
  }
  ctx.setPanel({ selection: sel, cursor: ctx.toIndex });
}
