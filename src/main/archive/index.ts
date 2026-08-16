// src/main/archive/index.ts
import { mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
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
 * Backslash-escape the glob metacharacters Info-ZIP would otherwise expand.
 * Without this, selecting a member literally named `*.txt` extracts every
 * `.txt` in the archive and reports success.
 */
export function escapeZipPattern(path: string): string {
  return path.replace(/[\\*?[\]]/g, (m) => `\\${m}`);
}

/**
 * Members to hand the tool for a requested set of entries.
 *
 * unzip matches members as patterns against the *stored* names, where a folder
 * is `sub/` — so a folder needs both `sub/` (the entry itself) and `sub/*` (its
 * contents), and the literal part of each is escaped. tar and 7z expand a
 * directory to its subtree on their own and take names literally after `--`.
 */
export function memberArgs(
  format: ArchiveFormat,
  members: readonly ArchiveMember[],
): string[] {
  if (toolFor(format) !== 'zip') return members.map((m) => m.path);
  return members.flatMap((m) => {
    const literal = escapeZipPattern(m.path);
    return m.isDir ? [`${literal}/`, `${literal}/*`] : [literal];
  });
}

/**
 * unzip has no `--`: it reads one as a filename pattern, so a member whose
 * name begins with `-` would be parsed as an option. Those archives are
 * extracted whole into staging instead, and the wanted members lifted out.
 */
function zipMembersUnpassable(format: ArchiveFormat, members: readonly ArchiveMember[]): boolean {
  return toolFor(format) === 'zip' && members.some((m) => m.path.startsWith('-'));
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

  // A crafted archive can carry a member named `../../x`. The extractors
  // themselves strip those, so the staged file would never be where the member
  // name says — and `join(staging, '../../x')` points outside staging
  // entirely, which could move an unrelated file into the destination.
  const escaping = op.members.find(
    (m) => m.path.startsWith('/') || m.path.split('/').includes('..'),
  );
  if (escaping) {
    return { ok: false, error: { kind: 'name-invalid', reason: `unsafe member path: ${escaping.path}` } };
  }

  // Everything is extracted into a staging directory *inside* the destination
  // first — same volume, so lifting entries out is a rename, not a copy.
  //
  // This is uniform on purpose. Extracting straight into the destination means
  // taking each tool's overwrite behaviour (`unzip -o`, tar's default, 7z `-y`)
  // and silently replacing whatever is already there. Staging lets every
  // destination be checked before anything is moved, so an extraction either
  // lands completely or changes nothing.
  let staging: string;
  try {
    staging = await mkdtemp(join(op.dest, '.gc-extract-'));
  } catch (err) {
    return { ok: false, error: mapFsError(err, op.dest) };
  }

  try {
    // A member unzip cannot be handed safely means extracting the archive whole
    // and picking the wanted entries out of staging afterwards.
    const args = zipMembersUnpassable(format, op.members)
      ? []
      : memberArgs(format, op.members);
    const r = await runExtract(format, op.archivePath, args, staging, signal);
    if (!r.ok) return r;

    // What to lift out: the requested members, or — for a whole-archive
    // extraction — everything staging ended up holding.
    let moves: { from: string; to: string }[];
    if (op.members.length > 0) {
      moves = op.members.map((m) => ({
        from: join(staging, m.path),
        // At the archive root the member's inner path *is* what the user sees;
        // deeper in, it is lifted out of the folder being browsed.
        to: join(op.dest, strip === '' ? m.path : basename(m.path)),
      }));
    } else {
      const top = await readdir(staging);
      moves = top.map((name) => ({ from: join(staging, name), to: join(op.dest, name) }));
    }

    // Preflight every destination before moving any of them, so a clash on the
    // third member does not leave the first two already extracted.
    for (const move of moves) {
      if (existsSync(move.to)) return { ok: false, error: { kind: 'exists', path: move.to } };
    }

    for (const move of moves) {
      try {
        await mkdirRecursive(dirname(move.to));
        await rename(move.from, move.to);
      } catch (err) {
        return { ok: false, error: mapFsError(err, move.from) };
      }
    }
    return { ok: true, value: undefined };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function mkdirRecursive(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true }).catch(() => {});
}

async function create(
  op: Extract<ArchiveOp, { kind: 'create' }>,
  signal: AbortSignal,
): Promise<Result<void>> {
  if (op.sources.length === 0) {
    return { ok: false, error: { kind: 'name-invalid', reason: 'nothing selected to pack' } };
  }
  // Packing onto an existing archive is destructive in a different way per
  // format — tar truncates, zip and 7z merge and keep unrelated old members —
  // so none of them are allowed to guess.
  if (existsSync(op.archivePath)) {
    return { ok: false, error: { kind: 'exists', path: op.archivePath } };
  }
  // Sources are added by basename from their shared parent, so the archive
  // holds `photo.jpg`, not `Users/me/pictures/photo.jpg`.
  const cwd = dirname(op.sources[0]);
  const names = op.sources.map((s) => basename(s));
  const tool = toolFor(op.format);

  if (tool === 'zip') {
    // -nw disables wildcard expansion of the names, and `--` (which zip only
    // accepts *after* the archive) ends option parsing. Without both, a file
    // named `-m` is read as the move flag: zip packs the other selected files
    // and then deletes the originals from disk.
    const r = await exec(
      '/usr/bin/zip',
      ['-r', '-q', '-nw', op.archivePath, '--', ...names],
      { cwd, signal },
    );
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
