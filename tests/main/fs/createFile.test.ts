import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFile } from '@main/fs/createFile';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('createFile', () => {
  it('creates an empty file', async () => {
    const r = await createFile(tmp, 'notes.txt');
    expect(r.ok).toBe(true);
    expect(existsSync(join(tmp, 'notes.txt'))).toBe(true);
    expect(readFileSync(join(tmp, 'notes.txt'), 'utf8')).toBe('');
  });

  it('refuses to truncate an existing file', async () => {
    writeFileSync(join(tmp, 'x.txt'), 'keep me');
    const r = await createFile(tmp, 'x.txt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
    expect(readFileSync(join(tmp, 'x.txt'), 'utf8')).toBe('keep me');
  });

  it('returns exists error if a directory with the same name exists', async () => {
    mkdirSync(join(tmp, 'x'));
    const r = await createFile(tmp, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
  });

  it('rejects names containing slash', async () => {
    const r = await createFile(tmp, 'a/b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('name-invalid');
  });

  it('rejects empty name', async () => {
    const r = await createFile(tmp, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('name-invalid');
  });
});
