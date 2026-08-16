// src/renderer/commands/archive.ts
//
// An archive listing is flat: every member carries its full inner path. The
// panel needs one level at a time, so this projects that flat list into a
// directory-style listing — including folders that exist only implicitly,
// because plenty of archives store `a/b/c.txt` without ever storing `a/`.

import type { ArchiveEntry, FileEntry } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';

/** Normalise an inner path: no leading or trailing slash, '' means the root. */
export function normaliseInner(inner: string): string {
  return inner.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function innerParent(inner: string): string {
  const normal = normaliseInner(inner);
  const i = normal.lastIndexOf('/');
  return i < 0 ? '' : normal.slice(0, i);
}

export function innerJoin(inner: string, name: string): string {
  const normal = normaliseInner(inner);
  return normal ? `${normal}/${name}` : name;
}

function splitExt(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.');
  if (i <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, i), ext: name.slice(i + 1) };
}

/**
 * The immediate children of `innerPath`, as panel rows.
 *
 * A real member wins over an implied folder of the same name, and an implied
 * folder's size is left at zero — the archive never states one.
 */
export function archiveChildren(entries: readonly ArchiveEntry[], innerPath: string): FileEntry[] {
  const prefix = normaliseInner(innerPath);
  const scope = prefix ? `${prefix}/` : '';
  const rows = new Map<string, FileEntry>();

  for (const entry of entries) {
    const path = normaliseInner(entry.path);
    if (scope && !path.startsWith(scope)) continue;
    const rest = path.slice(scope.length);
    if (!rest) continue;

    const slash = rest.indexOf('/');
    const name = slash < 0 ? rest : rest.slice(0, slash);
    const isDirect = slash < 0;
    // A member that already has a row was stated by the archive; an implied
    // folder only ever fills a gap.
    if (!isDirect && rows.has(name)) continue;
    // A descendant proves its first segment is a folder even when the archive
    // never stored an entry for it.
    const isDir = isDirect ? entry.isDir : true;

    const { base, ext } = splitExt(name);
    rows.set(name, {
      name: isDir ? name : base,
      ext: isDir ? '' : ext,
      isDir,
      isSymlink: false,
      isAppBundle: false,
      isHidden: name.startsWith('.'),
      size: isDirect ? entry.size : 0,
      mtime: isDirect ? entry.mtime : 0,
      mode: 0,
    });
  }

  return [...rows.values()];
}

/** The label shown in the path bar while browsing inside an archive. */
export function archiveLabel(archivePath: string, innerPath: string): string {
  const inner = normaliseInner(innerPath);
  return inner ? `${archivePath}/${inner}` : archivePath;
}

export function isArchivePanel(panel: PanelState): boolean {
  return panel.source.kind === 'archive';
}

/**
 * Inner paths for the rows an operation should act on: marked rows, or the row
 * under the cursor. Mirrors targetPaths, but inside the archive.
 */
export function archiveTargets(panel: PanelState): { path: string; isDir: boolean }[] {
  if (panel.source.kind !== 'archive') return [];
  const inner = panel.source.innerPath;
  const key = (e: FileEntry) => (e.ext ? `${e.name}.${e.ext}` : e.name);
  const rows = panel.selection.size > 0
    ? panel.entries.filter((e) => e.name !== '..' && panel.selection.has(key(e)))
    : (() => {
        const cur = panel.entries[panel.cursor];
        return cur && cur.name !== '..' ? [cur] : [];
      })();
  return rows.map((e) => ({ path: innerJoin(inner, key(e)), isDir: e.isDir }));
}
