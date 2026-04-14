import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyFile } from '@main/fs/copyFile';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

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
    writeFileSync(src, Buffer.alloc(3 * 1024 * 1024, 0x41)); // 3 MB
    const events: number[] = [];
    const r = await copyFile(src, dst, { onProgress: (n) => events.push(n), signal: undefined });
    expect(r.ok).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[events.length - 1]).toBe(statSync(src).size);
  });

  it('aborts on signal and removes partial file', async () => {
    const src = join(tmp, 'big.bin');
    const dst = join(tmp, 'big.out');
    writeFileSync(src, Buffer.alloc(5 * 1024 * 1024, 0x42)); // 5 MB
    const ac = new AbortController();
    const p = copyFile(src, dst, { onProgress: () => { ac.abort(); }, signal: ac.signal });
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind === 'unknown' || r.error.kind === 'not-found').toBe(true);
    expect(existsSync(dst)).toBe(false);
  });

  it('returns exists if dst already exists and overwrite=false', async () => {
    writeFileSync(join(tmp, 'a'), 'x');
    writeFileSync(join(tmp, 'b'), 'y');
    const r = await copyFile(join(tmp, 'a'), join(tmp, 'b'), { onProgress: () => {}, signal: undefined, overwrite: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('exists');
  });

  it('overwrites when overwrite=true', async () => {
    writeFileSync(join(tmp, 'a'), 'new');
    writeFileSync(join(tmp, 'b'), 'old');
    const r = await copyFile(join(tmp, 'a'), join(tmp, 'b'), { onProgress: () => {}, signal: undefined, overwrite: true });
    expect(r.ok).toBe(true);
    expect(readFileSync(join(tmp, 'b'), 'utf8')).toBe('new');
  });
});
