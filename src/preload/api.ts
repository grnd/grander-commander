import type { FileEntry, ListDirOptions, Result, Volume, FileOp, OpId, OpEvent, ConflictAnswer } from '@shared/types';

export type GCApi = {
  fs: {
    listDir(path: string, opts: ListDirOptions): Promise<Result<FileEntry[]>>;
    stat(path: string): Promise<Result<FileEntry>>;
    mkdir(parent: string, name: string): Promise<Result<void>>;
    rename(from: string, to: string): Promise<Result<void>>;
    trash(paths: string[]): Promise<Result<void>>;
    delete(paths: string[]): Promise<Result<void>>;
    duplicate(path: string): Promise<Result<string>>;
  };
  volumes: {
    list(): Promise<Volume[]>;
  };
  ops: {
    start(op: FileOp): Promise<OpId>;
    cancel(id: OpId): Promise<void>;
    answerConflict(id: OpId, a: ConflictAnswer): Promise<void>;
    subscribe(id: OpId, cb: (ev: OpEvent) => void): () => void;
  };
  shell: {
    openPath(path: string): Promise<void>;
    quickLook(path: string): Promise<void>;
  };
  menu: {
    onCommand(cb: (cmd: string) => void): () => void;
  };
};

declare global {
  interface Window {
    gc: GCApi;
  }
}
