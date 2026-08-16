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
