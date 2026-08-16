import { describe, it, expect } from 'vitest';
import { normalizePath, parseCdCommand, resolvePath } from '@renderer/commands/cd';

const HOME = '/Users/me';
const CWD = '/Users/me/projects/app';
const cd = (input: string) => parseCdCommand(input, CWD, HOME);

describe('normalizePath', () => {
  it('collapses . and .. and doubled slashes', () => {
    expect(normalizePath('/a/./b//c')).toBe('/a/b/c');
    expect(normalizePath('/a/b/../c')).toBe('/a/c');
  });

  it('cannot be walked above the root', () => {
    expect(normalizePath('/a/../../..')).toBe('/');
  });

  it('keeps the root itself', () => {
    expect(normalizePath('/')).toBe('/');
  });
});

describe('resolvePath', () => {
  it('resolves a relative path against the panel folder', () => {
    expect(resolvePath('src', CWD, HOME)).toBe('/Users/me/projects/app/src');
  });

  it('walks up with ..', () => {
    expect(resolvePath('../..', CWD, HOME)).toBe('/Users/me');
  });

  it('takes an absolute path as given', () => {
    expect(resolvePath('/etc/hosts', CWD, HOME)).toBe('/etc/hosts');
  });

  it('expands ~ and ~/', () => {
    expect(resolvePath('~', CWD, HOME)).toBe('/Users/me');
    expect(resolvePath('~/Documents', CWD, HOME)).toBe('/Users/me/Documents');
  });

  // A folder that merely starts with a tilde is not a home reference.
  it('does not expand a bare ~name', () => {
    expect(resolvePath('~weird', CWD, HOME)).toBe('/Users/me/projects/app/~weird');
  });
});

describe('parseCdCommand', () => {
  it('sends a bare cd home, as every shell does', () => {
    expect(cd('cd')).toBe('/Users/me');
    expect(cd('  cd  ')).toBe('/Users/me');
  });

  it('resolves the target against the panel folder', () => {
    expect(cd('cd src')).toBe('/Users/me/projects/app/src');
    expect(cd('cd ..')).toBe('/Users/me/projects');
    expect(cd('cd /tmp')).toBe('/tmp');
    expect(cd('cd ~/Documents')).toBe('/Users/me/Documents');
  });

  it('understands an escaped or quoted name with spaces', () => {
    expect(cd('cd my\\ folder')).toBe('/Users/me/projects/app/my folder');
    expect(cd('cd "my folder"')).toBe('/Users/me/projects/app/my folder');
  });

  // Unquoted spaces are far more likely to be one careless folder name than
  // two arguments to cd.
  it('treats the whole remainder as the path', () => {
    expect(cd('cd my folder')).toBe('/Users/me/projects/app/my folder');
  });

  it('leaves every other command to the shell', () => {
    expect(cd('ls -la')).toBeNull();
    expect(cd('cdfoo')).toBeNull();
    expect(cd('echo cd')).toBeNull();
    expect(cd('')).toBeNull();
  });

  // Panels keep no history to go back to, and quietly going home instead would
  // be worse than letting the shell report it.
  it('passes cd - through rather than guessing', () => {
    expect(cd('cd -')).toBeNull();
  });
});
