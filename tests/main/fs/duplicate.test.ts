import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { duplicate } from '@main/fs/duplicate';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gc-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('duplicate', () => {
  it('duplicates directories recursively without dereferencing symlinks', async () => {
    const src = join(tmp, 'folder');
    mkdirSync(join(src, 'nested'), { recursive: true });
    writeFileSync(join(src, 'nested', 'file.txt'), 'hello');
    symlinkSync('nested/file.txt', join(src, 'link.txt'));

    const r = await duplicate(src);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(readFileSync(join(r.value, 'nested', 'file.txt'), 'utf8')).toBe('hello');
    expect(readlinkSync(join(r.value, 'link.txt'))).toBe('nested/file.txt');
  });
});
