import { CATALOG, type Category, type Context } from '@shared/commands/catalog';
import type { CommandId } from '@shared/commands/ids';

export const CONTEXT_LABEL: Record<Context, string> = {
  global: 'Global',
  panel: 'Panel',
  input: 'Text field',
  viewer: 'Viewer',
  editor: 'Editor',
  terminal: 'Terminal',
  quickSearch: 'Quick search',
};

export type Row = {
  command: CommandId;
  context: Context;
  label: string;
  contextLabel: string;
  category: Category;
  /** Set when this version cannot change the row at all, with the reason. */
  fixed: string | null;
  /** Set when the row is editable but one situation does not follow it. */
  note: string | null;
};

/**
 * Backspace against the command line is decided before the keymap lookup, so a
 * different key here would not take effect. Phase 2 moves that rule into the
 * router's precedence, and then this row becomes editable.
 */
const FIXED: Partial<Record<CommandId, string>> = {
  eraseCommandLineOrParent:
    'The command line rule is fixed in this version: Backspace erases the line, or goes up when the line is empty.',
};

/**
 * Editable, with one situation that does not follow the binding.
 */
const NOTES: Partial<Record<CommandId, string>> = {
  copy: 'Inside a text field, Cmd+C copies text. That key is the field’s in this version.',
  move: 'Inside a text field, Cmd+X cuts text. That key is the field’s in this version.',
  selectAll: 'Inside a text field, Cmd+A selects text. That key is the field’s in this version.',
  focusPathBarRoot: 'An open quick-search box keeps the slash key in this version.',
  toggleCheatsheet: 'An open quick-search box keeps the question mark in this version.',
};

/**
 * One row for each command and context pair the catalog defines. A command can
 * hold keys in two contexts, so the context belongs in the row's name: without
 * it, two rows answer to "Move to Trash" and neither can be selected.
 */
export function shortcutRows(): Row[] {
  const rows: Row[] = [];
  for (const meta of CATALOG) {
    if (meta.system || meta.requiresArgs) continue;
    const contexts: Context[] = [meta.context, ...(Object.keys(meta.alsoIn ?? {}) as Context[])];
    for (const context of contexts) {
      rows.push({
        command: meta.id,
        context,
        label: meta.label,
        contextLabel: CONTEXT_LABEL[context],
        category: meta.category,
        fixed: FIXED[meta.id] ?? null,
        note: NOTES[meta.id] ?? null,
      });
    }
  }
  return rows;
}

/** The row name the UI shows and a test selects by. */
export function rowName(row: Row): string {
  return `${row.label} — ${row.contextLabel}`;
}
