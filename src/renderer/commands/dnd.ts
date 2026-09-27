// src/renderer/commands/dnd.ts
//
// Drag-and-drop payload handling, kept pure so the rules about which paths
// travel and what a drop means are testable without a DOM drag.

import type { ArchiveMember } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';
import { entryKey, entryPath, targetPaths } from '@renderer/state/panelSlice';

/**
 * Members dragged out of an archive. They have no path on disk, so a drop
 * has to become an extraction rather than a copy.
 */
export const GC_ARCHIVE = 'text/gc-archive';

export type ArchiveDrag = {
  archivePath: string;
  /** Inner folder being browsed; members are lifted out of it on the way. */
  stripPrefix: string;
  members: ArchiveMember[];
};

export function encodeArchiveDrag(payload: ArchiveDrag): string {
  return JSON.stringify(payload);
}

export function decodeArchiveDrag(raw: string): ArchiveDrag | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { archivePath, stripPrefix, members } = parsed as Partial<ArchiveDrag>;
    if (typeof archivePath !== 'string' || typeof stripPrefix !== 'string') return null;
    if (!Array.isArray(members)) return null;
    const clean = members.filter(
      (m): m is ArchiveMember =>
        Boolean(m) && typeof m.path === 'string' && typeof m.isDir === 'boolean',
    );
    if (clean.length === 0) return null;
    return { archivePath, stripPrefix, members: clean };
  } catch {
    return null;
  }
}

export type DropIntent = { kind: 'copy' | 'move'; sources: string[]; dest: string };

/**
 * Paths a drag starting on `index` should carry: the whole marked set when the
 * grabbed row is part of it, otherwise just that row. Matches how every other
 * command reads a selection.
 */
export function dragPaths(panel: PanelState, index: number): string[] {
  const entry = panel.entries[index];
  if (!entry || entry.name === '..') return [];
  if (panel.selection.size > 0 && panel.selection.has(entryKey(entry))) {
    return targetPaths(panel);
  }
  return [entryPath(panel, entry)];
}

/** Destination for a drop: the folder under the pointer, else the panel itself. */
export function dropTarget(panel: PanelState, overIndex: number | null): string | null {
  if (panel.source.kind !== 'fs') return null;
  if (overIndex !== null) {
    const entry = panel.entries[overIndex];
    if (entry && entry.isDir && entry.name !== '..') return entryPath(panel, entry);
  }
  return panel.path;
}

/**
 * What a drop should do.
 *
 * Plain drag copies and Shift makes it a move, which is Total Commander's
 * rule. It applies to drops from other apps too: our own drags travel as
 * native OS drags now and arrive looking identical to Finder's, and a user
 * holding Shift is asking for a move either way.
 *
 * Sources already inside the destination are dropped from the list, so
 * dragging a file onto its own folder is a no-op rather than a conflict
 * prompt; a folder dragged into itself is refused for the same reason.
 */
export function resolveDrop(
  sources: string[],
  dest: string | null,
  modifiers: { shiftKey: boolean },
): DropIntent | null {
  if (!dest || sources.length === 0) return null;
  const useful = sources.filter((src) => {
    const parent = src.slice(0, Math.max(0, src.lastIndexOf('/'))) || '/';
    if (parent === dest) return false;
    return dest !== src && !dest.startsWith(`${src}/`);
  });
  if (useful.length === 0) return null;
  return { kind: modifiers.shiftKey ? 'move' : 'copy', sources: useful, dest };
}

/**
 * Paths carried by a file drop — from Finder, or from this app's own native
 * drag. Electron exposes the real location on the File object; anything
 * without one (a dragged text selection, a browser image) is skipped rather
 * than guessed at.
 */
export function externalPaths(files: ArrayLike<File>): string[] {
  const out: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = (files[i] as File & { path?: string }).path;
    if (typeof path === 'string' && path.length > 0) out.push(path);
  }
  return out;
}

/** The slice of DataTransfer a drop needs; jsdom has no DataTransfer at all. */
type DropData = { files: ArrayLike<File>; getData: (type: string) => string };

/**
 * Turn one `text/uri-list` line into a path. Anything that is not a local
 * file — an http URL dragged out of a browser — has no path and is skipped.
 */
function uriToPath(line: string): string | null {
  const trimmed = line.trim();
  // The format allows comment lines, and Finder does emit them.
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  if (!trimmed.startsWith('file://')) return null;
  try {
    // Strips the (always empty, for Finder) host and un-escapes %20.
    return decodeURIComponent(new URL(trimmed).pathname) || null;
  } catch {
    return null;
  }
}

/**
 * Every path a drop carries, whichever channel it came down.
 *
 * Finder and our own native drags arrive as files with a real location on
 * them. A path dragged out of a terminal, an editor or a browser's download
 * list has no File behind it and arrives as text instead — worth reading for
 * a *location* drop, where one path is all that is needed.
 */
export function droppedPaths(dt: DropData): string[] {
  const files = externalPaths(dt.files);
  if (files.length > 0) return files;

  const uris = dt.getData('text/uri-list');
  if (uris) {
    const paths = uris.split(/\r?\n/).map(uriToPath).filter((p): p is string => p !== null);
    if (paths.length > 0) return paths;
  }

  // Last resort: plain text, and only when it reads as an absolute path.
  // Dropping a sentence onto the path bar should do nothing at all.
  const text = dt.getData('text/plain').trim();
  if (text.startsWith('file://')) {
    const p = uriToPath(text);
    return p ? [p] : [];
  }
  return text.startsWith('/') && !text.includes('\n') ? [text] : [];
}

/**
 * The one place a location drop means. A drop on the path bar or a tab is a
 * request to *go* somewhere, and a panel can only be in one folder, so extra
 * dragged items are ignored rather than opening a pile of tabs.
 */
export function locationPath(paths: string[]): string | null {
  return paths[0] ?? null;
}
