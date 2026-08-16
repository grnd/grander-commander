// src/main/archive/index.ts
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { ArchiveEntry, ArchiveFormat, ArchiveOp, Result } from '@shared/types';
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
  members: { path: string; isDir: boolean }[],
): string[] {
  if (toolFor(format) !== 'zip') return members.map((m) => m.path);
  return members.flatMap((m) => (m.isDir ? [`${m.path}/`, `${m.path}/*`] : [m.path]));
}

async function extract(
  op: Extract<ArchiveOp, { kind: 'extract' }>,
  signal: AbortSignal,
): Promise<Result<void>> {
  const format = detectFormat(op.archivePath);
  if (!format) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'unsupported archive' } };
  }
  const tool = toolFor(format);

  if (tool === 'zip') {
    const args = ['-o', op.archivePath, ...op.members, '-d', op.dest];
    const r = await exec('/usr/bin/unzip', args, { signal });
    // 11 is "nothing matched", which for a selection means the members were
    // named wrongly — a real failure, unlike unzip's warning code 1.
    if (r.code !== 0 && r.code !== 1) return failed(r.stderr || r.stdout, r.code);
    return { ok: true, value: undefined };
  }

  if (tool === 'tar') {
    const flag = tarCompressionFlag(format);
    const args = ['-xf', op.archivePath, '-C', op.dest];
    if (flag) args.splice(0, 0, flag);
    if (op.members.length > 0) args.push('--', ...op.members);
    const r = await exec('/usr/bin/tar', args, { signal });
    if (r.code !== 0) return failed(r.stderr, r.code);
    return { ok: true, value: undefined };
  }

  const bin = await sevenZipBinary();
  if (!bin) return { ok: false, error: NO_SEVEN_ZIP };
  const args = ['x', op.archivePath, `-o${op.dest}`, '-y'];
  if (op.members.length > 0) args.push('--', ...op.members);
  const r = await exec(bin, args, { signal });
  if (r.code !== 0) return failed(r.stderr, r.code);
  return { ok: true, value: undefined };
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
  const r = await runArchiveOp(token, {
    kind: 'extract',
    archivePath,
    members: memberArgs(format, [{ path: member, isDir: false }]),
    dest,
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
