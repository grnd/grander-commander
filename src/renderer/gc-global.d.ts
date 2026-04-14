// Ambient declaration: expose the preload-exposed `window.gc` API to the
// renderer TypeScript project without pulling src/preload into its include.
import type { FileEntry, ListDirOptions, Result, Volume } from '@shared/types';

export type GCApi = {
  fs: {
    listDir(path: string, opts: ListDirOptions): Promise<Result<FileEntry[]>>;
    stat(path: string): Promise<Result<FileEntry>>;
  };
  volumes: {
    list(): Promise<Volume[]>;
  };
  shell: {
    openPath(path: string): Promise<void>;
  };
};

declare global {
  interface Window {
    gc: GCApi;
  }
}
