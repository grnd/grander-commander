import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  utimes,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import type { OpError, Result } from '@shared/types';

export type CopyOptions = {
  onProgress: (bytesDone: number) => void;
  signal: AbortSignal | undefined;
  overwrite?: boolean;
};

const CHUNK = 1024 * 1024; // 1 MiB

type CopyState = { bytesDone: number };

function abortError(): Error & { code: 'ABORT' } {
  return Object.assign(new Error('aborted'), { code: 'ABORT' as const });
}

function mapFsError(err: unknown, path: string): OpError {
  const e = err as NodeJS.ErrnoException & { message?: string };
  return e.code === 'ENOENT' ? { kind: 'not-found', path }
    : e.code === 'EACCES' || e.code === 'EPERM' ? { kind: 'permission', path }
    : e.code === 'ENOSPC' ? { kind: 'disk-full' }
    : { kind: 'unknown', message: e.message ?? String(err) };
}

async function pathLstat(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

async function pathsAreSame(src: string, dst: string): Promise<boolean> {
  const [srcStat, dstStat] = await Promise.all([pathLstat(src), pathLstat(dst)]);
  return !!srcStat && !!dstStat && srcStat.dev === dstStat.dev && srcStat.ino === dstStat.ino;
}

async function pathsResolveToSameTarget(src: string, dst: string): Promise<boolean> {
  try {
    const [resolvedSrc, resolvedDst] = await Promise.all([realpath(src), realpath(dst)]);
    return resolvedSrc === resolvedDst;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT' || e.code === 'EINVAL' || e.code === 'ELOOP') return false;
    throw err;
  }
}

async function cleanupPath(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    /* ignore cleanup failure */
  }
}

function makeSiblingTempPath(path: string, label: string): string {
  return join(dirname(path), `.${basename(path)}.${label}.${randomUUID()}`);
}

async function canonicalizePath(path: string): Promise<string> {
  const absolutePath = resolve(path);
  const missingSegments: string[] = [];
  let current = absolutePath;

  // Resolve the deepest existing ancestor so containment checks follow symlinks
  // without requiring the full destination path to exist yet.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const resolvedPath = await realpath(current);
      return missingSegments.reduceRight((acc, segment) => join(acc, segment), resolvedPath);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw err;
      const parent = dirname(current);
      if (parent === current) throw err;
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

function isSameOrDescendantPath(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

async function validateDirectoryDestination(src: string, dst: string): Promise<Result<void>> {
  const srcStat = await pathLstat(src);
  if (!srcStat?.isDirectory()) return { ok: true, value: undefined };

  const [canonicalSource, canonicalDstParent] = await Promise.all([
    canonicalizePath(src),
    canonicalizePath(dirname(dst)),
  ]);

  if (isSameOrDescendantPath(canonicalSource, canonicalDstParent)) {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: 'Cannot copy a directory into itself or one of its descendants',
      },
    };
  }

  return { ok: true, value: undefined };
}

async function preserveMetadata(path: string, srcStat: Stats): Promise<void> {
  if (!srcStat.isSymbolicLink()) {
    await chmod(path, srcStat.mode & 0o777);
    await utimes(path, srcStat.atime, srcStat.mtime);
    return;
  }

  const lutimesFn = (await import('node:fs/promises')).lutimes;
  if (typeof lutimesFn === 'function') {
    try {
      await lutimesFn(path, srcStat.atime, srcStat.mtime);
    } catch {
      /* best effort */
    }
  }
}

async function writeAll(
  fileHandle: Awaited<ReturnType<typeof open>>,
  buffer: Buffer,
  length: number,
): Promise<void> {
  let offset = 0;
  while (offset < length) {
    const { bytesWritten } = await fileHandle.write(buffer, offset, length - offset);
    if (bytesWritten <= 0) throw new Error('write returned no bytes');
    offset += bytesWritten;
  }
}

async function copyRegularFile(
  src: string,
  dst: string,
  srcStat: Stats,
  state: CopyState,
  opts: CopyOptions,
): Promise<void> {
  let srcFh: Awaited<ReturnType<typeof open>> | undefined;
  let dstFh: Awaited<ReturnType<typeof open>> | undefined;

  try {
    srcFh = await open(src, 'r');
    dstFh = await open(dst, 'wx', srcStat.mode & 0o777);
    const buf = Buffer.alloc(CHUNK);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (opts.signal?.aborted) throw abortError();
      const { bytesRead } = await srcFh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      await writeAll(dstFh, buf, bytesRead);
      state.bytesDone += bytesRead;
      opts.onProgress(state.bytesDone);
    }

    await dstFh.sync();
  } finally {
    try { await srcFh?.close(); } catch { /* ignore */ }
    try { await dstFh?.close(); } catch { /* ignore */ }
  }

  await preserveMetadata(dst, srcStat);
}

async function copySymlink(src: string, dst: string, srcStat: Stats): Promise<void> {
  const target = await readlink(src);
  await symlink(target, dst);
  await preserveMetadata(dst, srcStat);
}

async function copyDirectory(
  src: string,
  dst: string,
  srcStat: Stats,
  state: CopyState,
  opts: CopyOptions,
): Promise<void> {
  await mkdir(dst, { recursive: false, mode: srcStat.mode & 0o777 });
  const entries = await readdir(src);
  for (const name of entries) {
    if (opts.signal?.aborted) throw abortError();
    await copyEntry(join(src, name), join(dst, name), state, opts);
  }
  await preserveMetadata(dst, srcStat);
}

async function copyEntry(src: string, dst: string, state: CopyState, opts: CopyOptions): Promise<void> {
  if (opts.signal?.aborted) throw abortError();
  const srcStat = await lstat(src);

  if (srcStat.isDirectory()) {
    await copyDirectory(src, dst, srcStat, state, opts);
    return;
  }

  if (srcStat.isSymbolicLink()) {
    await copySymlink(src, dst, srcStat);
    return;
  }

  if (!srcStat.isFile()) {
    throw new Error(`Unsupported file type at ${src}`);
  }

  await copyRegularFile(src, dst, srcStat, state, opts);
}

export async function copyFile(src: string, dst: string, opts: CopyOptions): Promise<Result<void>> {
  let tempDst: string | null = null;
  let backupDst: string | null = null;
  let replacedDst = false;
  let committed = false;

  try {
    if (await pathsAreSame(src, dst)) {
      return { ok: false, error: { kind: 'exists', path: dst } };
    }

    if (await pathsResolveToSameTarget(src, dst)) {
      return { ok: false, error: { kind: 'exists', path: dst } };
    }

    const destinationCheck = await validateDirectoryDestination(src, dst);
    if (!destinationCheck.ok) return destinationCheck;

    const initialDstStat = await pathLstat(dst);
    if (initialDstStat && !opts.overwrite) {
      return { ok: false, error: { kind: 'exists', path: dst } };
    }

    await mkdir(dirname(dst), { recursive: true });
    tempDst = makeSiblingTempPath(dst, 'gc-copy');
    const state: CopyState = { bytesDone: 0 };
    await copyEntry(src, tempDst, state, opts);

    if (opts.signal?.aborted) throw abortError();
    const finalDstStat = await pathLstat(dst);
    if (finalDstStat) {
      if (await pathsAreSame(src, dst) || await pathsResolveToSameTarget(src, dst)) {
        return { ok: false, error: { kind: 'exists', path: dst } };
      }
      if (!opts.overwrite) {
        return { ok: false, error: { kind: 'exists', path: dst } };
      }

      backupDst = makeSiblingTempPath(dst, 'gc-backup');
      await rename(dst, backupDst);
      replacedDst = true;
    }

    await rename(tempDst, dst);
    tempDst = null;
    committed = true;

    if (backupDst) {
      await cleanupPath(backupDst);
      backupDst = null;
    }

    return { ok: true, value: undefined };
  } catch (err) {
    if (replacedDst && backupDst && !committed) {
      try {
        if (await pathLstat(backupDst)) {
          await rename(backupDst, dst);
          backupDst = null;
        }
      } catch (restoreErr) {
        return {
          ok: false,
          error: {
            kind: 'unknown',
            message: `Failed to restore destination after copy failure: ${String(restoreErr)}`,
          },
        };
      }
    }
    return { ok: false, error: mapFsError(err, src) };
  } finally {
    if (tempDst) await cleanupPath(tempDst);
    if (backupDst && committed) await cleanupPath(backupDst);
  }
}
