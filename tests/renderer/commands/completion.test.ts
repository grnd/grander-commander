import { describe, it, expect } from 'vitest';
import {
  applyCompletion, commonPrefix, completionKindFor, escapeToken, tokenAt, unescapeToken,
} from '@renderer/commands/completion';

describe('tokenAt', () => {
  it('returns the word under the caret', () => {
    expect(tokenAt('git status', 8)).toMatchObject({ text: 'status', start: 4, end: 10, index: 1 });
  });

  it('marks the command word as index 0', () => {
    expect(tokenAt('gi', 2).index).toBe(0);
  });

  it('returns an empty token when the caret sits after a space', () => {
    const t = tokenAt('ls ', 3);
    expect(t.text).toBe('');
    expect(t.start).toBe(3);
    expect(t.index).toBe(1);
  });

  it('keeps a backslash-escaped space inside one token', () => {
    expect(tokenAt('cat my\\ fi', 10).text).toBe('my\\ fi');
  });

  it('keeps a double-quoted argument together', () => {
    expect(tokenAt('cp "my file', 11).text).toBe('"my file');
  });

  it('keeps a single-quoted argument together', () => {
    expect(tokenAt("cp 'my file", 11).text).toBe("'my file");
  });

  it('handles an empty line', () => {
    expect(tokenAt('', 0)).toMatchObject({ text: '', start: 0, end: 0, index: 0 });
  });

  it('completes the token the caret is inside, not the one after it', () => {
    expect(tokenAt('cp src dst', 6).text).toBe('src');
  });

  it('tolerates a caret past the end of the string', () => {
    expect(tokenAt('ls', 99).text).toBe('ls');
  });
});

describe('unescapeToken', () => {
  it('drops backslash escapes', () => {
    expect(unescapeToken('my\\ file')).toBe('my file');
  });

  it('drops surrounding quotes', () => {
    expect(unescapeToken('"my file"')).toBe('my file');
    expect(unescapeToken("'my file")).toBe('my file');
  });

  it('leaves ordinary text alone', () => {
    expect(unescapeToken('src/index.ts')).toBe('src/index.ts');
  });
});

describe('escapeToken', () => {
  it('escapes spaces and shell metacharacters', () => {
    expect(escapeToken('my file')).toBe('my\\ file');
    expect(escapeToken('a&b')).toBe('a\\&b');
    expect(escapeToken("it's")).toBe("it\\'s");
  });

  it('leaves slashes alone so paths stay readable', () => {
    expect(escapeToken('src/components')).toBe('src/components');
  });

  it('leaves a leading tilde unescaped so ~/ still expands', () => {
    expect(escapeToken('~/Documents')).toBe('~/Documents');
  });
});

describe('commonPrefix', () => {
  it('finds the shared head', () => {
    expect(commonPrefix(['components', 'commands', 'common'])).toBe('com');
    expect(commonPrefix(['commands', 'common'])).toBe('comm');
  });

  it('returns the single value untouched', () => {
    expect(commonPrefix(['only'])).toBe('only');
  });

  it('returns empty when nothing is shared', () => {
    expect(commonPrefix(['abc', 'xyz'])).toBe('');
  });

  it('returns empty for no values', () => {
    expect(commonPrefix([])).toBe('');
  });
});

describe('applyCompletion', () => {
  it('appends a slash after a directory so the next Tab descends', () => {
    expect(applyCompletion('cd src', { start: 3, end: 6 }, 'src', { kind: 'dir' }))
      .toEqual({ value: 'cd src/', caret: 7 });
  });

  it('appends a space after a file', () => {
    expect(applyCompletion('cat a', { start: 4, end: 5 }, 'a.txt', { kind: 'file' }))
      .toEqual({ value: 'cat a.txt ', caret: 10 });
  });

  it('adds no terminator while cycling candidates', () => {
    expect(applyCompletion('cd c', { start: 3, end: 4 }, 'common', { kind: 'dir', terminate: false }))
      .toEqual({ value: 'cd common', caret: 9 });
  });

  it('escapes a completed name that contains a space', () => {
    expect(applyCompletion('cat my', { start: 4, end: 6 }, 'my file.txt', { kind: 'file' }).value)
      .toBe('cat my\\ file.txt ');
  });

  it('preserves text after the caret', () => {
    expect(applyCompletion('cp a dst', { start: 3, end: 4 }, 'abc', { kind: 'file' }).value)
      .toBe('cp abc  dst');
  });
});

describe('completionKindFor', () => {
  it('completes the first bare word as a command', () => {
    expect(completionKindFor(tokenAt('gi', 2))).toBe('command');
  });

  it('completes later words as paths', () => {
    expect(completionKindFor(tokenAt('git sta', 7))).toBe('path');
  });

  it('completes a first word containing a slash as a path', () => {
    expect(completionKindFor(tokenAt('./buil', 6))).toBe('path');
  });

  it('completes a first word starting with ~ as a path', () => {
    expect(completionKindFor(tokenAt('~/bin/to', 8))).toBe('path');
  });
});
