import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
      const r = await runArchiveOp('t', { kind: 'extract', archivePath, members: [], dest, stripPrefix: '' });
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
      members: [{ path: 'src/sub', isDir: true }],
      dest,
      stripPrefix: '',
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
      members: [{ path: 'src/sub', isDir: true }],
      dest,
      stripPrefix: '',
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
    const r = await runArchiveOp('t', { kind: 'extract', archivePath, members: [], dest, stripPrefix: '' });
    expect(r.ok).toBe(true);
    expect(await readFile(join(dest, 'src', 'a.txt'), 'utf8')).toBe('hello');
  });
});

describe('memberArgs', () => {
  // unzip matches against the *stored* names, where a folder is "sub/". Passing
  // the bare path matches nothing at all.
  it('expands a folder into the entry and its contents for zip', () => {
    expect(memberArgs('zip', [{ path: 'src/sub', isDir: true }])).toEqual(['src/sub/', 'src/sub/*']);
  });

  it('leaves a zip file member alone', () => {
    expect(memberArgs('zip', [{ path: 'src/a.txt', isDir: false }])).toEqual(['src/a.txt']);
  });

  it('passes paths straight through for tar and 7z, which expand folders themselves', () => {
    const members = [{ path: 'src/sub', isDir: true }];
    expect(memberArgs('tar.gz', members)).toEqual(['src/sub']);
    expect(memberArgs('7z', members)).toEqual(['src/sub']);
  });
});

// The bug this fixes: browsing inside `src/` and copying `a.txt` used to
// recreate `src/a.txt` at the destination, because every tool preserves the
// member's full inner path.
describe('extracting relative to the folder being browsed', () => {
  for (const [format, name] of FORMATS) {
    it(`lifts a file out of its inner folder (${format})`, async () => {
      const archivePath = await pack(format, name);
      const dest = join(root, `strip-file-${format}`);
      await mkdir(dest);

      const r = await runArchiveOp('t', {
        kind: 'extract',
        archivePath,
        members: [{ path: 'src/a.txt', isDir: false }],
        dest,
        stripPrefix: 'src',
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(await readFile(join(dest, 'a.txt'), 'utf8')).toBe('hello');
      expect(existsSync(join(dest, 'src'))).toBe(false);
    });

    it(`lifts a folder out with its subtree intact (${format})`, async () => {
      const archivePath = await pack(format, name);
      const dest = join(root, `strip-dir-${format}`);
      await mkdir(dest);

      const r = await runArchiveOp('t', {
        kind: 'extract',
        archivePath,
        members: [{ path: 'src/sub', isDir: true }],
        dest,
        stripPrefix: 'src',
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(await readFile(join(dest, 'sub', 'b.txt'), 'utf8')).toBe('deep');
      expect(existsSync(join(dest, 'src'))).toBe(false);
    });
  }

  it('extracts several members at once', async () => {
    const archivePath = await pack('zip', 't.zip');
    const dest = join(root, 'strip-many');
    await mkdir(dest);

    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: [{ path: 'src/a.txt', isDir: false }, { path: 'src/sub', isDir: true }],
      dest,
      stripPrefix: 'src',
    });
    expect(r.ok).toBe(true);
    expect(existsSync(join(dest, 'a.txt'))).toBe(true);
    expect(existsSync(join(dest, 'sub', 'b.txt'))).toBe(true);
  });

  it('refuses rather than clobbering an existing name', async () => {
    const archivePath = await pack('zip', 't.zip');
    const dest = join(root, 'strip-clash');
    await mkdir(dest);
    await writeFile(join(dest, 'a.txt'), 'do not lose me');

    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: [{ path: 'src/a.txt', isDir: false }],
      dest,
      stripPrefix: 'src',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('exists');
    expect(await readFile(join(dest, 'a.txt'), 'utf8')).toBe('do not lose me');
  });

  it('leaves no staging directory behind', async () => {
    const archivePath = await pack('zip', 't.zip');
    const dest = join(root, 'strip-clean');
    await mkdir(dest);
    await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: [{ path: 'src/a.txt', isDir: false }],
      dest,
      stripPrefix: 'src',
    });
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(dest)).toEqual(['a.txt']);
  });

  it('keeps the inner path when browsing at the archive root', async () => {
    const archivePath = await pack('zip', 't.zip');
    const dest = join(root, 'strip-root');
    await mkdir(dest);
    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: [{ path: 'src', isDir: true }],
      dest,
      stripPrefix: '',
    });
    expect(r.ok).toBe(true);
    expect(existsSync(join(dest, 'src', 'a.txt'))).toBe(true);
  });
});

// Every one of these is a bug Codex found in the pre-release review.
describe('archive hardening', () => {
  // `zip` reads a file named "-m" as its move flag: it packs the other
  // selected files and then DELETES the originals from disk.
  it('treats a file named -m as a filename, not the move flag', async () => {
    await writeFile(join(src, '-m'), 'flag');
    const archivePath = join(root, 'dash.zip');
    const r = await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath,
      sources: [join(src, '-m'), join(src, 'a.txt')],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await paths(archivePath)).toEqual(['-m', 'a.txt']);
    // The whole point: the source must still be on disk.
    expect(existsSync(join(src, 'a.txt'))).toBe(true);
  });

  // unzip matches members as glob patterns, so a literal name containing a
  // star used to drag every other match out with it.
  it('extracts a member literally named *.txt without matching its siblings', async () => {
    await writeFile(join(src, '*.txt'), 'star');
    const archivePath = join(root, 'star.zip');
    await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath, sources: [join(src, '*.txt'), join(src, 'a.txt')],
    });

    const dest = join(root, 'star-out');
    await mkdir(dest);
    const r = await runArchiveOp('t', {
      kind: 'extract', archivePath, members: [{ path: '*.txt', isDir: false }], dest, stripPrefix: '',
    });
    expect(r.ok).toBe(true);
    expect(await readdir(dest)).toEqual(['*.txt']);
  });

  // unzip has no `--`, so a member starting with a dash cannot be passed as an
  // argument at all; it has to come out of a whole-archive staging pass.
  it('extracts a member whose name starts with a dash', async () => {
    await writeFile(join(src, '-x'), 'dashy');
    const archivePath = join(root, 'dashmem.zip');
    await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath, sources: [join(src, '-x'), join(src, 'a.txt')],
    });

    const dest = join(root, 'dashmem-out');
    await mkdir(dest);
    const r = await runArchiveOp('t', {
      kind: 'extract', archivePath, members: [{ path: '-x', isDir: false }], dest, stripPrefix: '',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await readFile(join(dest, '-x'), 'utf8')).toBe('dashy');
    expect(existsSync(join(dest, 'a.txt'))).toBe(false);
  });

  it('refuses to overwrite on a root-level extraction, not just a stripped one', async () => {
    const archivePath = await pack('zip', 'clobber.zip');
    const dest = join(root, 'clobber-out');
    await mkdir(dest);
    await mkdir(join(dest, 'src'));
    await writeFile(join(dest, 'src', 'precious.txt'), 'keep me');

    const r = await runArchiveOp('t', {
      kind: 'extract', archivePath, members: [{ path: 'src', isDir: true }], dest, stripPrefix: '',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('exists');
    expect(await readFile(join(dest, 'src', 'precious.txt'), 'utf8')).toBe('keep me');
  });

  it('refuses a whole-archive extraction that would clobber', async () => {
    const archivePath = await pack('tar.gz', 'whole.tar.gz');
    const dest = join(root, 'whole-out');
    await mkdir(dest);
    await mkdir(join(dest, 'src'));

    const r = await runArchiveOp('t', {
      kind: 'extract', archivePath, members: [], dest, stripPrefix: '',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('exists');
  });

  // Extraction has to be all-or-nothing: a clash on the second member must not
  // leave the first one already sitting in the destination.
  it('moves nothing when any member would clash', async () => {
    const archivePath = await pack('zip', 'partial.zip');
    const dest = join(root, 'partial-out');
    await mkdir(dest);
    await writeFile(join(dest, 'sub'), 'in the way');

    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: [{ path: 'src/a.txt', isDir: false }, { path: 'src/sub', isDir: true }],
      dest,
      stripPrefix: 'src',
    });
    expect(r.ok).toBe(false);
    expect(existsSync(join(dest, 'a.txt')), 'a.txt must not have been moved').toBe(false);
  });

  it('leaves no staging directory behind when it refuses', async () => {
    const archivePath = await pack('zip', 'leftover.zip');
    const dest = join(root, 'leftover-out');
    await mkdir(dest);
    await writeFile(join(dest, 'a.txt'), 'here');
    await runArchiveOp('t', {
      kind: 'extract', archivePath, members: [{ path: 'src/a.txt', isDir: false }], dest, stripPrefix: 'src',
    });
    expect(await readdir(dest)).toEqual(['a.txt']);
  });

  it('rejects a member path that escapes the destination', async () => {
    const archivePath = await pack('zip', 'trav.zip');
    const dest = join(root, 'trav-out');
    await mkdir(dest);
    const r = await runArchiveOp('t', {
      kind: 'extract',
      archivePath,
      members: [{ path: '../../escaped.txt', isDir: false }],
      dest,
      stripPrefix: 'src',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ kind: 'name-invalid' });
  });

  // tar truncates an existing archive; zip and 7z merge into it and keep
  // unrelated old members. None of those is a good guess.
  it('refuses to pack onto an archive that already exists', async () => {
    const archivePath = await pack('zip', 'twice.zip');
    const r = await runArchiveOp('t', {
      kind: 'create', format: 'zip', archivePath, sources: [join(src, 'a.txt')],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('exists');
  });
});
