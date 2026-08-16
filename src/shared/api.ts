// src/shared/api.ts
//
// The single definition of the preload bridge. It lives in @shared because the
// renderer tsconfig cannot see src/preload: before this, the same type was
// hand-copied into src/renderer/gc-global.d.ts and the two drifted whenever a
// channel was added on one side only.
import type {
  FileEntry, ListDirOptions, Result, Volume, FileOp, OpId, OpEvent, ConflictAnswer,
  UpdateStatus, MenuCommand,
} from './types';

export type GCApi = {
  fs: {
    listDir(path: string, opts: ListDirOptions): Promise<Result<FileEntry[]>>;
    stat(path: string): Promise<Result<FileEntry>>;
    mkdir(parent: string, name: string): Promise<Result<void>>;
    rename(from: string, to: string): Promise<Result<void>>;
    trash(paths: string[]): Promise<Result<void>>;
    delete(paths: string[]): Promise<Result<void>>;
    duplicate(path: string): Promise<Result<string>>;
    readChunk(path: string, offset: number, length: number): Promise<Result<{ bytes: Uint8Array; size: number }>>;
  };
  volumes: { list(): Promise<Volume[]> };
  ops: {
    start(op: FileOp): Promise<OpId>;
    cancel(id: OpId): Promise<void>;
    answerConflict(id: OpId, a: ConflictAnswer): Promise<void>;
    subscribe(id: OpId, cb: (ev: OpEvent) => void): () => void;
  };
  shell: {
    openPath(path: string): Promise<void>;
    quickLook(path: string): Promise<void>;
    openTerminal(path: string): Promise<void>;
    runCommand(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  terminal: {
    spawn(cwd: string, cols: number, rows: number): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
    onData(id: string, cb: (data: string) => void): () => void;
    onExit(id: string, cb: (info: { exitCode: number; signal?: number }) => void): () => void;
  };
  menu: {
    onCommand(cb: (cmd: MenuCommand) => void): () => void;
    popupFileContext(args: {
      x: number;
      y: number;
      fullPath: string;
      isDir: boolean;
      isDotDot: boolean;
      isAppBundle: boolean;
    }): Promise<void>;
  };
  update: {
    check(): Promise<UpdateStatus>;
    download(): Promise<void>;
    install(): Promise<void>;
    status(): Promise<UpdateStatus>;
    releaseNotes(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
};
