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
