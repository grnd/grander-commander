// src/renderer/commands/multirename.ts
//
// Planning and execution for the multi-rename tool. Planning is pure so the
// preview table the user approves is computed by exactly the code that later
// performs the renames — there is no second, drifting implementation.

import type { Result } from '@shared/types';
import { joinPath } from '@renderer/state/panelSlice';

export type CaseTransform = 'none' | 'lower' | 'upper' | 'title' | 'sentence';
export type RenameScope = 'name' | 'ext' | 'full';

export type RenameRule = {
  /** Regex source, or a literal when `useRegex` is false. Empty = no substitution. */
  find: string;
  /** Replacement; supports $1..$9 backreferences when `useRegex` is on. */
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  /** Which part of the filename find/replace sees. */
  applyTo: RenameScope;
  /** Placeholders: {name} {ext} {n}. */
  nameTemplate: string;
  extTemplate: string;
  caseTransform: CaseTransform;
  counterStart: number;
  counterStep: number;
  /** Zero-pad the counter to this many digits. */
  counterWidth: number;
};

export type RenamePreviewRow = {
  oldName: string;
  newName: string;
  changed: boolean;
  /** Non-null makes the row un-appliable and blocks the whole batch. */
  error: string | null;
};

export type RenamePlan = {
  rows: RenamePreviewRow[];
  /** Set when `find` is not a valid regex; every row falls back to unchanged. */
  regexError: string | null;
  /** Rows that would actually move, and whose names are all legal. */
  applicable: RenamePreviewRow[];
  blocked: boolean;
};

export function defaultRenameRule(): RenameRule {
  return {
    find: '',
    replace: '',
    useRegex: true,
    caseSensitive: true,
    applyTo: 'name',
    nameTemplate: '{name}',
    extTemplate: '{ext}',
    caseTransform: 'none',
    counterStart: 1,
    counterStep: 1,
    counterWidth: 1,
  };
}

/**
 * Split on the last dot, matching listDir's rule: a leading dot is part of the
 * name (".gitignore" has no extension), so hidden files keep their identity.
 */
export function splitName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.');
  if (i <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, i), ext: name.slice(i + 1) };
}

function joinName(base: string, ext: string): string {
  return ext ? `${base}.${ext}` : base;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyCase(text: string, mode: CaseTransform): string {
  switch (mode) {
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'title':
      return text.toLowerCase().replace(/(^|[\s\-_.])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
    case 'sentence': {
      const lower = text.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    default: return text;
  }
}

function fillTemplate(tpl: string, vars: { name: string; ext: string; n: string }): string {
  // One pass, so a {name} that expands to text containing "{n}" is not
  // re-expanded — the user's data must never be read as template syntax.
  return tpl.replace(/\{(name|ext|n)\}/g, (_m, key: 'name' | 'ext' | 'n') => vars[key]);
}

function counterFor(rule: RenameRule, index: number): string {
  const value = rule.counterStart + index * rule.counterStep;
  const digits = Math.max(1, Math.min(12, Math.trunc(rule.counterWidth) || 1));
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(value)).padStart(digits, '0');
}

const MAX_NAME_LENGTH = 255;

function validate(name: string): string | null {
  if (name.length === 0) return 'empty name';
  if (name === '.' || name === '..') return 'reserved name';
  if (name.includes('/')) return 'contains /';
  if (name.includes('\u0000')) return 'contains NUL';
  if (name.length > MAX_NAME_LENGTH) return 'too long';
  return null;
}

/**
 * Build the preview. `existingNames` are the other entries in the directory —
 * names that are not being renamed but that a new name could still collide
 * with. Comparison is case-insensitive because APFS is, by default: renaming
 * `A.txt` to `a.TXT` is a case change, but `B.txt` -> `a.TXT` clobbers.
 */
export function buildRenamePlan(
  names: string[],
  rule: RenameRule,
  existingNames: Iterable<string> = [],
): RenamePlan {
  let re: RegExp | null = null;
  let regexError: string | null = null;
  if (rule.find) {
    const flags = rule.caseSensitive ? 'g' : 'gi';
    try {
      re = new RegExp(rule.useRegex ? rule.find : escapeRegExp(rule.find), flags);
    } catch (err) {
      regexError = err instanceof Error ? err.message : String(err);
    }
  }
  // In literal mode `$&` and friends in the replacement are data, not syntax.
  const replacement = rule.useRegex ? rule.replace : rule.replace.replace(/\$/g, '$$$$');

  const substitute = (text: string): string => (re ? text.replace(re, replacement) : text);

  const rows: RenamePreviewRow[] = names.map((oldName, index) => {
    let { base, ext } = splitName(oldName);
    if (!regexError) {
      if (rule.applyTo === 'name') base = substitute(base);
      else if (rule.applyTo === 'ext') ext = substitute(ext);
      else {
        const whole = substitute(joinName(base, ext));
        ({ base, ext } = splitName(whole));
      }
    }

    const n = counterFor(rule, index);
    let newBase = fillTemplate(rule.nameTemplate, { name: base, ext, n });
    let newExt = fillTemplate(rule.extTemplate, { name: base, ext, n });

    newBase = applyCase(newBase, rule.caseTransform);
    // Extensions are not words, so title/sentence casing leaves them alone —
    // "Report.Txt" is nobody's intent.
    if (rule.caseTransform === 'lower' || rule.caseTransform === 'upper') {
      newExt = applyCase(newExt, rule.caseTransform);
    }

    const newName = joinName(newBase, newExt);
    return {
      oldName,
      newName,
      changed: newName !== oldName,
      error: validate(newName),
    };
  });

  // Collision pass: within the batch, and against untouched neighbours.
  const renamedFrom = new Set(names.map((n) => n.toLowerCase()));
  const outsiders = new Set(
    [...existingNames].map((n) => n.toLowerCase()).filter((n) => !renamedFrom.has(n)),
  );
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.error) continue;
    const key = row.newName.toLowerCase();
    if (outsiders.has(key)) { row.error = 'name already taken'; continue; }
    const prior = seen.get(key);
    if (prior !== undefined) {
      row.error = 'duplicate in batch';
      // The first row to claim the name is equally at fault; flag it too, so
      // the user can see both halves of the clash.
      if (rows[prior].error === null) rows[prior].error = 'duplicate in batch';
      continue;
    }
    seen.set(key, i);
  }

  const applicable = rows.filter((r) => r.changed && r.error === null);
  return {
    rows,
    regexError,
    applicable,
    blocked: regexError !== null || rows.some((r) => r.error !== null),
  };
}

export type RenameApi = {
  fs: { rename(from: string, to: string): Promise<Result<void>> };
};

export type RenameOutcome = {
  renamed: number;
  failures: { name: string; reason: string }[];
};

function describeReason(error: unknown): string {
  if (!error || typeof error !== 'object' || !('kind' in error)) return 'unknown error';
  const e = error as { kind: string; message?: string; reason?: string };
  return e.message ?? e.reason ?? e.kind;
}

/**
 * Apply a plan inside one directory.
 *
 * When any new name is also an old name — a swap, or a shift like 1->2, 2->3 —
 * renaming in order would destroy a file. Those batches go through unique
 * temporary names first, which is what makes `{n}`-driven renumbering safe.
 */
export async function applyRenamePlan(
  api: RenameApi,
  dir: string,
  rows: RenamePreviewRow[],
): Promise<RenameOutcome> {
  const moves = rows.filter((r) => r.changed && r.error === null);
  if (moves.length === 0) return { renamed: 0, failures: [] };

  const oldNames = new Set(moves.map((m) => m.oldName.toLowerCase()));
  const needsTwoPhase = moves.some((m) => oldNames.has(m.newName.toLowerCase()));
  const failures: RenameOutcome['failures'] = [];
  let renamed = 0;

  if (!needsTwoPhase) {
    for (const m of moves) {
      const r = await api.fs.rename(joinPath(dir, m.oldName), joinPath(dir, m.newName));
      if (r.ok) renamed++;
      else failures.push({ name: m.oldName, reason: describeReason(r.error) });
    }
    return { renamed, failures };
  }

  const stamp = `gcmr-${Date.now().toString(36)}`;
  const staged: { temp: string; final: string; oldName: string }[] = [];

  const unstage = async () => {
    for (const s of staged) {
      const back = await api.fs.rename(joinPath(dir, s.temp), joinPath(dir, s.oldName));
      if (!back.ok) {
        // The worst outcome in this whole routine: a file left under a hidden
        // temporary name. Say exactly where it is rather than losing it.
        failures.push({
          name: s.oldName,
          reason: `left as ${s.temp} — could not restore: ${describeReason(back.error)}`,
        });
      }
    }
  };

  // Staging is all-or-nothing. A half-staged batch has originals sitting under
  // dotted temporary names with nothing to complete them.
  for (const [i, m] of moves.entries()) {
    const temp = `.${stamp}-${i}`;
    const r = await api.fs.rename(joinPath(dir, m.oldName), joinPath(dir, temp));
    if (!r.ok) {
      failures.push({ name: m.oldName, reason: describeReason(r.error) });
      await unstage();
      return { renamed: 0, failures };
    }
    staged.push({ temp, final: m.newName, oldName: m.oldName });
  }

  for (const s of staged.slice()) {
    const r = await api.fs.rename(joinPath(dir, s.temp), joinPath(dir, s.final));
    staged.shift();
    if (r.ok) { renamed++; continue; }
    failures.push({ name: s.oldName, reason: describeReason(r.error) });
    // Put it back under its original name rather than leaving a dotfile
    // behind — and if even that fails, name the temporary in the report.
    const back = await api.fs.rename(joinPath(dir, s.temp), joinPath(dir, s.oldName));
    if (!back.ok) {
      failures.push({
        name: s.oldName,
        reason: `left as ${s.temp} — could not restore: ${describeReason(back.error)}`,
      });
    }
  }
  return { renamed, failures };
}
