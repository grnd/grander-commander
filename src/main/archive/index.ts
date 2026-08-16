// src/main/archive/index.ts
import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { ArchiveEntry, ArchiveFormat, ArchiveMember, ArchiveOp, Result } from '@shared/types';
import { detectFormat, tarCompressionFlag, toolFor } from './format';
import { parseSevenZipListing, parseTarListing, parseZipListing } from './parse';
import { exec, sevenZipBinary } from './exec';
import { mapFsError } from './../fs/errors';

export { detectFormat, isArchivePath } from './format';

const NO_SEVEN_ZIP = {
  kind: 'unknown' as const,
  message: '7-Zip archives need the `7zz` or `7z` command. Install it with: brew install sevenzip',
};

const controllers = new Map<string, AbortController>();

export function cancelArchiveOp(token: string): void {
  controllers.get(token)?.abort();
}

function failed(stderr: string, code: number): Result<never> {
  const message = stderr.trim().split('\n').slice(0, 3).join('; ')
    || `archive tool exited with code ${code}`;
  return { ok: false, error: { kind: 'unknown', message } };
}

export async function listArchive(archivePath: string): Promise<Result<ArchiveEntry[]>> {
  const format = detectFormat(archivePath);
  if (!format) {
    return { ok: false, error: { kind: 'name-invalid', reason: `${basename(archivePath)} is not a supported archive` } };
  }
  try {
    await stat(archivePath);
  } catch (err) {
    return { ok: false, error: mapFsError(err, archivePath) };
  }

  const tool = toolFor(format);
  if (tool === 'zip') {
    const r = await exec('/usr/bin/unzip', ['-Z', '-T', archivePath]);
    // unzip exits 1 for warnings it still lists through, so trust the parse.
    const entries = parseZipListing(r.stdout);
    if (entries.length === 0 && r.code !== 0) return failed(r.stderr || r.stdout, r.code);
    return { ok: true, value: entries };
  }
  if (tool === 'tar') {
    const r = await exec('/usr/bin/tar', ['-tvf', archivePath]);
    if (r.code !== 0) return failed(r.stderr, r.code);
    return { ok: true, value: parseTarListing(r.stdout) };
  }

  const bin = await sevenZipBinary();
  if (!bin) return { ok: false, error: NO_SEVEN_ZIP };
  const r = await exec(bin, ['l', '-slt', archivePath]);
  if (r.code !== 0) return failed(r.stderr, r.code);
  return { ok: true, value: parseSevenZipListing(r.stdout) };
}

/**
 * Members to hand the tool for a requested set of entries.
 *
 * unzip matches members as patterns against the *stored* names, where a folder
 * is `sub/` — so a folder needs both `sub/` (the entry itself) and `sub/*` (its
 * contents). tar and 7z expand a directory to its subtree on their own.
 */
export function memberArgs(
  format: ArchiveFormat,
  members: readonly ArchiveMember[],
): string[] {
  if (toolFor(format) !== 'zip') return members.map((m) => m.path);
  return members.flatMap((m) => (m.isDir ? [`${m.path}/`, `${m.path}/*`] : [m.path]));
}

/** Run the format's extractor for `memberPatterns` (empty = everything). */
async function runExtract(
  format: ArchiveFormat,
  archivePath: string,
  memberPatterns: string[],
  dest: string,
  signal: AbortSignal,
): Promise<Result<void>> {
  const tool = toolFor(format);

  if (tool === 'zip') {
    const args = ['-o', archivePath, ...memberPatterns, '-d', dest];
    const r = await exec('/usr/bin/unzip', args, { signal });
    // 11 is "nothing matched", which for a selection means the members were
    // named wrongly — a real failure, unlike unzip's warning code 1.
    if (r.code !== 0 && r.code !== 1) return failed(r.stderr || r.stdout, r.code);
    return { ok: true, value: undefined };
  }

  if (tool === 'tar') {
    const flag = tarCompressionFlag(format);
    const args = ['-xf', archivePath, '-C', dest];
    if (flag) args.splice(0, 0, flag);
    if (memberPatterns.length > 0) args.push('--', ...memberPatterns);
    const r = await exec('/usr/bin/tar', args, { signal });
    if (r.code !== 0) return failed(r.stderr, r.code);
    return { ok: true, value: undefined };
  }

  const bin = await sevenZipBinary();
  if (!bin) return { ok: false, error: NO_SEVEN_ZIP };
  const args = ['x', archivePath, `-o${dest}`, '-y'];
  if (memberPatterns.length > 0) args.push('--', ...memberPatterns);
  const r = await exec(bin, args, { signal });
  if (r.code !== 0) return failed(r.stderr, r.code);
  return { ok: true, value: undefined };
}

async function extract(
  op: Extract<ArchiveOp, { kind: 'extract' }>,
  signal: AbortSignal,
): Promise<Result<void>> {
  const format = detectFormat(op.archivePath);
  if (!format) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'unsupported archive' } };
  }

  const strip = op.stripPrefix.replace(/^\/+/, '').replace(/\/+$/, '');
  // Whole-archive extraction, or members already at the archive root: the
  // paths the tool writes are the paths the user expects.
  if (op.members.length === 0 || strip === '') {
    return runExtract(format, op.archivePath, memberArgs(format, op.members), op.dest, signal);
  }

  // Otherwise every tool would recreate the member's full inner path under the
  // destination. Extract into a staging directory *inside* the destination —
  // same volume, so lifting the members out is a rename, not a copy — then
  // move each one up to where the user actually asked for it.
  let staging: string;
  try {
    staging = await mkdtemp(join(op.dest, '.gc-extract-'));
  } catch (err) {
    return { ok: false, error: mapFsError(err, op.dest) };
  }

  try {
    const r = await runExtract(format, op.archivePath, memberArgs(format, op.members), staging, signal);
    if (!r.ok) return r;

    for (const member of op.members) {
      const from = join(staging, member.path);
      const to = join(op.dest, basename(member.path));
      // Refuse rather than clobber: extraction has no conflict prompt, and
      // silently replacing a folder is not something to guess at.
      if (existsSync(to)) return { ok: false, error: { kind: 'exists', path: to } };
      try {
        await rename(from, to);
      } catch (err) {
        return { ok: false, error: mapFsError(err, from) };
      }
    }
    return { ok: true, value: undefined };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function create(
  op: Extract<ArchiveOp, { kind: 'create' }>,
  signal: AbortSignal,
): Promise<Result<void>> {
  if (op.sources.length === 0) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'nothing selected to pack' } };
  }
  // Sources are added by basename from their shared parent, so the archive
  // holds `photo.jpg`, not `Users/me/pictures/photo.jpg`.
  const cwd = dirname(op.sources[0]);
  const names = op.sources.map((s) => basename(s));
  const tool = toolFor(op.format);

  if (tool === 'zip') {
    const r = await exec('/usr/bin/zip', ['-r', '-q', op.archivePath, ...names], { cwd, signal });
    if (r.code !== 0) return failed(r.stderr || r.stdout, r.code);
    return { ok: true, value: undefined };
  }

  if (tool === 'tar') {
    const flag = tarCompressionFlag(op.format);
    const args = [...(flag ? [flag] : []), '-cf', op.archivePath, '--', ...names];
    const r = await exec('/usr/bin/tar', args, { cwd, signal });
    if (r.code !== 0) return failed(r.stderr, r.code);
    return { ok: true, value: undefined };
  }

  const bin = await sevenZipBinary();
  if (!bin) return { ok: false, error: NO_SEVEN_ZIP };
  const r = await exec(bin, ['a', '-y', op.archivePath, '--', ...names], { cwd, signal });
  if (r.code !== 0) return failed(r.stderr, r.code);
  return { ok: true, value: undefined };
}

export async function runArchiveOp(token: string, op: ArchiveOp): Promise<Result<void>> {
  const controller = new AbortController();
  controllers.set(token, controller);
  try {
    return op.kind === 'extract'
      ? await extract(op, controller.signal)
      : await create(op, controller.signal);
  } finally {
    controllers.delete(token);
  }
}

/**
 * Pull one member out to a scratch directory so it can be opened or viewed.
 * Returns the extracted file's path.
 */
export async function extractToTemp(
  archivePath: string,
  member: string,
): Promise<Result<string>> {
  const format = detectFormat(archivePath);
  if (!format) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'unsupported archive' } };
  }
  let dest: string;
  try {
    dest = await mkdtemp(join(tmpdir(), 'gc-archive-'));
  } catch (err) {
    return { ok: false, error: mapFsError(err, tmpdir()) };
  }
  const token = `temp-${Date.now()}`;
  // No stripping here: the caller wants the member at its inner path so it can
  // be found again below.
  const r = await runArchiveOp(token, {
    kind: 'extract',
    archivePath,
    members: [{ path: member, isDir: false }],
    dest,
    stripPrefix: '',
  });
  if (!r.ok) return r;

  const extracted = join(dest, member);
  try {
    await stat(extracted);
  } catch (err) {
    return { ok: false, error: mapFsError(err, extracted) };
  }
  return { ok: true, value: extracted };
}
