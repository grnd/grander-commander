import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyFile } from '@main/fs/copyFile';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gc-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('copyFile', () => {
  it('copies a small file', async () => {
    const src = join(tmp, 'a.txt');
    const dst = join(tmp, 'b.txt');
    writeFileSync(src, 'hello');

    const r = await copyFile(src, dst, { onProgress: () => {}, signal: undefined });

    expect(r.ok).toBe(true);
    expect(readFileSync(dst, 'utf8')).toBe('hello');
  });

  it('reports progress during copy', async () => {
    const src = join(tmp, 'big.bin');
    const dst = join(tmp, 'big.out');
    writeFileSync(src, Buffer.alloc(3 * 1024 * 1024, 0x41));
    const events: number[] = [];

    const r = await copyFile(src, dst, { onProgress: (n) => events.push(n), signal: undefined });

    expect(r.ok).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[events.length - 1]).toBe(statSync(src).size);
  });

  it('aborts on signal and removes a new partial destination', async () => {
    const src = join(tmp, 'big.bin');
    const dst = join(tmp, 'big.out');
    writeFileSync(src, Buffer.alloc(5 * 1024 * 1024, 0x42));
    const ac = new AbortController();

    const r = await copyFile(src, dst, {
      onProgress: () => ac.abort(),
      signal: ac.signal,
    });

    expect(r.ok).toBe(false);
    expect(existsSync(dst)).toBe(false);
  });

  it('preserves the previous destination when an overwrite is aborted', async () => {
    const src = join(tmp, 'big.bin');
    const dst = join(tmp, 'big.out');
    writeFileSync(src, Buffer.alloc(5 * 1024 * 1024, 0x42));
    writeFileSync(dst, 'keep-me');
    const ac = new AbortController();

    const r = await copyFile(src, dst, {
      overwrite: true,
      onProgress: () => ac.abort(),
      signal: ac.signal,
    });

    expect(r.ok).toBe(false);
    expect(readFileSync(dst, 'utf8')).toBe('keep-me');
  });

  it('returns exists if dst already exists and overwrite=false', async () => {
    writeFileSync(join(tmp, 'a'), 'x');
    writeFileSync(join(tmp, 'b'), 'y');

    const r = await copyFile(join(tmp, 'a'), join(tmp, 'b'), {
      onProgress: () => {},
      signal: undefined,
      overwrite: false,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
  });

  it('rejects copying onto the same inode', async () => {
    const src = join(tmp, 'same.txt');
    writeFileSync(src, 'x');

    const r = await copyFile(src, src, { onProgress: () => {}, signal: undefined, overwrite: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
  });

  it('rejects overwriting a target with a symlink source that resolves to that target', async () => {
    const target = join(tmp, 'target.txt');
    const link = join(tmp, 'link.txt');
    writeFileSync(target, 'IMPORTANT');
    symlinkSync('target.txt', link);

    const r = await copyFile(link, target, { onProgress: () => {}, signal: undefined, overwrite: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
    expect(lstatSync(target).isFile()).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('IMPORTANT');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe('target.txt');
  });

  it('preserves a self-referential symlink without resolving its target', async () => {
    const src = join(tmp, 'loop');
    const dst = join(tmp, 'loop-copy');
    symlinkSync('loop', src);

    const r = await copyFile(src, dst, { onProgress: () => {}, signal: undefined });

    expect(r.ok).toBe(true);
    expect(lstatSync(dst).isSymbolicLink()).toBe(true);
    expect(readlinkSync(dst)).toBe('loop');
  });

  it('copies directories recursively, preserving symlinks and basic metadata', async () => {
    const src = join(tmp, 'src-dir');
    const nested = join(src, 'nested');
    const dst = join(tmp, 'dst-dir');
    const file = join(nested, 'file.txt');
    const link = join(src, 'file-link');
    const expectedMtime = new Date('2020-01-02T03:04:05.000Z');

    mkdirSync(nested, { recursive: true });
    writeFileSync(file, 'nested-data');
    chmodSync(file, 0o744);
    utimesSync(file, expectedMtime, expectedMtime);
    symlinkSync('nested/file.txt', link);

    const r = await copyFile(src, dst, { onProgress: () => {}, signal: undefined });

    expect(r.ok).toBe(true);
    expect(readFileSync(join(dst, 'nested', 'file.txt'), 'utf8')).toBe('nested-data');
    expect(lstatSync(join(dst, 'file-link')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(dst, 'file-link'))).toBe('nested/file.txt');
    expect(statSync(join(dst, 'nested', 'file.txt')).mode & 0o777).toBe(0o744);
    expect(Math.abs(statSync(join(dst, 'nested', 'file.txt')).mtimeMs - expectedMtime.getTime())).toBeLessThan(2000);
  });

  it('rejects copying a directory into its own descendant without creating temp paths', async () => {
    const src = join(tmp, 'src-dir');
    const nestedParent = join(src, 'nested');
    const dst = join(nestedParent, 'copy');

    mkdirSync(nestedParent, { recursive: true });
    writeFileSync(join(src, 'file.txt'), 'root');

    const r = await copyFile(src, dst, { onProgress: () => {}, signal: undefined });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('unknown');
    expect(existsSync(dst)).toBe(false);
    expect(readdirSync(nestedParent)).toEqual([]);
  });
});
