import type { DialogState, OpError, Result } from '@shared/types';
import type { PanelState } from '@renderer/state/panelSlice';
import { cursorPath } from '@renderer/state/panelSlice';
import type { EditorState } from '@renderer/state/store';

type ReadFn = (path: string) => Promise<Result<{ content: string; size: number }>>;
type WriteFn = (path: string, content: string) => Promise<Result<void>>;
type SetEditor = (e: EditorState | null) => void;
type SetDialog = (d: DialogState | null) => void;

/**
 * The file under the cursor, or null when there is nothing editable there.
 * Directories are excluded here rather than left to readTextFile so the panel
 * cursor sitting on a folder is simply a no-op.
 */
function editableCursorPath(active: PanelState): string | null {
  const cur = active.entries[active.cursor];
  if (!cur || cur.isDir) return null;
  return cursorPath(active);
}

export function describeReadError(err: OpError): string {
  switch (err.kind) {
    case 'binary':       return 'Cannot edit a binary file.';
    case 'too-large':    return `File too large to edit (${(err.size / 1024 / 1024).toFixed(1)} MB).`;
    case 'not-found':    return `File not found: ${err.path}`;
    case 'permission':   return `Permission denied: ${err.path}`;
    case 'name-invalid': return `Cannot open: ${err.reason}`;
    case 'unknown':      return `Error: ${err.message}`;
    default:             return 'Cannot open file.';
  }
}

export function describeWriteError(err: OpError): string {
  switch (err.kind) {
    case 'permission': return `Permission denied: ${err.path}`;
    case 'disk-full':  return 'Cannot save: disk is full.';
    case 'not-found':  return `Cannot save: destination path missing (${err.path}).`;
    case 'unknown':    return `Save failed: ${err.message}`;
    default:           return 'Save failed.';
  }
}

export async function openEditor(ctx: {
  active: PanelState;
  read: ReadFn;
  setEditor: SetEditor;
  onError?: (msg: string) => void;
}): Promise<void> {
  const path = editableCursorPath(ctx.active);
  if (!path) return;
  await openEditorAt(path, ctx.read, ctx.setEditor, ctx.onError);
}

/** Opens `path` directly, bypassing the cursor — used right after creating a file. */
export async function openEditorAt(
  path: string,
  read: ReadFn,
  setEditor: SetEditor,
  onError?: (msg: string) => void,
): Promise<void> {
  const r = await read(path);
  if (!r.ok) {
    onError?.(describeReadError(r.error));
    return;
  }
  setEditor({ path, original: r.value.content, current: r.value.content });
}

export async function saveEditor(
  ed: EditorState,
  write: WriteFn,
  setEditor: SetEditor,
  onError?: (msg: string) => void,
): Promise<boolean> {
  const r = await write(ed.path, ed.current);
  if (!r.ok) {
    onError?.(describeWriteError(r.error));
    return false;
  }
  // Rebase `original` on what was written, so the buffer stops reading dirty.
  setEditor({ ...ed, original: ed.current });
  return true;
}

export function closeEditor(ed: EditorState, setEditor: SetEditor, setDialog: SetDialog): void {
  if (ed.current !== ed.original) {
    setDialog({ kind: 'editorDirtyClose' });
    return;
  }
  setEditor(null);
}
