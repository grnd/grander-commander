// src/shared/types.ts

export type FileEntry = {
  name: string;           // "README.md" or ".." or "photos"
  ext: string;            // "md", empty for dirs or extensionless
  isDir: boolean;
  isSymlink: boolean;
  isAppBundle: boolean;
  isHidden: boolean;
  size: number;
  mtime: number;          // unix ms
  mode: number;
};

export type Volume = {
  name: string;
  path: string;
  kind: 'home' | 'root' | 'external' | 'network';
};

export type Favorite = {
  path: string;
  label?: string;
};

export type SortCol = 'name' | 'ext' | 'size' | 'date';
export type SortDir = 'asc' | 'desc';

export type OpError =
  | { kind: 'permission'; path: string }
  | { kind: 'not-found'; path: string }
  | { kind: 'disk-full' }
  | { kind: 'cross-device'; src: string; dst: string }
  | { kind: 'exists'; path: string }
  | { kind: 'name-invalid'; reason: string }
  | { kind: 'unknown'; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: OpError };

export type ListDirOptions = { showHidden: boolean };

// Noise files that are ALWAYS hidden regardless of showHidden setting
export const NOISE_FILENAMES = new Set(['.DS_Store', 'Icon\r']);

export type MenuCommand =
  | string
  | { command: string; targetPath?: string };

// ---- M2: mutation ops ----

export type OpId = string;

export type FileOp =
  | { kind: 'copy'; sources: string[]; dst: string }   // dst is destination DIR
  | { kind: 'move'; sources: string[]; dst: string };

export type ConflictAnswer =
  | { action: 'overwrite'; applyToAll: boolean }
  | { action: 'skip'; applyToAll: boolean }
  | { action: 'rename'; newName: string; applyToAll: false }  // rename applies only to this file
  | { action: 'cancel' };

export type OpEvent =
  | { kind: 'progress'; bytesDone: number; bytesTotal: number; filesDone: number; filesTotal: number; currentFile: string }
  | { kind: 'conflict'; srcPath: string; dstPath: string }
  | { kind: 'error'; error: OpError; path: string }
  | { kind: 'complete'; filesDone: number; bytesDone: number }
  | { kind: 'cancelled'; filesDone: number; bytesDone: number };

// ---- M2: dialog state (renderer-only) ----

export type DialogState =
  | { kind: 'mkdir'; side: 'left' | 'right' }
  | { kind: 'rename'; side: 'left' | 'right'; oldName: string }
  | { kind: 'copy'; sources: string[]; dstDefault: string }
  | { kind: 'move'; sources: string[]; dstDefault: string }
  | { kind: 'deleteConfirm'; paths: string[] }
  | { kind: 'overwrite'; opId: OpId; srcPath: string; dstPath: string }
  | { kind: 'progress'; opId: OpId; title: string; filesDone: number; filesTotal: number; bytesDone: number; bytesTotal: number; currentFile: string }
  | { kind: 'favoriteEdit'; path: string; label: string }
  | { kind: 'multiRename'; side: 'left' | 'right'; dir: string; names: string[]; existingNames: string[] }
  | { kind: 'compare'; left: string; right: string };

// ---- M3: file compare ----

export type DiffRowKind = 'same' | 'add' | 'del' | 'change';

export type DiffRow = {
  /** 1-based line numbers; null on the side that has no line here. */
  leftNo: number | null;
  rightNo: number | null;
  left: string | null;
  right: string | null;
  kind: DiffRowKind;
};

export type DiffResult = {
  left: string;
  right: string;
  identical: boolean;
  /** Binary content gets a bytes-match verdict instead of a line diff. */
  binary: boolean;
  /** Set when the row list was capped; stats still cover the whole file. */
  truncated: boolean;
  leftSize: number;
  rightSize: number;
  rows: DiffRow[];
  stats: { added: number; removed: number; changed: number };
};

// ---- M3: command-line completion ----

export type CompletionKind = 'dir' | 'file' | 'exec';
export type Completion = { value: string; kind: CompletionKind };

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: number }
  | { kind: 'available'; version: string; releaseUrl: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string; releaseUrl: string }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported'; reason: string };
