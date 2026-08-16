// src/renderer/commands/dnd.ts
//
// Drag-and-drop payload handling, kept pure so the rules about which paths
// travel and what a drop means are testable without a DOM drag.

import type { PanelState } from '@renderer/state/panelSlice';
import { entryKey, entryPath, targetPaths } from '@renderer/state/panelSlice';

/**
 * Private MIME type carrying the dragged paths. External apps never see it,
 * which is how a drop is told apart from one coming out of Finder.
 */
export const GC_PATHS = 'text/gc-paths';

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

export function encodePaths(paths: string[]): string {
  return JSON.stringify(paths);
}

export function decodePaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
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
 * rule. Sources already inside the destination are dropped from the list, so
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
 * Paths from a drop that came from outside the app. Electron exposes the real
 * location on the File object; anything without one (a dragged text selection,
 * a browser image) is skipped rather than guessed at.
 */
export function externalPaths(files: ArrayLike<File>): string[] {
  const out: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = (files[i] as File & { path?: string }).path;
    if (typeof path === 'string' && path.length > 0) out.push(path);
  }
  return out;
}
