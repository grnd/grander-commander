// src/renderer/commands/cd.ts
//
// `cd` typed into the command line has to move the *panel*. Handing it to the
// shell accomplishes nothing at all: the child process changes its own working
// directory and then exits, leaving the panel where it was and popping an empty
// output box.

import { unescapeToken } from './completion';

/**
 * Collapse `.` and `..` and any doubled slashes. The renderer has no
 * node:path, and the answer has to be absolute for listDir either way.
 */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return `/${out.join('/')}`;
}

/** Resolve a user-typed path against the panel's folder. */
export function resolvePath(target: string, cwd: string, home: string): string {
  if (target === '~') return normalizePath(home);
  if (target.startsWith('~/')) return normalizePath(`${home}/${target.slice(2)}`);
  if (target.startsWith('/')) return normalizePath(target);
  return normalizePath(`${cwd}/${target}`);
}

/**
 * The folder a command line means, or null when it is not a `cd` at all and
 * should go to the shell as usual.
 *
 * Bare `cd` goes home, matching every shell. `cd -` is deliberately not
 * handled: panels keep no history to return to yet, and silently going home
 * instead would be worse than passing it through.
 */
export function parseCdCommand(input: string, cwd: string, home: string): string | null {
  const trimmed = input.trim();
  if (trimmed !== 'cd' && !/^cd\s/.test(trimmed)) return null;

  const rest = trimmed.slice(2).trim();
  if (rest === '-') return null;
  if (rest === '') return normalizePath(home);
  // The whole remainder is the path: an unquoted folder name with spaces is
  // far more likely than someone passing cd two arguments.
  return resolvePath(unescapeToken(rest), cwd, home);
}
