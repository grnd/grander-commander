import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from '@main/fs/mkdir';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('mkdir', () => {
  it('creates a new directory', async () => {
    const r = await mkdir(tmp, 'newdir');
    expect(r.ok).toBe(true);
    expect(existsSync(join(tmp, 'newdir'))).toBe(true);
  });

  it('returns exists error if directory already exists', async () => {
    const r1 = await mkdir(tmp, 'x');
    expect(r1.ok).toBe(true);
    const r2 = await mkdir(tmp, 'x');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe('exists');
  });

  it('returns exists error if a file with same name exists', async () => {
    writeFileSync(join(tmp, 'x'), 'hi');
    const r = await mkdir(tmp, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
  });

  it('rejects names containing slash', async () => {
    const r = await mkdir(tmp, 'a/b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('name-invalid');
  });

  it('rejects empty name', async () => {
    const r = await mkdir(tmp, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('name-invalid');
  });
});
