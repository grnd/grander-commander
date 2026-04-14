// src/main/ops/types.ts
import type { FileOp, OpEvent, ConflictAnswer, OpId } from '@shared/types';

export type Subscriber = (e: OpEvent) => void;

export type RunningOp = {
  id: OpId;
  op: FileOp;
  controller: AbortController;
  subscribers: Set<Subscriber>;
  pendingConflict: { resolve: (a: ConflictAnswer) => void } | null;
  overwriteAll: 'overwrite' | 'skip' | null;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
};
