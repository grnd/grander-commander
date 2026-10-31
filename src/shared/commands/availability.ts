import { commandById, type Surface } from './catalog';
import type { CommandId } from './ids';

export type AvailabilitySnapshot = {
  dialogOpen: boolean;
  favoritePickerOpen: boolean;
  viewerOpen: boolean;
  editorOpen: boolean;
  commandOutputOpen: boolean;
  activeSource: 'fs' | 'archive' | 'search';
  mountedSurfaces: readonly Surface[];
};

/**
 * Commands that assume the panel's rows are files on disk. An archive listing
 * has no such paths, so these are refused there rather than acting on a
 * synthesised one. Copy is the exception: inside an archive it means extract.
 */
const BLOCKED_IN_ARCHIVE: ReadonlySet<CommandId> = new Set([
  'mkdir', 'rename', 'move', 'trash', 'deleteConfirm', 'deleteCursorConfirm',
  'duplicate', 'multiRename', 'quickLook', 'viewFile', 'compareFiles',
  'runShellCommand', 'packArchive',
]);

/**
 * Commands that write into "the folder this panel is showing". Search results
 * come from many folders at once and an archive listing from none, so there is
 * no single directory for these to mean.
 */
const NEEDS_REAL_DIR: ReadonlySet<CommandId> = new Set(['mkdir', 'rename', 'multiRename']);

/**
 * The one question every command source has to ask — key, menu accelerator,
 * menu click, F-key bar or context menu. Keeping it here is what stops a menu
 * accelerator from acting on the panel behind an open dialog.
 *
 * An open quick-search box is deliberately not a blocking state: it is a cursor
 * mode, and finding a file by name in order to act on it is the point of it.
 */
export function canRun(id: CommandId, s: AvailabilitySnapshot): boolean {
  const meta = commandById(id);
  if (!meta) return false;
  if (meta.system || meta.requiresArgs) return false;

  if (meta.alwaysAvailable) return true;

  if (meta.surface) return s.mountedSurfaces.includes(meta.surface);

  if (s.commandOutputOpen || s.dialogOpen || s.favoritePickerOpen) return false;
  if (s.viewerOpen || s.editorOpen) return false;

  if (s.activeSource === 'archive' && BLOCKED_IN_ARCHIVE.has(id)) return false;
  if (s.activeSource !== 'fs' && NEEDS_REAL_DIR.has(id)) return false;
  return true;
}
