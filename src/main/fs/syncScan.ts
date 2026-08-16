// src/main/fs/syncScan.ts
import { createReadStream } from 'node:fs';
import { lstat, readdir, stat as statFollow } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Result, SyncEntry, SyncOptions, SyncScan } from '@shared/types';
import { NOISE_FILENAMES } from '@shared/types';
import { mapFsError } from './errors';

/** Enough for a source tree; past this the list stops being usable anyway. */
export const MAX_SYNC_ENTRIES = 50_000;
export const MAX_SYNC_DEPTH = 64;
/** Beyond this, hashing to answer "are these the same?" costs more than it's worth. */
export const MAX_HASH_BYTES = 256 * 1024 * 1024;

/**
 * FAT and many network filesystems store mtimes at two-second granularity, so a
 * faithfully copied file can come back off one by up to two seconds. Treating
 * that as a difference would mark half a tree as changed after every sync.
 */
export const MTIME_TOLERANCE_MS = 2000;

type Node = { isDir: boolean; isLink: boolean; size: number; mtime: number };

async function walk(
  root: string,
  opts: SyncOptions,
  into: Map<string, Node>,
  /** Paths the scan could not read. Mirroring is refused while this is non-empty. */
  unreadable: string[],
): Promise<void> {
  const stack: { dir: string; rel: string; depth: number }[] = [{ dir: root, rel: '', depth: 0 }];

  while (stack.length > 0) {
    const { dir, rel, depth } = stack.pop() as { dir: string; rel: string; depth: number };
    if (depth > MAX_SYNC_DEPTH) { unreadable.push(dir); continue; }
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      // An unreadable subtree used to be reported as simply absent, which made
      // Mirror trash the *other* side's perfectly good copies of files it could
      // not see. It is recorded instead, and blocks the destructive actions.
      unreadable.push(dir);
      continue;
    }
    for (const name of names) {
      if (into.size >= MAX_SYNC_ENTRIES) { unreadable.push(dir); return; }
      if (NOISE_FILENAMES.has(name)) continue;
      if (!opts.showHidden && name.startsWith('.')) continue;

      const full = join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = await lstat(full);
      } catch {
        unreadable.push(full);
        continue;
      }
      const isLink = st.isSymbolicLink();
      let isDir = st.isDirectory();
      if (isLink) {
        // Match listDir: follow the link, and treat a broken one as a file.
        try { isDir = (await statFollow(full)).isDirectory(); } catch { isDir = false; }
      }
      into.set(childRel, { isDir, isLink, size: st.size, mtime: st.mtimeMs });
      // Never descend a symlinked directory. Following one takes the scan
      // outside the folder the user chose, and Mirror would then copy into and
      // delete out of wherever it points. The link itself is still compared and
      // can be copied as a link.
      if (isDir && !isLink && opts.recursive) {
        stack.push({ dir: full, rel: childRel, depth: depth + 1 });
      }
    }
  }
}

async function sha256(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (c) => hash.update(c));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', () => resolve(null));
  });
}

async function sameContent(left: string, right: string, size: number): Promise<boolean | null> {
  if (size > MAX_HASH_BYTES) return null;
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  if (a === null || b === null) return null;
  return a === b;
}

/**
 * Compare two trees and classify every relative path. A directory that exists
 * on only one side is reported as a single entry and is *not* descended into:
 * copying it brings the whole subtree, and listing thousands of implied
 * children buries the differences that matter.
 */
export async function syncScan(
  leftRoot: string,
  rightRoot: string,
  opts: SyncOptions,
): Promise<Result<SyncScan>> {
  for (const root of [leftRoot, rightRoot]) {
    try {
      const st = await statFollow(root);
      if (!st.isDirectory()) {
        return { ok: false, error: { kind: 'name-invalid', reason: `${root} is not a folder` } };
      }
    } catch (err) {
      return { ok: false, error: mapFsError(err, root) };
    }
  }

  const left = new Map<string, Node>();
  const right = new Map<string, Node>();
  const unreadable: string[] = [];
  await Promise.all([
    walk(leftRoot, opts, left, unreadable),
    walk(rightRoot, opts, right, unreadable),
  ]);

  // A one-sided directory's children are implied by the directory itself.
  const oneSidedDirs = (own: Map<string, Node>, other: Map<string, Node>): Set<string> => {
    const roots = new Set<string>();
    for (const [rel, node] of own) {
      if (node.isDir && !other.has(rel)) roots.add(rel);
    }
    return roots;
  };
  const prunedLeft = oneSidedDirs(left, right);
  const prunedRight = oneSidedDirs(right, left);
  const isUnderPruned = (rel: string, pruned: Set<string>): boolean => {
    for (const root of pruned) {
      if (rel.startsWith(`${root}/`)) return true;
    }
    return false;
  };

  const rels = new Set<string>([...left.keys(), ...right.keys()]);
  const entries: SyncEntry[] = [];

  for (const rel of rels) {
    const l = left.get(rel) ?? null;
    const r = right.get(rel) ?? null;
    if (l && !r && isUnderPruned(rel, prunedLeft)) continue;
    if (r && !l && isUnderPruned(rel, prunedRight)) continue;

    const isDir = (l?.isDir ?? r?.isDir) === true;
    const base = {
      relPath: rel,
      isDir,
      isLink: (l?.isLink ?? false) || (r?.isLink ?? false),
      leftSize: l ? l.size : null,
      rightSize: r ? r.size : null,
      leftMtime: l ? l.mtime : null,
      rightMtime: r ? r.mtime : null,
    };

    if (l && !r) { entries.push({ ...base, status: 'left-only', newer: null, typeConflict: false }); continue; }
    if (r && !l) { entries.push({ ...base, status: 'right-only', newer: null, typeConflict: false }); continue; }
    if (!l || !r) continue;

    // A path that is a folder on one side and a file on the other is a real
    // conflict, not a content difference.
    if (l.isDir !== r.isDir) {
      entries.push({ ...base, status: 'differ', newer: null, typeConflict: true });
      continue;
    }
    if (isDir) { entries.push({ ...base, status: 'same', newer: null, typeConflict: false }); continue; }

    let differs: boolean;
    if (l.size !== r.size) {
      differs = true;
    } else if (opts.byContent) {
      const same = await sameContent(join(leftRoot, rel), join(rightRoot, rel), l.size);
      differs = same === null ? Math.abs(l.mtime - r.mtime) > MTIME_TOLERANCE_MS : !same;
    } else {
      differs = Math.abs(l.mtime - r.mtime) > MTIME_TOLERANCE_MS;
    }

    entries.push({
      ...base,
      status: differs ? 'differ' : 'same',
      newer: differs ? (l.mtime > r.mtime ? 'left' : r.mtime > l.mtime ? 'right' : null) : null,
      typeConflict: false,
    });
  }

  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { ok: true, value: { entries, unreadable } };
}
