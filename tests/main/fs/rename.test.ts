import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rename } from '@main/fs/rename';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('rename', () => {
  it('renames a file in place', async () => {
    writeFileSync(join(tmp, 'a.txt'), 'hi');
    const r = await rename(join(tmp, 'a.txt'), join(tmp, 'b.txt'));
    expect(r.ok).toBe(true);
    expect(existsSync(join(tmp, 'a.txt'))).toBe(false);
    expect(existsSync(join(tmp, 'b.txt'))).toBe(true);
  });

  it('returns not-found for missing source', async () => {
    const r = await rename(join(tmp, 'nope'), join(tmp, 'x'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-found');
  });

  it('returns exists if target exists', async () => {
    writeFileSync(join(tmp, 'a'), 'x');
    writeFileSync(join(tmp, 'b'), 'y');
    const r = await rename(join(tmp, 'a'), join(tmp, 'b'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
  });

  it('rejects invalid target name (empty basename)', async () => {
    writeFileSync(join(tmp, 'a'), 'x');
    const r = await rename(join(tmp, 'a'), join(tmp, ''));
    expect(r.ok).toBe(false);
  });
});
