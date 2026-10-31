import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseKeymapFile } from '@shared/keymap/parse';
import { resolveBindings } from '@shared/keymap/resolve';
import { applyInverse, applyOp, type Inverse, type Op } from '@shared/keymap/ops';
import {
  emptyFile, SCHEMA_VERSION,
  type ApplyOutcome, type Diagnostic, type KeymapFile, type KeymapSnapshot,
} from '@shared/keymap/types';

const UNDO_DEPTH = 20;

type Stamp = { mtimeMs: number; size: number } | null;

/**
 * The keymap file, owned by one process. Every refusal comes back as a value
 * carrying the snapshot to rebase on, because Electron drops custom properties
 * off an Error crossing `invoke`.
 */
export class KeymapStore {
  private file: KeymapFile = emptyFile();
  private revision = 1;
  private diagnostics: Diagnostic[] = [];
  private readOnly = false;
  private stamp: Stamp = null;
  private undos = new Map<string, { inverse: Inverse; revision: number }>();
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly dir: string) {}

  static async open(dir: string): Promise<KeymapStore> {
    const store = new KeymapStore(dir);
    await store.load();
    return store;
  }

  private get path(): string { return join(this.dir, 'keymap.json'); }

  /** Read the bytes and the stamp together, so a stamp always names what we read. */
  private async readFileAndStamp(): Promise<{ raw: string; stamp: Stamp } | null> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const s = await stat(this.path);
      return { raw, stamp: { mtimeMs: s.mtimeMs, size: s.size } };
    } catch { return null; }
  }

  private async load(): Promise<void> {
    this.diagnostics = [];
    this.readOnly = false;
    const found = await this.readFileAndStamp();
    if (!found) { this.file = emptyFile(); this.stamp = null; return; }

    let raw: unknown;
    try {
      raw = JSON.parse(found.raw);
    } catch {
      // The file is the only copy of what the owner wrote. Keep it, and do not
      // claim a backup that did not happen.
      try {
        await copyFile(this.path, join(this.dir, 'keymap.bak.json'));
        this.diagnostics.push({
          kind: 'unreadable',
          message: 'keymap.json is not valid JSON, and it is kept as keymap.bak.json',
        });
      } catch {
        this.diagnostics.push({ kind: 'unreadable', message: 'keymap.json is not valid JSON' });
        this.diagnostics.push({
          kind: 'backup-failed',
          message: 'keymap.bak.json could not be written, so nothing here is written either',
        });
        this.readOnly = true;
      }
      this.file = emptyFile();
      this.stamp = found.stamp;
      return;
    }

    const parsed = parseKeymapFile(raw);
    this.diagnostics.push(...parsed.diagnostics);
    if (parsed.file.version > SCHEMA_VERSION) {
      this.readOnly = true;
      this.file = emptyFile();
    } else {
      this.file = parsed.file;
    }
    this.stamp = found.stamp;
  }

  snapshot(): KeymapSnapshot {
    const resolved = resolveBindings(this.readOnly ? null : this.file);
    return {
      revision: this.revision,
      bindings: resolved.bindings,
      overrides: structuredClone(this.file.bindings ?? {}),
      diagnostics: [...this.diagnostics, ...resolved.diagnostics],
      readOnly: this.readOnly,
    };
  }

  /** One writer at a time, so two edits from one revision cannot interleave. */
  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }

  apply(op: Op, revision: number): Promise<ApplyOutcome> {
    return this.serialise(async () => {
      const refusal = this.refuse(revision);
      if (refusal) return refusal;
      let applied: ReturnType<typeof applyOp>;
      try {
        applied = applyOp(this.file, op);
      } catch (err) {
        // An op the rules do not allow, such as a reserved key or a command
        // that takes arguments. The window shows this, so it cannot throw.
        return {
          ok: false as const, reason: 'refused' as const,
          message: err instanceof Error ? err.message : String(err),
          snapshot: this.snapshot(),
        };
      }
      const { file, displaced, inverse } = applied;
      const written = await this.write(file);
      if (!written.ok) return written;
      const undoToken = randomUUID();
      this.undos.set(undoToken, { inverse, revision: this.revision });
      if (this.undos.size > UNDO_DEPTH) {
        this.undos.delete(this.undos.keys().next().value as string);
      }
      return { ok: true as const, snapshot: this.snapshot(), displaced, undoToken };
    });
  }

  undo(token: string, revision: number): Promise<ApplyOutcome> {
    return this.serialise(async () => {
      const refusal = this.refuse(revision);
      if (refusal) return refusal;
      const stored = this.undos.get(token);
      // The token has to name the newest change. Undoing an older one would
      // erase whatever came after it.
      if (!stored || stored.revision !== this.revision) {
        this.undos.delete(token);
        return {
          ok: false as const, reason: 'no-undo' as const,
          message: 'that change can no longer be undone', snapshot: this.snapshot(),
        };
      }
      const written = await this.write(applyInverse(this.file, stored.inverse));
      if (!written.ok) return written;
      this.undos.delete(token);
      return { ok: true as const, snapshot: this.snapshot(), displaced: [], undoToken: null };
    });
  }

  reloadIfChanged(): Promise<{ changed: boolean; snapshot: KeymapSnapshot }> {
    return this.serialise(async () => {
      const found = await this.readFileAndStamp();
      const same = (found?.stamp?.mtimeMs ?? null) === (this.stamp?.mtimeMs ?? null)
        && (found?.stamp?.size ?? null) === (this.stamp?.size ?? null);
      if (same) return { changed: false, snapshot: this.snapshot() };
      await this.load();
      this.revision += 1;
      return { changed: true, snapshot: this.snapshot() };
    });
  }

  private refuse(revision: number): Extract<ApplyOutcome, { ok: false }> | null {
    if (this.readOnly) {
      return {
        ok: false, reason: 'read-only',
        message: 'this keymap file is read only in this build', snapshot: this.snapshot(),
      };
    }
    if (revision !== this.revision) {
      return {
        ok: false, reason: 'stale-revision',
        message: 'the keymap changed since this view was loaded', snapshot: this.snapshot(),
      };
    }
    return null;
  }

  private async write(next: KeymapFile): Promise<{ ok: true } | Extract<ApplyOutcome, { ok: false }>> {
    const found = await this.readFileAndStamp();
    const unchanged = (found?.stamp?.mtimeMs ?? null) === (this.stamp?.mtimeMs ?? null)
      && (found?.stamp?.size ?? null) === (this.stamp?.size ?? null);
    if (!unchanged) {
      await this.load();                      // adopt what is on disk
      this.revision += 1;
      return {
        ok: false, reason: 'external-change',
        message: 'keymap.json changed on disk, so this edit was not written',
        snapshot: this.snapshot(),
      };
    }
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, `${JSON.stringify({ ...next, version: SCHEMA_VERSION }, null, 2)}\n`, 'utf8');
    await rename(tmp, this.path);             // atomic: no reader sees half a file
    this.file = next;
    this.revision += 1;
    this.diagnostics = [];
    this.stamp = (await this.readFileAndStamp())?.stamp ?? null;
    return { ok: true };
  }
}
