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
  /** Entries this action cannot carry out, and why. */
  skipped: { relPath: string; reason: string }[];
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

  const chosen = entries.filter((e) => !selected || selected.has(e.relPath));

  // Pass 1 — what each entry asks for on its own.
  const wantsCopy = new Set<string>();
  const deletes: string[] = [];
  for (const e of chosen) {
    if (e.status === sourceOnly) { wantsCopy.add(e.relPath); continue; }
    if (!mirror) continue;
    if (e.status === destOnly) { deletes.push(joinRel(dstRoot, e.relPath)); continue; }
    if (e.status === 'differ') {
      // Folder-vs-file cannot be overwritten in place; clear it out first.
      if (e.typeConflict) deletes.push(joinRel(dstRoot, e.relPath));
      wantsCopy.add(e.relPath);
    }
  }

  // Pass 2 — reconcile entries against each other.
  //
  // A directory copy carries its whole subtree, so a child planned separately
  // is redundant work that can also race the parent.
  //
  // A type conflict this action is *not* resolving leaves a file sitting where
  // a child's parent directory would have to be. Copying into it fails with
  // ENOTDIR partway through the run, so those are refused up front and
  // reported instead.
  const copiedDirs = entries
    .filter((e) => e.isDir && wantsCopy.has(e.relPath))
    .map((e) => e.relPath);
  const unresolvedConflicts = entries
    .filter((e) => e.typeConflict && !wantsCopy.has(e.relPath))
    .map((e) => e.relPath);
  const isUnder = (rel: string, roots: readonly string[]) =>
    roots.some((root) => rel.startsWith(`${root}/`));

  const copies: SyncPlan['copies'] = [];
  const skipped: SyncPlan['skipped'] = [];
  for (const e of chosen) {
    if (!wantsCopy.has(e.relPath)) continue;
    if (isUnder(e.relPath, copiedDirs)) continue;
    if (isUnder(e.relPath, unresolvedConflicts)) {
      skipped.push({
        relPath: e.relPath,
        reason: 'a folder/file conflict above it has to be resolved first',
      });
      continue;
    }
    copies.push({
      src: joinRel(srcRoot, e.relPath),
      dst: joinRel(dstRoot, e.relPath),
      relPath: e.relPath,
    });
  }

  // Deleting a folder takes its contents with it, so a descendant scheduled
  // separately would be gone by the time its turn came. That second delete
  // fails with ENOENT and aborts the run — after the folder is destroyed and
  // before its replacement is copied.
  const deletedRoots = deletes.map(fromRoot(dstRoot));
  const prunedDeletes = deletes.filter((path) => !isUnder(fromRoot(dstRoot)(path), deletedRoots));

  return { copies, deletes: prunedDeletes, skipped };
}

/** Strip the destination root back off a full path, for ancestor comparisons. */
function fromRoot(root: string): (path: string) => string {
  const prefix = root === '/' ? '/' : `${root}/`;
  return (path) => (path.startsWith(prefix) ? path.slice(prefix.length) : path);
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
