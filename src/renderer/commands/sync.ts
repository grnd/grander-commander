// src/renderer/commands/sync.ts
//
// Turning a folder comparison into an executable plan. Pure, because the counts
// shown on the buttons must be exactly what the buttons then do.

import type { SyncEntry } from '@shared/types';

export type SyncAction =
  | 'copy-missing-right'
  | 'copy-missing-left'
  | 'mirror-right'
  | 'mirror-left';

export type SyncPlan = {
  copies: { src: string; dst: string; relPath: string }[];
  /** Full paths to move to Trash. Applied before the copies. */
  deletes: string[];
};

function joinRel(root: string, rel: string): string {
  return root === '/' ? `/${rel}` : `${root}/${rel}`;
}

export const SYNC_LABELS: Record<SyncAction, string> = {
  'copy-missing-right': 'Copy missing →',
  'copy-missing-left': '← Copy missing',
  'mirror-right': 'Mirror →',
  'mirror-left': '← Mirror',
};

/** Mirroring deletes; the caller must confirm before running one of these. */
export function isDestructive(action: SyncAction): boolean {
  return action === 'mirror-right' || action === 'mirror-left';
}

/**
 * Build the copy/delete list for `action`.
 *
 * `selected` restricts the plan to those relative paths; pass null to use every
 * entry. Copy-missing only ever adds files. Mirror makes the destination match
 * the source exactly, which means overwriting differences and trashing whatever
 * the source does not have.
 *
 * A path that is a folder on one side and a file on the other cannot simply be
 * overwritten, so mirroring trashes the destination first and copies after.
 */
export function buildSyncPlan(
  entries: readonly SyncEntry[],
  leftRoot: string,
  rightRoot: string,
  action: SyncAction,
  selected: ReadonlySet<string> | null = null,
): SyncPlan {
  const toRight = action === 'copy-missing-right' || action === 'mirror-right';
  const mirror = isDestructive(action);
  const srcRoot = toRight ? leftRoot : rightRoot;
  const dstRoot = toRight ? rightRoot : leftRoot;
  const sourceOnly = toRight ? 'left-only' : 'right-only';
  const destOnly = toRight ? 'right-only' : 'left-only';

  const copies: SyncPlan['copies'] = [];
  const deletes: string[] = [];

  for (const e of entries) {
    if (selected && !selected.has(e.relPath)) continue;
    const src = joinRel(srcRoot, e.relPath);
    const dst = joinRel(dstRoot, e.relPath);

    if (e.status === sourceOnly) { copies.push({ src, dst, relPath: e.relPath }); continue; }
    if (!mirror) continue;
    if (e.status === destOnly) { deletes.push(dst); continue; }
    if (e.status === 'differ') {
      // Folder-vs-file cannot be overwritten in place; clear it out first.
      if (e.typeConflict) deletes.push(dst);
      copies.push({ src, dst, relPath: e.relPath });
    }
  }

  return { copies, deletes };
}

/** Rows an action would touch, for the count on its button. */
export function countFor(
  entries: readonly SyncEntry[],
  leftRoot: string,
  rightRoot: string,
  action: SyncAction,
  selected: ReadonlySet<string> | null = null,
): { copies: number; deletes: number } {
  const plan = buildSyncPlan(entries, leftRoot, rightRoot, action, selected);
  return { copies: plan.copies.length, deletes: plan.deletes.length };
}
