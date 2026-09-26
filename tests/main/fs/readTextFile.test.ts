import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from '@main/fs/readTextFile';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('readTextFile', () => {
  it('reads UTF-8 content and its size', async () => {
    writeFileSync(join(tmp, 'a.txt'), 'héllo\nworld');
    const r = await readTextFile(join(tmp, 'a.txt'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.content).toBe('héllo\nworld');
  });

  it('reads an empty file as an empty string', async () => {
    writeFileSync(join(tmp, 'empty.txt'), '');
    const r = await readTextFile(join(tmp, 'empty.txt'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ content: '', size: 0 });
  });

  it('rejects a file containing NUL bytes as binary', async () => {
    writeFileSync(join(tmp, 'bin'), Buffer.from([0x41, 0x00, 0x42]));
    const r = await readTextFile(join(tmp, 'bin'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('binary');
  });

  it('reports a directory rather than trying to read it', async () => {
    mkdirSync(join(tmp, 'dir'));
    const r = await readTextFile(join(tmp, 'dir'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('name-invalid');
  });

  it('reports a missing file', async () => {
    const r = await readTextFile(join(tmp, 'nope.txt'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-found');
  });
});
