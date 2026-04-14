import { describe, it, expect } from 'vitest';
import { sortEntries } from '@renderer/commands/sort';
import type { FileEntry } from '@shared/types';

const e = (over: Partial<FileEntry>): FileEntry => ({
  name: 'x', ext: '', isDir: false, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 0, mtime: 0, mode: 0, ...over,
});

describe('sortEntries', () => {
  it('puts directories before files regardless of sort column', () => {
    const src = [e({ name: 'a' }), e({ name: 'b', isDir: true })];
    const r = sortEntries(src, { col: 'name', dir: 'asc' });
    expect(r[0].name).toBe('b');
    expect(r[1].name).toBe('a');
  });

  it('sorts by name ascending', () => {
    const src = [e({ name: 'b' }), e({ name: 'a' }), e({ name: 'c' })];
    const r = sortEntries(src, { col: 'name', dir: 'asc' });
    expect(r.map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by name descending', () => {
    const src = [e({ name: 'b' }), e({ name: 'a' })];
    const r = sortEntries(src, { col: 'name', dir: 'desc' });
    expect(r.map((x) => x.name)).toEqual(['b', 'a']);
  });

  it('sorts by ext, ties break by name', () => {
    const src = [e({ name: 'b', ext: 'md' }), e({ name: 'a', ext: 'md' }), e({ name: 'c', ext: 'ts' })];
    const r = sortEntries(src, { col: 'ext', dir: 'asc' });
    expect(r.map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by size', () => {
    const src = [e({ name: 'b', size: 10 }), e({ name: 'a', size: 5 })];
    const r = sortEntries(src, { col: 'size', dir: 'asc' });
    expect(r.map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('sorts by date (mtime)', () => {
    const src = [e({ name: 'b', mtime: 200 }), e({ name: 'a', mtime: 100 })];
    const r = sortEntries(src, { col: 'date', dir: 'asc' });
    expect(r.map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('uses case-insensitive name comparison', () => {
    const src = [e({ name: 'B' }), e({ name: 'a' })];
    const r = sortEntries(src, { col: 'name', dir: 'asc' });
    expect(r.map((x) => x.name)).toEqual(['a', 'B']);
  });
});
