// src/main/fs/search.ts
import { readFile } from 'node:fs/promises';
import { lstat, readdir, stat as statFollow } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { FileEntry, Result, SearchOutcome, SearchQuery } from '@shared/types';
import { NOISE_FILENAMES } from '@shared/types';
import { decodeText, isProbablyBinary } from '@shared/text';
import { nameMatcher } from './glob';
import { mapFsError } from './errors';

export const MAX_SEARCH_RESULTS = 5000;
export const MAX_SEARCH_DEPTH = 64;
/** Stop walking after this long so a search of `/` cannot hang the UI. */
export const SEARCH_TIME_BUDGET_MS = 30_000;
/** Files bigger than this are matched by name only; grepping them is not worth it. */
export const MAX_CONTENT_BYTES = 8 * 1024 * 1024;

const controllers = new Map<string, AbortController>();

export function cancelSearch(token: string): void {
  controllers.get(token)?.abort();
}

function contentMatcher(q: SearchQuery): ((text: string) => boolean) | null {
  if (q.contentPattern === '') return null;
  const flags = q.caseSensitive ? '' : 'i';
  if (q.contentIsRegex) {
    try {
      const re = new RegExp(q.contentPattern, flags);
      return (text) => re.test(text);
    } catch {
      return () => false;
    }
  }
  const needle = q.caseSensitive ? q.contentPattern : q.contentPattern.toLowerCase();
  return (text) => (q.caseSensitive ? text : text.toLowerCase()).includes(needle);
}

/**
 * Turn an absolute hit into a row. The name carries the path *relative to the
 * search root* so the results panel reads as a listing rather than a column of
 * identical basenames, and `srcPath` keeps the real location for every
 * subsequent operation.
 */
function toEntry(root: string, full: string, st: import('node:fs').Stats, isDir: boolean): FileEntry {
  const rel = relative(root, full) || full;
  const dotIdx = rel.lastIndexOf('.');
  const slashIdx = rel.lastIndexOf('/');
  const hasExt = dotIdx > slashIdx + 1 && dotIdx > 0;
  const base = rel.slice(slashIdx + 1);
  return {
    name: hasExt ? rel.slice(0, dotIdx) : rel,
    ext: hasExt ? rel.slice(dotIdx + 1) : '',
    isDir,
    isSymlink: st.isSymbolicLink(),
    isAppBundle: isDir && rel.endsWith('.app'),
    isHidden: base.startsWith('.'),
    size: st.size,
    mtime: st.mtimeMs,
    mode: st.mode,
    srcPath: full,
  };
}

export async function search(token: string, q: SearchQuery): Promise<Result<SearchOutcome>> {
  // Registered before the first await, so a Stop that lands while the roots are
  // still being validated is not lost.
  const controller = new AbortController();
  controllers.set(token, controller);

  if (q.roots.length === 0) {
    controllers.delete(token);
    return { ok: false, error: { kind: 'name-invalid', reason: 'no folder to search' } };
  }
  for (const root of q.roots) {
    try {
      const st = await statFollow(root);
      if (!st.isDirectory()) {
        controllers.delete(token);
        return { ok: false, error: { kind: 'name-invalid', reason: `${root} is not a folder` } };
      }
    } catch (err) {
      controllers.delete(token);
      return { ok: false, error: mapFsError(err, root) };
    }
  }

  const matchesName = nameMatcher(q.namePattern, q.nameIsRegex, q.caseSensitive);
  const matchesContent = contentMatcher(q);
  const deadline = Date.now() + SEARCH_TIME_BUDGET_MS;

  const entries: FileEntry[] = [];
  let scanned = 0;
  let truncated = false;

  try {
    for (const root of q.roots) {
      const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
      while (stack.length > 0) {
        if (controller.signal.aborted) break;
        if (entries.length >= MAX_SEARCH_RESULTS || Date.now() > deadline) { truncated = true; break; }
        const { dir, depth } = stack.pop() as { dir: string; depth: number };
        if (depth > MAX_SEARCH_DEPTH) continue;

        let names: string[];
        try {
          names = await readdir(dir);
        } catch {
          // Unreadable subtrees are skipped, not fatal: searching a home
          // directory always crosses a few of them.
          continue;
        }

        for (const name of names) {
          if (controller.signal.aborted) break;
          if (entries.length >= MAX_SEARCH_RESULTS || Date.now() > deadline) { truncated = true; break; }
          if (NOISE_FILENAMES.has(name)) continue;
          if (!q.showHidden && name.startsWith('.')) continue;

          const full = join(dir, name);
          let st;
          try {
            st = await lstat(full);
          } catch {
            continue;
          }
          scanned++;

          let isDir = st.isDirectory();
          if (st.isSymbolicLink()) {
            // Follow to classify, but never descend: a symlink loop would walk
            // forever, and the target is reachable through its real parent.
            try { isDir = (await statFollow(full)).isDirectory(); } catch { isDir = false; }
          }
          if (isDir && !st.isSymbolicLink()) stack.push({ dir: full, depth: depth + 1 });

          if (!matchesName(name)) continue;
          if (q.minSize !== null && st.size < q.minSize) continue;
          if (q.maxSize !== null && st.size > q.maxSize) continue;
          if (q.modifiedAfter !== null && st.mtimeMs < q.modifiedAfter) continue;
          if (q.modifiedBefore !== null && st.mtimeMs > q.modifiedBefore) continue;

          if (matchesContent) {
            // A folder has no content to grep, so a content filter excludes it.
            if (isDir || st.size > MAX_CONTENT_BYTES) continue;
            let bytes: Buffer;
            try {
              bytes = await readFile(full);
            } catch {
              continue;
            }
            if (isProbablyBinary(bytes.subarray(0, 8000))) continue;
            if (!matchesContent(decodeText(bytes))) continue;
          }

          entries.push(toEntry(root, full, st, isDir));
        }
      }
    }
  } finally {
    controllers.delete(token);
  }

  entries.sort((a, b) => (a.srcPath ?? '').localeCompare(b.srcPath ?? ''));
  return {
    ok: true,
    value: { entries, scanned, truncated, cancelled: controller.signal.aborted },
  };
}
