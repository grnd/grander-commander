import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deletePaths } from '@main/fs/delete';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('deletePaths', () => {
  it('removes a file', async () => {
    const p = join(tmp, 'a.txt');
    writeFileSync(p, 'hi');
    const r = await deletePaths([p]);
    expect(r.ok).toBe(true);
    expect(existsSync(p)).toBe(false);
  });

  it('removes a directory recursively', async () => {
    const d = join(tmp, 'dir');
    mkdirSync(d);
    writeFileSync(join(d, 'x'), 'x');
    const r = await deletePaths([d]);
    expect(r.ok).toBe(true);
    expect(existsSync(d)).toBe(false);
  });

  it('ignores missing paths (idempotent)', async () => {
    const r = await deletePaths([join(tmp, 'nope')]);
    expect(r.ok).toBe(true);
  });

  it('removes multiple paths', async () => {
    writeFileSync(join(tmp, 'a'), 'x');
    writeFileSync(join(tmp, 'b'), 'x');
    const r = await deletePaths([join(tmp, 'a'), join(tmp, 'b')]);
    expect(r.ok).toBe(true);
    expect(existsSync(join(tmp, 'a'))).toBe(false);
    expect(existsSync(join(tmp, 'b'))).toBe(false);
  });
});
