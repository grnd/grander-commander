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
