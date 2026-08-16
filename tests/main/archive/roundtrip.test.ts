import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractToTemp, listArchive, memberArgs, runArchiveOp } from '@main/archive';
import { sevenZipBinary } from '@main/archive/exec';
import type { ArchiveFormat } from '@shared/types';

let root: string;
let src: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gc-arc-'));
  src = join(root, 'src');
  await mkdir(join(src, 'sub'), { recursive: true });
  await writeFile(join(src, 'a.txt'), 'hello');
  await writeFile(join(src, 'sub', 'b.txt'), 'deep');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const pack = async (format: ArchiveFormat, name: string) => {
  const archivePath = join(root, name);
  const r = await runArchiveOp('t', { kind: 'create', format, archivePath, sources: [src] });
  expect(r.ok, `pack ${format} failed: ${JSON.stringify(r)}`).toBe(true);
  return archivePath;
};

const paths = async (archivePath: string) => {
  const r = await listArchive(archivePath);
  if (!r.ok) throw new Error(`list failed: ${JSON.stringify(r.error)}`);
  return r.value.map((e) => e.path).sort();
};

// Only formats the system tools handle without extra installs; 7z is covered
// separately because macOS does not ship it.
const FORMATS: [ArchiveFormat, string][] = [
  ['zip', 't.zip'],
  ['tar', 't.tar'],
  ['tar.gz', 't.tar.gz'],
  ['tar.bz2', 't.tar.bz2'],
];

describe('archive round trip', () => {
  for (const [format, name] of FORMATS) {
    it(`packs, lists and extracts ${format}`, async () => {
      const archivePath = await pack(format, name);
      expect(await paths(archivePath)).toEqual(['src', 'src/a.txt', 'src/sub', 'src/sub/b.txt']);

      const dest = join(root, `out-${format}`);
      await mkdir(dest);
      const r = await runArchiveOp('t', { kind: 'extract', archivePath, members: [], dest });
      expect(r.ok).toBe(true);
      expect(await readFile(join(dest, 'src', 'a.txt'), 'utf8')).toBe('hello');
      expect(await readFile(join(dest, 'src', 'sub', 'b.txt'), 'utf8')).toBe('deep');
    });
  }

  it('records sizes and directory flags when listing', async () => {
    const archivePath = await pack('zip', 't.zip');
    const r = await listArchive(archivePath);
    if (!r.ok) throw new Error('expected ok');
    const file = r.value.find((e) => e.path === 'src/a.txt');
    const dir = r.value.find((e) => e.path === 'src/sub');
    expect(file?.size).toBe(5);
    expect(file?.isDir).toBe(false);
    expect(dir?.isDir).toBe(true);
  });

  it('extracts only the selected members from a zip', async () => {
    const archivePath = await pack('zip', 't.zip');
    const dest = join(root, 'partial-zip');
    await mkdir(dest);
    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: memberArgs('zip', [{ path: 'src/sub', isDir: true }]),
      dest,
    });
    expect(r.ok).toBe(true);
    expect(existsSync(join(dest, 'src', 'sub', 'b.txt'))).toBe(true);
    expect(existsSync(join(dest, 'src', 'a.txt'))).toBe(false);
  });

  it('extracts only the selected members from a tar', async () => {
    const archivePath = await pack('tar.gz', 't.tar.gz');
    const dest = join(root, 'partial-tar');
    await mkdir(dest);
    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: memberArgs('tar.gz', [{ path: 'src/sub', isDir: true }]),
      dest,
    });
    expect(r.ok).toBe(true);
    expect(existsSync(join(dest, 'src', 'sub', 'b.txt'))).toBe(true);
    expect(existsSync(join(dest, 'src', 'a.txt'))).toBe(false);
  });

  it('pulls one member out to a scratch copy for opening', async () => {
    const archivePath = await pack('zip', 't.zip');
    const r = await extractToTemp(archivePath, 'src/a.txt');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await readFile(r.value, 'utf8')).toBe('hello');
    await rm(r.value, { force: true });
  });

  it('packs from a selection by basename, not by absolute path', async () => {
    const archivePath = join(root, 'sel.zip');
    const r = await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath, sources: [join(src, 'a.txt')],
    });
    expect(r.ok).toBe(true);
    expect(await paths(archivePath)).toEqual(['a.txt']);
  });

  it('handles names with spaces and quotes without a shell', async () => {
    const odd = join(src, "it's a file.txt");
    await writeFile(odd, 'odd');
    const archivePath = join(root, 'odd.zip');
    const r = await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath, sources: [odd],
    });
    expect(r.ok).toBe(true);
    expect(await paths(archivePath)).toEqual(["it's a file.txt"]);
  });
});

describe('archive failure reporting', () => {
  it('refuses a file that is not a supported archive', async () => {
    const r = await listArchive(join(src, 'a.txt'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ kind: 'name-invalid' });
  });

  it('reports a missing archive as not-found', async () => {
    const r = await listArchive(join(root, 'nope.zip'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('not-found');
  });

  it('reports a corrupt archive rather than an empty listing', async () => {
    const bad = join(root, 'bad.tar.gz');
    await writeFile(bad, 'this is not a gzip stream');
    const r = await listArchive(bad);
    expect(r.ok).toBe(false);
  });

  it('refuses to pack nothing', async () => {
    const r = await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath: join(root, 'empty.zip'), sources: [],
    });
    expect(r.ok).toBe(false);
  });
});

describe('7-Zip', () => {
  it('round-trips when a 7z binary is installed, and explains itself when not', async () => {
    const archivePath = join(root, 't.7z');
    const packed = await runArchiveOp('t', {
      kind: 'create', format: '7z', archivePath, sources: [src],
    });
    const bin = await sevenZipBinary();

    if (!bin) {
      // The whole point of the message: say what to install.
      expect(packed.ok).toBe(false);
      if (packed.ok) return;
      expect(packed.error).toMatchObject({ kind: 'unknown' });
      expect((packed.error as { message: string }).message).toMatch(/brew install sevenzip/);
      return;
    }

    expect(packed.ok).toBe(true);
    expect(await paths(archivePath)).toEqual(['src', 'src/a.txt', 'src/sub', 'src/sub/b.txt']);
    const dest = join(root, 'out-7z');
    await mkdir(dest);
    const r = await runArchiveOp('t', { kind: 'extract', archivePath, members: [], dest });
    expect(r.ok).toBe(true);
    expect(await readFile(join(dest, 'src', 'a.txt'), 'utf8')).toBe('hello');
  });
});
