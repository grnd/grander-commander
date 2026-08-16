import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareFiles, MAX_COMPARE_BYTES } from '@main/fs/compare';

let dir: string;
const write = async (name: string, content: string | Buffer) => {
  const p = join(dir, name);
  await writeFile(p, content);
  return p;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gc-compare-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('compareFiles', () => {
  it('reports identical files without producing a diff', async () => {
    const a = await write('a.txt', 'one\ntwo\n');
    const b = await write('b.txt', 'one\ntwo\n');
    const r = await compareFiles(a, b);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.identical).toBe(true);
    expect(r.value.stats).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('aligns a changed line side by side', async () => {
    const a = await write('a.txt', 'one\ntwo\nthree\n');
    const b = await write('b.txt', 'one\nTWO\nthree\n');
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.identical).toBe(false);
    expect(r.value.rows.map((x) => x.kind)).toEqual(['same', 'change', 'same']);
    expect(r.value.stats.changed).toBe(1);
  });

  it('counts additions and deletions separately', async () => {
    const a = await write('a.txt', 'one\ntwo\n');
    const b = await write('b.txt', 'one\ntwo\nthree\n');
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.stats).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it('treats CRLF and LF line endings as the same lines', async () => {
    const a = await write('a.txt', 'one\r\ntwo\r\n');
    const b = await write('b.txt', 'one\ntwo\n');
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    // Bytes differ, but every line matches.
    expect(r.value.identical).toBe(false);
    expect(r.value.rows.every((x) => x.kind === 'same')).toBe(true);
  });

  it('gives a bytes verdict for binary content instead of a line diff', async () => {
    const a = await write('a.bin', Buffer.from([0, 1, 2, 3]));
    const b = await write('b.bin', Buffer.from([0, 1, 2, 9]));
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.binary).toBe(true);
    expect(r.value.identical).toBe(false);
    expect(r.value.rows).toEqual([]);
  });

  it('recognises identical binary files', async () => {
    const bytes = Buffer.from([0, 1, 2, 3]);
    const a = await write('a.bin', bytes);
    const b = await write('b.bin', bytes);
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.binary).toBe(true);
    expect(r.value.identical).toBe(true);
  });

  it('handles comparing an empty file against a populated one', async () => {
    const a = await write('a.txt', '');
    const b = await write('b.txt', 'x\n');
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.rows.some((x) => x.kind === 'add')).toBe(true);
  });

  it('refuses a directory with a readable reason', async () => {
    const sub = join(dir, 'sub');
    await mkdir(sub);
    const b = await write('b.txt', 'x');
    const r = await compareFiles(sub, b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'name-invalid', reason: 'sub is a folder' });
  });

  it('reports a missing file as not-found', async () => {
    const b = await write('b.txt', 'x');
    const r = await compareFiles(join(dir, 'nope'), b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('not-found');
  });

  it('refuses a file larger than the read cap rather than exhausting memory', async () => {
    const big = join(dir, 'big.txt');
    await writeFile(big, Buffer.alloc(MAX_COMPARE_BYTES + 1, 0x61));
    const b = await write('b.txt', 'x');
    const r = await compareFiles(big, b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ kind: 'name-invalid' });
  });

  it('records both sizes so the caller can show them', async () => {
    const a = await write('a.txt', 'abc');
    const b = await write('b.txt', 'abcdef');
    const r = await compareFiles(a, b);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.leftSize).toBe(3);
    expect(r.value.rightSize).toBe(6);
  });
});
