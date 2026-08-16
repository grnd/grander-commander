import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readChunk } from '@main/fs/readChunk';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gc-readchunk-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readChunk', () => {
  it('reads from an offset and reports the whole-file size', async () => {
    const file = join(dir, 'a.txt');
    await writeFile(file, 'abcdefghij');

    const r = await readChunk(file, 3, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new TextDecoder().decode(r.value.bytes)).toBe('defg');
    expect(r.value.size).toBe(10);
  });

  it('clamps a read that runs past the end instead of erroring', async () => {
    const file = join(dir, 'a.txt');
    await writeFile(file, 'abc');

    const r = await readChunk(file, 2, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new TextDecoder().decode(r.value.bytes)).toBe('c');
  });

  it('returns an empty window when the offset is past EOF', async () => {
    const file = join(dir, 'a.txt');
    await writeFile(file, 'abc');

    const r = await readChunk(file, 99, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bytes).toHaveLength(0);
    expect(r.value.size).toBe(3);
  });

  it('handles an empty file', async () => {
    const file = join(dir, 'empty');
    await writeFile(file, '');

    const r = await readChunk(file, 0, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bytes).toHaveLength(0);
    expect(r.value.size).toBe(0);
  });

  it('reports a missing file as not-found', async () => {
    const r = await readChunk(join(dir, 'nope'), 0, 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('not-found');
  });

  it('refuses a directory rather than returning garbage', async () => {
    const sub = join(dir, 'sub');
    await mkdir(sub);

    const r = await readChunk(sub, 0, 10);
    expect(r.ok).toBe(false);
  });

  it('preserves raw bytes, including NUL', async () => {
    const file = join(dir, 'bin');
    await writeFile(file, Buffer.from([0x00, 0xff, 0x41]));

    const r = await readChunk(file, 0, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.value.bytes]).toEqual([0x00, 0xff, 0x41]);
  });
});
