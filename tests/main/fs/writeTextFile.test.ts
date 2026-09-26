import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '@main/fs/writeTextFile';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('writeTextFile', () => {
  it('creates a file with the given content', async () => {
    const r = await writeTextFile(join(tmp, 'a.txt'), 'hello');
    expect(r.ok).toBe(true);
    expect(readFileSync(join(tmp, 'a.txt'), 'utf8')).toBe('hello');
  });

  it('overwrites existing content', async () => {
    writeFileSync(join(tmp, 'a.txt'), 'old');
    const r = await writeTextFile(join(tmp, 'a.txt'), 'new');
    expect(r.ok).toBe(true);
    expect(readFileSync(join(tmp, 'a.txt'), 'utf8')).toBe('new');
  });

  it('leaves no temp file behind on success', async () => {
    await writeTextFile(join(tmp, 'a.txt'), 'hello');
    expect(readdirSync(tmp)).toEqual(['a.txt']);
  });

  it('reports a missing destination directory', async () => {
    const r = await writeTextFile(join(tmp, 'no', 'such', 'a.txt'), 'hello');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-found');
  });
});
