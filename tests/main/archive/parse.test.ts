import { describe, it, expect } from 'vitest';
import { parseSevenZipListing, parseTarListing, parseZipListing } from '@main/archive/parse';
import { detectFormat, isArchivePath, tarCompressionFlag, toolFor } from '@main/archive/format';

describe('detectFormat', () => {
  it('prefers the longest suffix', () => {
    expect(detectFormat('backup.tar.gz')).toBe('tar.gz');
    expect(detectFormat('backup.tar')).toBe('tar');
  });

  it('knows the short tar aliases', () => {
    expect(detectFormat('x.tgz')).toBe('tar.gz');
    expect(detectFormat('x.tbz2')).toBe('tar.bz2');
    expect(detectFormat('x.txz')).toBe('tar.xz');
  });

  it('is case-insensitive', () => {
    expect(detectFormat('ARCHIVE.ZIP')).toBe('zip');
  });

  it('treats a jar as a zip', () => {
    expect(detectFormat('lib.jar')).toBe('zip');
  });

  it('returns null for anything else', () => {
    expect(detectFormat('notes.txt')).toBeNull();
    expect(isArchivePath('notes.txt')).toBe(false);
    expect(isArchivePath('notes.zip')).toBe(true);
  });
});

describe('toolFor / tarCompressionFlag', () => {
  it('routes each format to its command line', () => {
    expect(toolFor('zip')).toBe('zip');
    expect(toolFor('7z')).toBe('7z');
    expect(toolFor('tar.gz')).toBe('tar');
  });

  it('maps compression to the tar flag', () => {
    expect(tarCompressionFlag('tar.gz')).toBe('-z');
    expect(tarCompressionFlag('tar.bz2')).toBe('-j');
    expect(tarCompressionFlag('tar.xz')).toBe('-J');
    expect(tarCompressionFlag('tar')).toBe('');
  });
});

describe('parseZipListing', () => {
  const output = [
    'Archive:  t.zip',
    'Zip file size: 613 bytes, number of entries: 4',
    'drwxr-xr-x  3.0 unx        0 bx stor 20260816.030928 src/',
    'drwxr-xr-x  3.0 unx        0 bx stor 20260816.030928 src/sub/',
    '-rw-r--r--  3.0 unx        5 tx stor 20260816.030928 src/sub/b.txt',
    '-rw-r--r--  3.0 unx        6 tx stor 20260816.030928 src/a.txt',
    '4 files, 11 bytes uncompressed, 11 bytes compressed:  0.0%',
  ].join('\n');

  it('ignores the header and the summary', () => {
    expect(parseZipListing(output)).toHaveLength(4);
  });

  it('strips the trailing slash from directory members', () => {
    const dirs = parseZipListing(output).filter((e) => e.isDir);
    expect(dirs.map((d) => d.path)).toEqual(['src', 'src/sub']);
  });

  it('reads size and timestamp', () => {
    const file = parseZipListing(output).find((e) => e.path === 'src/a.txt');
    expect(file?.size).toBe(6);
    expect(file?.mtime).toBe(Date.parse('2026-08-16T03:09:28'));
  });

  it('keeps spaces in member names', () => {
    const line = '-rw-r--r--  3.0 unx  5 tx stor 20260816.030928 my folder/a b.txt';
    expect(parseZipListing(line)[0].path).toBe('my folder/a b.txt');
  });

  it('returns nothing for empty output', () => {
    expect(parseZipListing('')).toEqual([]);
  });
});

describe('parseTarListing', () => {
  const NOW = Date.parse('2026-12-01T00:00:00');
  const output = [
    'drwxr-xr-x  0 grnd   wheel       0 Aug 16 03:09 src/',
    '-rw-r--r--  0 grnd   wheel       6 Aug 16 03:09 src/a.txt',
    '-rw-r--r--  0 grnd   wheel      12 Mar  1  2023 src/old.txt',
    'lrwxr-xr-x  0 grnd   wheel       0 Aug 16 03:09 src/link -> a.txt',
  ].join('\n');

  it('reads paths, sizes and directory flags', () => {
    const entries = parseTarListing(output, NOW);
    expect(entries.map((e) => e.path)).toEqual(['src', 'src/a.txt', 'src/old.txt', 'src/link']);
    expect(entries[0].isDir).toBe(true);
    expect(entries[1].size).toBe(6);
  });

  it('drops the symlink target from the member name', () => {
    const link = parseTarListing(output, NOW).find((e) => e.path === 'src/link');
    expect(link).toBeTruthy();
  });

  it('reads an explicit year when tar prints one', () => {
    const old = parseTarListing(output, NOW).find((e) => e.path === 'src/old.txt');
    expect(new Date(old!.mtime).getFullYear()).toBe(2023);
  });

  it('assumes the current year for a clock time', () => {
    const recent = parseTarListing(output, NOW).find((e) => e.path === 'src/a.txt');
    expect(new Date(recent!.mtime).getFullYear()).toBe(2026);
  });

  // tar omits the year for recent files, so "Dec 20 10:00" seen in January is
  // last December, not eleven months in the future.
  it('rolls a future-looking date back a year', () => {
    const january = Date.parse('2027-01-05T00:00:00');
    const [entry] = parseTarListing('-rw-r--r--  0 g  w  1 Dec 20 10:00 x.txt', january);
    expect(new Date(entry.mtime).getFullYear()).toBe(2026);
  });

  it('keeps spaces in member names', () => {
    const [entry] = parseTarListing('-rw-r--r--  0 g  w  1 Aug 16 03:09 my dir/a b.txt', NOW);
    expect(entry.path).toBe('my dir/a b.txt');
  });

  it('returns nothing for empty output', () => {
    expect(parseTarListing('')).toEqual([]);
  });
});

describe('parseSevenZipListing', () => {
  const output = [
    '7-Zip (z) 26.00',
    'Listing archive: t.7z',
    '--',
    'Path = t.7z',
    'Type = 7z',
    '',
    '----------',
    'Path = src',
    'Size = 0',
    'Modified = 2026-08-16 03:09:28.7604531',
    'Attributes = D drwxr-xr-x',
    '',
    'Path = src/a.txt',
    'Size = 6',
    'Modified = 2026-08-16 03:09:28.0000000',
    'Attributes = A -rw-r--r--',
    '',
  ].join('\n');

  it('skips the archive-level block before the marker', () => {
    const entries = parseSevenZipListing(output);
    expect(entries.map((e) => e.path)).toEqual(['src', 'src/a.txt']);
  });

  it('reads the directory flag from the attributes', () => {
    const entries = parseSevenZipListing(output);
    expect(entries[0].isDir).toBe(true);
    expect(entries[1].isDir).toBe(false);
  });

  it('reads size and timestamp, dropping fractional seconds', () => {
    const file = parseSevenZipListing(output)[1];
    expect(file.size).toBe(6);
    expect(file.mtime).toBe(Date.parse('2026-08-16T03:09:28'));
  });

  it('returns nothing when the marker is absent', () => {
    expect(parseSevenZipListing('7-Zip\nno entries here')).toEqual([]);
  });
});
