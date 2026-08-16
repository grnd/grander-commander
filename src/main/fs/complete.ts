// src/main/fs/complete.ts
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { Completion, CompletionKind } from '@shared/types';

/** Enough to fill a picker; past this the user should type another character. */
export const MAX_COMPLETIONS = 200;

/**
 * Shell keywords that are not files on PATH. Without these, `cd ` would offer
 * nothing at all, since /bin/sh runs cd as a builtin.
 */
const BUILTINS = [
  'alias', 'bg', 'cd', 'command', 'echo', 'eval', 'exec', 'exit', 'export',
  'false', 'fg', 'hash', 'jobs', 'kill', 'pwd', 'read', 'set', 'shift',
  'source', 'test', 'times', 'trap', 'true', 'type', 'ulimit', 'umask',
  'unalias', 'unset', 'wait',
];

/**
 * Split a path-ish prefix into the directory the user has already committed to
 * and the fragment being typed. `src/comp` -> `src/` + `comp`; `src/` -> `src/`
 * + ``; `comp` -> `` + `comp`.
 */
function splitPrefix(prefix: string): { dirPart: string; frag: string } {
  const i = prefix.lastIndexOf('/');
  if (i < 0) return { dirPart: '', frag: prefix };
  return { dirPart: prefix.slice(0, i + 1), frag: prefix.slice(i + 1) };
}

function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return homedir() + p.slice(1);
  return p;
}

async function completePath(prefix: string, cwd: string): Promise<Completion[]> {
  const { dirPart, frag } = splitPrefix(prefix);
  const expanded = expandTilde(dirPart === '' ? './' : dirPart);
  const dir = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    // A prefix pointing at a directory that does not exist yet is normal while
    // typing; offer nothing rather than an error.
    return [];
  }

  const wantsHidden = frag.startsWith('.');
  const out: Completion[] = [];
  for (const name of names) {
    if (out.length >= MAX_COMPLETIONS) break;
    if (!name.startsWith(frag)) continue;
    if (!wantsHidden && name.startsWith('.')) continue;
    let kind: CompletionKind = 'file';
    try {
      kind = (await stat(resolve(dir, name))).isDirectory() ? 'dir' : 'file';
    } catch {
      // Dangling symlink or a race with a delete — still worth offering.
    }
    // Give back the text the user is typing, tilde and all, so inserting it
    // never rewrites the part of the line they already committed to.
    out.push({ value: dirPart + name, kind });
  }
  out.sort((a, b) => a.value.localeCompare(b.value));
  return out;
}

async function completeCommand(prefix: string): Promise<Completion[]> {
  // An empty prefix would mean "every executable on this machine"; that is not
  // a useful list, and building it costs thousands of stat calls.
  if (prefix.length === 0) return [];

  const seen = new Set<string>();
  const out: Completion[] = [];

  for (const b of BUILTINS) {
    if (b.startsWith(prefix) && !seen.has(b)) { seen.add(b); out.push({ value: b, kind: 'exec' }); }
  }

  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean);
  for (const dir of dirs) {
    if (out.length >= MAX_COMPLETIONS) break;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (out.length >= MAX_COMPLETIONS) break;
      if (!name.startsWith(prefix) || seen.has(name)) continue;
      try {
        const st = await stat(resolve(dir, name));
        if (st.isDirectory() || (st.mode & 0o111) === 0) continue;
      } catch {
        continue;
      }
      seen.add(name);
      out.push({ value: name, kind: 'exec' });
    }
  }
  out.sort((a, b) => a.value.localeCompare(b.value));
  return out;
}

export async function complete(
  prefix: string,
  cwd: string,
  kind: 'command' | 'path',
): Promise<Completion[]> {
  return kind === 'command' ? completeCommand(prefix) : completePath(prefix, cwd);
}
