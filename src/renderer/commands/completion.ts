// src/renderer/commands/completion.ts
//
// Shell-line tokenising and completion insertion. Pure, so the rules about
// quotes and escaped spaces are testable without a filesystem or a DOM.

import type { Completion } from '@shared/types';

export type TokenSpan = {
  /** Raw source text of the token, escapes and quotes included. */
  text: string;
  start: number;
  end: number;
  /** 0 for the command word; later tokens are arguments. */
  index: number;
};

// `~` is deliberately absent: it only expands at the start of a word, and
// escaping it would turn a completed `~/Documents` into a literal directory
// named "~" — breaking the single most common completion there is.
const SHELL_SPECIAL_SOURCE = '[\\s\'"\\\\$`&|;<>()*?\\[\\]{}!#]';

/**
 * The token the caret sits in, or an empty token at the caret when it sits in
 * whitespace. Quotes and backslash escapes bind text together, so
 * `cp "my file` completes the quoted argument rather than the word "file".
 */
export function tokenAt(input: string, caret: number): TokenSpan {
  const clamped = Math.max(0, Math.min(caret, input.length));
  let i = 0;
  let index = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;
    const start = i;
    let quote: string | null = null;
    while (i < input.length) {
      const ch = input[i];
      if (ch === '\\' && i + 1 < input.length) { i += 2; continue; }
      if (quote) {
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
      if (/\s/.test(ch)) break;
      i++;
    }
    const end = i;
    // `>= start` so a caret parked right at a token's first character
    // completes that token rather than an empty one behind it.
    if (clamped >= start && clamped <= end) {
      return { text: input.slice(start, end), start, end, index };
    }
    if (clamped < start) break;
    index++;
  }
  return { text: '', start: clamped, end: clamped, index: countTokensBefore(input, clamped) };
}

function countTokensBefore(input: string, caret: number): number {
  const head = input.slice(0, caret);
  const matches = head.match(/(^|\s)\S/g);
  return matches ? matches.length : 0;
}

/** Strip quoting and escapes to get the literal text the filesystem sees. */
export function unescapeToken(text: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) { out += text[++i]; continue; }
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    out += ch;
  }
  return out;
}

/** Backslash-escape anything the shell would otherwise interpret. */
export function escapeToken(value: string): string {
  return value.replace(new RegExp(SHELL_SPECIAL_SOURCE, 'g'), (m) => `\\${m}`);
}

/** Longest shared leading run, used for the first-Tab partial completion. */
export function commonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0];
  for (const v of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

export type Insertion = { value: string; caret: number };

/**
 * Replace [start, end) with `replacement`, escaped for the shell. Directories
 * gain a trailing slash so the next Tab descends; anything else gains a space,
 * because the word is finished.
 */
export function applyCompletion(
  input: string,
  span: { start: number; end: number },
  replacement: string,
  opts: { kind?: Completion['kind']; terminate?: boolean } = {},
): Insertion {
  const escaped = escapeToken(replacement);
  const suffix = opts.terminate === false ? '' : opts.kind === 'dir' ? '/' : ' ';
  const value = input.slice(0, span.start) + escaped + suffix + input.slice(span.end);
  return { value, caret: span.start + escaped.length + suffix.length };
}

/**
 * Whether a token should be completed as a command name. Only the first word,
 * and only when it does not already look like a path — `./build.sh` is a file,
 * not something to look up on PATH.
 */
export function completionKindFor(token: TokenSpan): 'command' | 'path' {
  if (token.index !== 0) return 'path';
  const literal = unescapeToken(token.text);
  if (literal.includes('/') || literal.startsWith('~')) return 'path';
  return 'command';
}
