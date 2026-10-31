import type { CommandId } from '../commands/ids';
import type { Context } from '../commands/catalog';
import { toAccelerator } from '../keys/adapters';
import type { KeyId } from '../keys/identity';

export type Bindings = Partial<Record<Context, Partial<Record<CommandId, KeyId[]>>>>;
export type KeyTable = Map<string, CommandId>;

const slot = (ctx: Context, id: KeyId) => `${ctx}|${id}`;

/**
 * Where each context looks, in order. Only `global` is a general fallback —
 * a surface must not inherit the panel's keys, or F5 would copy files while
 * the viewer is up. Quick search is the exception: it is a mode layered over
 * the panel, so the row walk keeps working while the box is open.
 */
const CHAIN: Record<Context, readonly Context[]> = {
  global: ['global'],
  panel: ['panel', 'global'],
  input: ['input', 'global'],
  viewer: ['viewer', 'global'],
  editor: ['editor', 'global'],
  terminal: ['terminal', 'global'],
  quickSearch: ['quickSearch', 'panel', 'global'],
};

export function buildKeyTable(bindings: Bindings): KeyTable {
  const table: KeyTable = new Map();
  for (const [ctx, perCommand] of Object.entries(bindings) as [Context, Partial<Record<CommandId, KeyId[]>>][]) {
    for (const [command, keys] of Object.entries(perCommand ?? {}) as [CommandId, KeyId[]][]) {
      for (const key of keys ?? []) table.set(slot(ctx, key), command);
    }
  }
  return table;
}

/**
 * The contexts a binding in `context` can collide with.
 *
 * A key bound in `panel` shadows the same key in `global`, because the panel
 * looks in `panel` first. A key bound in `global` is shadowed by one in
 * `panel`. Both directions matter, so a take-over has to cover them.
 */
export function collidingContexts(context: Context): Context[] {
  const found = new Set<Context>(CHAIN[context] ?? [context]);
  for (const [other, chain] of Object.entries(CHAIN) as [Context, readonly Context[]][]) {
    if (chain.includes(context)) found.add(other);
  }
  return [...found];
}

export function lookupKey(table: KeyTable, context: Context, id: KeyId): CommandId | null {
  for (const ctx of CHAIN[context] ?? [context]) {
    const found = table.get(slot(ctx, id));
    if (found) return found;
  }
  return null;
}

export function bindingsFor(b: Bindings, context: Context, id: CommandId): KeyId[] {
  return b[context]?.[id] ?? [];
}

/** The binding a menu item displays: the first one Electron can express. */
export function primaryAccelerator(b: Bindings, context: Context, id: CommandId): string | null {
  for (const key of bindingsFor(b, context, id)) {
    const accelerator = toAccelerator(key);
    if (accelerator) return accelerator;
  }
  return null;
}
