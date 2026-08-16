// src/main/fs/glob.ts

/**
 * Translate a shell-style filename glob into a RegExp source anchored to the
 * whole name. Supported: `*` (any run, including none), `?` (one character),
 * `[abc]` / `[!abc]` character classes, and `{a,b}` alternation. Everything
 * else is literal — a `.` in a filename is a dot, not "any character", which is
 * the whole reason searching by glob feels different from searching by regex.
 */
export function globToRegExpSource(glob: string): string {
  return `^${globBody(glob)}$`;
}

/** The same translation without anchors, so alternations can nest. */
function globBody(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') { out += '.*'; i++; continue; }
    if (ch === '?') { out += '.'; i++; continue; }
    if (ch === '{') {
      const end = glob.indexOf('}', i);
      if (end > i) {
        const parts = glob.slice(i + 1, end).split(',');
        out += `(?:${parts.map((p) => globBody(p)).join('|')})`;
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end > i + 1) {
        let body = glob.slice(i + 1, end);
        // Glob spells negation `!`, regex spells it `^`.
        if (body.startsWith('!')) body = `^${body.slice(1)}`;
        out += `[${body}]`;
        i = end + 1;
        continue;
      }
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i++;
  }
  return out;
}

/**
 * Build the name matcher for a search. An empty pattern matches everything, so
 * a content-only search does not need a name filter typed into it.
 */
export function nameMatcher(
  pattern: string,
  isRegex: boolean,
  caseSensitive: boolean,
): (name: string) => boolean {
  if (pattern === '') return () => true;
  const flags = caseSensitive ? '' : 'i';
  let re: RegExp;
  try {
    re = new RegExp(isRegex ? pattern : globToRegExpSource(pattern), flags);
  } catch {
    // An unfinished regex should not match everything mid-typing.
    return () => false;
  }
  // A user-supplied regex is a "contains" search unless they anchor it, which
  // is what every other search box does; a glob is anchored by construction.
  return (name: string) => re.test(name);
}
