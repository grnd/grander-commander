// src/main/ops/runner.ts
import { mkdir as nodeMkdir, readdir, rename, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { copyFile } from '../fs/copyFile';
import { trashPaths } from '../fs/trash';
import type { FileOp, OpEvent, ConflictAnswer, OpId } from '@shared/types';
import type { RunningOp, Subscriber } from './types';

export class OpRunner {
  private ops = new Map<OpId, RunningOp>();
  private runningPromise = new Map<OpId, Promise<void>>();

  start(op: FileOp): OpId {
    const id = randomUUID();
    const running: RunningOp = {
      id,
      op,
      controller: new AbortController(),
      subscribers: new Set(),
      pendingConflict: null,
      overwriteAll: null,
      filesDone: 0,
      filesTotal: op.sources.length,
      bytesDone: 0,
      bytesTotal: 0,
    };
    this.ops.set(id, running);
    this.runningPromise.set(id, Promise.resolve().then(() => this.run(running)));
    return id;
  }

  subscribe(id: OpId, cb: Subscriber): () => void {
    const r = this.ops.get(id);
    if (!r) return () => {};
    r.subscribers.add(cb);
    return () => {
      r.subscribers.delete(cb);
    };
  }

  cancel(id: OpId): void {
    const r = this.ops.get(id);
    if (!r) return;
    r.controller.abort();
    if (r.pendingConflict) {
      r.pendingConflict.resolve({ action: 'cancel' });
      r.pendingConflict = null;
    }
  }

  answerConflict(id: OpId, a: ConflictAnswer): void {
    const r = this.ops.get(id);
    if (!r || !r.pendingConflict) return;
    if ((a.action === 'overwrite' || a.action === 'skip') && a.applyToAll) {
      r.overwriteAll = a.action;
    }
    r.pendingConflict.resolve(a);
    r.pendingConflict = null;
  }

  async await(id: OpId): Promise<void> {
    const p = this.runningPromise.get(id);
    if (p) await p;
  }

  private emit(r: RunningOp, e: OpEvent): void {
    for (const s of r.subscribers) s(e);
  }

  private async sizeOf(path: string): Promise<number> {
    try {
      const s = await stat(path);
      if (s.isDirectory()) {
        const entries = await readdir(path);
        let total = 0;
        for (const entry of entries) total += await this.sizeOf(join(path, entry));
        return total;
      }
      return s.size;
    } catch {
      return 0;
    }
  }

  private isValidBasename(name: string): boolean {
    return !!name
      && name === basename(name)
      && name !== '.'
      && name !== '..'
      && !name.includes('\0');
  }

  private async run(r: RunningOp): Promise<void> {
    try {
      for (const src of r.op.sources) r.bytesTotal += await this.sizeOf(src);

      for (const src of r.op.sources) {
        if (r.controller.signal.aborted) {
          this.emit(r, { kind: 'cancelled', filesDone: r.filesDone, bytesDone: r.bytesDone });
          return;
        }
        const name = basename(src);
        const dst = join(r.op.dst, name);
        const didSkip = await this.processOne(r, src, dst);
        r.filesDone += didSkip ? 0 : 1;
      }
      if (r.controller.signal.aborted) {
        this.emit(r, { kind: 'cancelled', filesDone: r.filesDone, bytesDone: r.bytesDone });
      } else {
        this.emit(r, { kind: 'complete', filesDone: r.filesDone, bytesDone: r.bytesDone });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'cancelled' || msg === 'copyFile failed' || msg === 'trashPaths failed' || msg === 'rename answer invalid') {
        // already emitted cancelled/error inside processOne
        return;
      }
      this.emit(r, { kind: 'error', error: { kind: 'unknown', message: msg }, path: '' });
    } finally {
      setTimeout(() => {
        this.ops.delete(r.id);
        this.runningPromise.delete(r.id);
      }, 5_000);
    }
  }

  /** Returns true if the file was SKIPPED (not counted). */
  private async processOne(r: RunningOp, src: string, initialDst: string): Promise<boolean> {
    let dst = initialDst;
    let overwriteThis = false;

    let dstExists = false;
    try {
      await stat(dst);
      dstExists = true;
    } catch {
      /* good */
    }

    if (dstExists) {
      if (r.overwriteAll === 'overwrite') {
        overwriteThis = true;
      } else if (r.overwriteAll === 'skip') {
        return true;
      } else {
        this.emit(r, { kind: 'conflict', srcPath: src, dstPath: dst });
        const answer = await new Promise<ConflictAnswer>((resolve) => {
          r.pendingConflict = { resolve };
        });
        if (answer.action === 'cancel' || r.controller.signal.aborted) {
          this.emit(r, { kind: 'cancelled', filesDone: r.filesDone, bytesDone: r.bytesDone });
          throw new Error('cancelled');
        }
        if (answer.action === 'skip') return true;
        if (answer.action === 'rename') {
          if (!this.isValidBasename(answer.newName)) {
            this.emit(r, {
              kind: 'error',
              error: { kind: 'name-invalid', reason: 'rename target must be a basename' },
              path: initialDst,
            });
            throw new Error('rename answer invalid');
          }
          dst = join(r.op.dst, answer.newName);
          let renamedDstExists = true;
          try {
            await stat(dst);
          } catch (err) {
            const e = err as NodeJS.ErrnoException;
            if (e.code && e.code !== 'ENOENT') throw err;
            renamedDstExists = false;
          }
          if (renamedDstExists) {
            this.emit(r, { kind: 'error', error: { kind: 'exists', path: dst }, path: dst });
            throw new Error('rename answer invalid');
          }
          overwriteThis = false;
        }
        if (answer.action === 'overwrite') overwriteThis = true;
      }
    }

    if (r.op.kind === 'move' && !overwriteThis) {
      try {
        await rename(src, dst);
        return false;
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code !== 'EXDEV') throw err;
        // fall through to copy+trash
      }
    }

    try {
      await nodeMkdir(r.op.dst, { recursive: true });
    } catch {
      /* ignore */
    }

    const cpRes = await copyFile(src, dst, {
      overwrite: overwriteThis,
      signal: r.controller.signal,
      onProgress: (n) => {
        this.emit(r, {
          kind: 'progress',
          bytesDone: r.bytesDone + n,
          bytesTotal: r.bytesTotal,
          filesDone: r.filesDone,
          filesTotal: r.filesTotal,
          currentFile: basename(src),
        });
      },
    });
    if (!cpRes.ok) {
      if (r.controller.signal.aborted) {
        this.emit(r, { kind: 'cancelled', filesDone: r.filesDone, bytesDone: r.bytesDone });
      } else {
        this.emit(r, { kind: 'error', error: cpRes.error, path: src });
      }
      throw new Error('copyFile failed');
    }
    const sz = await this.sizeOf(src);
    r.bytesDone += sz;

    if (r.op.kind === 'move') {
      const trashRes = await trashPaths([src]);
      if (!trashRes.ok) {
        this.emit(r, { kind: 'error', error: trashRes.error, path: src });
        throw new Error('trashPaths failed');
      }
    }
    return false;
  }
}
