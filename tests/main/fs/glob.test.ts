import { describe, it, expect } from 'vitest';
import { globToRegExpSource, nameMatcher } from '@main/fs/glob';

const glob = (pattern: string) => (name: string) =>
  new RegExp(globToRegExpSource(pattern)).test(name);

describe('globToRegExpSource', () => {
  it('anchors the whole name', () => {
    const m = glob('a.txt');
    expect(m('a.txt')).toBe(true);
    expect(m('xa.txt')).toBe(false);
    expect(m('a.txt.bak')).toBe(false);
  });

  // The point of a glob: a dot is a dot, not "any character".
  it('treats a dot literally', () => {
    expect(glob('a.txt')('axtxt')).toBe(false);
  });

  it('matches any run with *', () => {
    const m = glob('*.ts');
    expect(m('index.ts')).toBe(true);
    expect(m('.ts')).toBe(true);
    expect(m('index.tsx')).toBe(false);
  });

  it('matches exactly one character with ?', () => {
    const m = glob('report?.pdf');
    expect(m('report1.pdf')).toBe(true);
    expect(m('report.pdf')).toBe(false);
    expect(m('report12.pdf')).toBe(false);
  });

  it('supports character classes', () => {
    const m = glob('file[0-9].txt');
    expect(m('file3.txt')).toBe(true);
    expect(m('filex.txt')).toBe(false);
  });

  it('supports negated character classes with glob syntax', () => {
    const m = glob('file[!0-9].txt');
    expect(m('filex.txt')).toBe(true);
    expect(m('file3.txt')).toBe(false);
  });

  it('supports brace alternation', () => {
    const m = glob('*.{ts,tsx}');
    expect(m('a.ts')).toBe(true);
    expect(m('a.tsx')).toBe(true);
    expect(m('a.js')).toBe(false);
  });

  it('escapes regex metacharacters that are literal in a glob', () => {
    expect(glob('a+b.txt')('a+b.txt')).toBe(true);
    expect(glob('a+b.txt')('ab.txt')).toBe(false);
    expect(glob('(x).txt')('(x).txt')).toBe(true);
  });

  it('leaves an unterminated brace or bracket literal', () => {
    expect(glob('a{b')('a{b')).toBe(true);
    expect(glob('a[b')('a[b')).toBe(true);
  });
});

describe('nameMatcher', () => {
  it('matches everything for an empty pattern', () => {
    const m = nameMatcher('', false, true);
    expect(m('anything')).toBe(true);
  });

  it('is case-insensitive when asked', () => {
    expect(nameMatcher('*.TS', false, false)('index.ts')).toBe(true);
    expect(nameMatcher('*.TS', false, true)('index.ts')).toBe(false);
  });

  it('treats a regex pattern as unanchored, like every search box', () => {
    const m = nameMatcher('\\.tsx?$', true, true);
    expect(m('App.tsx')).toBe(true);
    expect(m('App.js')).toBe(false);
  });

  it('matches nothing rather than everything for an invalid regex', () => {
    expect(nameMatcher('([', true, true)('anything')).toBe(false);
  });
});
