import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { search, cancelSearch } from '@main/fs/search';
import type { SearchQuery } from '@shared/types';

let root: string;

const BASE: Omit<SearchQuery, 'roots'> = {
  namePattern: '',
  nameIsRegex: false,
  caseSensitive: false,
  contentPattern: '',
  contentIsRegex: false,
  showHidden: false,
  minSize: null,
  maxSize: null,
  modifiedAfter: null,
  modifiedBefore: null,
};

const write = async (rel: string, content: string, mtime?: Date) => {
  const p = join(root, rel);
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, content);
  if (mtime) await utimes(p, mtime, mtime);
  return p;
};

const run = async (over: Partial<SearchQuery> = {}, token = 'tok') => {
  const r = await search(token, { ...BASE, roots: [root], ...over });
  if (!r.ok) throw new Error(`search failed: ${JSON.stringify(r.error)}`);
  return r.value;
};

const names = (v: Awaited<ReturnType<typeof run>>) => v.entries.map((e) => e.srcPath?.slice(root.length + 1)).sort();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gc-search-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('search — names', () => {
  it('finds files by glob, recursively', async () => {
    await write('a.ts', 'x');
    await write('sub/b.ts', 'x');
    await write('sub/c.js', 'x');
    expect(names(await run({ namePattern: '*.ts' }))).toEqual(['a.ts', 'sub/b.ts']);
  });

  it('finds files by regex when asked', async () => {
    await write('App.tsx', 'x');
    await write('App.js', 'x');
    expect(names(await run({ namePattern: '\\.tsx?$', nameIsRegex: true }))).toEqual(['App.tsx']);
  });

  it('returns everything under the root for an empty pattern', async () => {
    await write('a.txt', 'x');
    await write('sub/b.txt', 'x');
    expect(names(await run())).toEqual(['a.txt', 'sub', 'sub/b.txt']);
  });

  it('is case-insensitive by default', async () => {
    await write('README.md', 'x');
    expect(names(await run({ namePattern: 'readme.*' }))).toEqual(['README.md']);
    expect(names(await run({ namePattern: 'readme.*', caseSensitive: true }))).toEqual([]);
  });

  it('skips hidden files unless asked', async () => {
    await write('.env', 'x');
    expect(names(await run())).toEqual([]);
    expect(names(await run({ showHidden: true }))).toEqual(['.env']);
  });

  it('names results relative to the search root', async () => {
    await write('deep/nested/a.txt', 'x');
    const v = await run({ namePattern: 'a.txt' });
    expect(v.entries[0].name).toBe('deep/nested/a');
    expect(v.entries[0].ext).toBe('txt');
    expect(v.entries[0].srcPath).toBe(join(root, 'deep/nested/a.txt'));
  });
});

describe('search — content', () => {
  it('matches text inside files', async () => {
    await write('a.txt', 'hello world');
    await write('b.txt', 'goodbye');
    expect(names(await run({ contentPattern: 'hello' }))).toEqual(['a.txt']);
  });

  it('matches content by regex when asked', async () => {
    await write('a.txt', 'version 42');
    await write('b.txt', 'version x');
    expect(names(await run({ contentPattern: 'version \\d+', contentIsRegex: true }))).toEqual(['a.txt']);
  });

  it('respects the case toggle for content too', async () => {
    await write('a.txt', 'Hello');
    expect(names(await run({ contentPattern: 'hello' }))).toEqual(['a.txt']);
    expect(names(await run({ contentPattern: 'hello', caseSensitive: true }))).toEqual([]);
  });

  it('excludes folders when a content filter is set', async () => {
    await mkdir(join(root, 'hello-dir'));
    await write('a.txt', 'hello');
    expect(names(await run({ contentPattern: 'hello' }))).toEqual(['a.txt']);
  });

  it('skips binary files rather than matching bytes by accident', async () => {
    await writeFile(join(root, 'bin.dat'), Buffer.from([0, 0x68, 0x69, 0]));
    await write('a.txt', 'hi');
    expect(names(await run({ contentPattern: 'hi' }))).toEqual(['a.txt']);
  });

  it('combines a name filter with a content filter', async () => {
    await write('a.ts', 'needle');
    await write('a.js', 'needle');
    expect(names(await run({ namePattern: '*.ts', contentPattern: 'needle' }))).toEqual(['a.ts']);
  });
});

describe('search — size and date filters', () => {
  it('filters by minimum size', async () => {
    await write('small.txt', 'ab');
    await write('big.txt', 'a'.repeat(500));
    expect(names(await run({ minSize: 100 }))).toEqual(['big.txt']);
  });

  it('filters by maximum size', async () => {
    await write('small.txt', 'ab');
    await write('big.txt', 'a'.repeat(500));
    expect(names(await run({ maxSize: 100, namePattern: '*.txt' }))).toEqual(['small.txt']);
  });

  it('filters by modification date', async () => {
    await write('old.txt', 'x', new Date('2020-01-01'));
    await write('new.txt', 'x', new Date('2024-01-01'));
    expect(names(await run({ modifiedAfter: Date.parse('2022-01-01') }))).toEqual(['new.txt']);
    expect(names(await run({ modifiedBefore: Date.parse('2022-01-01') }))).toEqual(['old.txt']);
  });
});

describe('search — robustness', () => {
  it('searches several roots at once', async () => {
    const other = await mkdtemp(join(tmpdir(), 'gc-search2-'));
    try {
      await write('a.txt', 'x');
      await writeFile(join(other, 'b.txt'), 'x');
      const r = await search('t', { ...BASE, roots: [root, other], namePattern: '*.txt' });
      if (!r.ok) throw new Error('expected ok');
      expect(r.value.entries).toHaveLength(2);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it('rejects a root that is not a folder', async () => {
    const file = await write('plain.txt', 'x');
    const r = await search('t', { ...BASE, roots: [file] });
    expect(r.ok).toBe(false);
  });

  it('rejects an empty root list', async () => {
    const r = await search('t', { ...BASE, roots: [] });
    expect(r.ok).toBe(false);
  });

  it('reports a missing root as not-found', async () => {
    const r = await search('t', { ...BASE, roots: [join(root, 'nope')] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('not-found');
  });

  it('reports what it scanned', async () => {
    await write('a.txt', 'x');
    await write('b.txt', 'x');
    expect((await run()).scanned).toBe(2);
  });

  it('returns immediately once cancelled', async () => {
    for (let i = 0; i < 50; i++) await write(`f${i}.txt`, 'x');
    const token = 'cancel-me';
    const promise = search(token, { ...BASE, roots: [root] });
    cancelSearch(token);
    const r = await promise;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cancelled).toBe(true);
  });
});
