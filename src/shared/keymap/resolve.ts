import { commandById, defaultBindings, type Context } from '../commands/catalog';
import type { CommandId } from '../commands/ids';
import { isKeyId, type KeyId } from '../keys/identity';
import type { Bindings } from './lookup';
import { RESERVED_KEYS } from './reserved';
import type { Diagnostic, KeymapFile } from './types';

const CONTEXTS: readonly Context[] = [
  'global', 'panel', 'input', 'viewer', 'editor', 'terminal', 'quickSearch',
];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The catalog's defaults with the file's overrides over them.
 *
 * Two rules decide what an entry means:
 *
 * - An array the owner wrote as empty clears the command. That is the only way
 *   to clear one.
 * - An entry whose keys this build cannot use leaves the command on its
 *   defaults. A typo in one line must not cost the owner a working shortcut.
 *
 * The file may hold anything, because the owner edits it, so every step here
 * checks the shape it reads.
 */
export function resolveBindings(file: KeymapFile | null): {
  bindings: Bindings; diagnostics: Diagnostic[];
} {
  const bindings = defaultBindings();
  const diagnostics: Diagnostic[] = [];
  if (!file || !isRecord(file.bindings)) return { bindings, diagnostics };

  const claimed = new Map<string, CommandId>();
  for (const [context, perCommand] of Object.entries(file.bindings)) {
    if (!CONTEXTS.includes(context as Context) || !isRecord(perCommand)) continue;
    const ctx = context as Context;
    for (const [name, value] of Object.entries(perCommand)) {
      const command = name as CommandId;
      const meta = commandById(command);
      if (!meta || meta.system || meta.requiresArgs || !Array.isArray(value)) continue;

      const kept: KeyId[] = [];
      for (const key of value) {
        if (typeof key !== 'string' || !isKeyId(key) || RESERVED_KEYS.has(key)) {
          diagnostics.push({
            kind: 'invalid-key', context: ctx, command,
            message: `${String(key)} cannot be a binding, so ${command} keeps its other keys`,
          });
          continue;
        }
        const slot = `${ctx}|${key}`;
        const holder = claimed.get(slot);
        if (holder) {
          diagnostics.push({
            kind: 'duplicate', context: ctx, command, key,
            message: `${key} is already held by ${holder} in ${ctx}`,
          });
          continue;
        }
        claimed.set(slot, command);
        kept.push(key);
      }

      // An entry that lost every key keeps the defaults. An entry the owner
      // wrote as empty clears the command.
      if (value.length > 0 && kept.length === 0) continue;
      (bindings[ctx] ??= {})[command] = kept;
    }
  }

  // A default still holding a key an override claimed loses it.
  for (const [slot, owner] of claimed) {
    const cut = slot.indexOf('|');
    const context = slot.slice(0, cut) as Context;
    const key = slot.slice(cut + 1);
    const perCommand = bindings[context] ?? {};
    for (const [command, keys] of Object.entries(perCommand) as [CommandId, KeyId[]][]) {
      if (command === owner || !keys.includes(key)) continue;
      const override = (file.bindings as Record<string, Record<string, unknown>>)[context]?.[command];
      if (Array.isArray(override)) continue;              // an override, not a default
      perCommand[command] = keys.filter((k) => k !== key);
      diagnostics.push({
        kind: 'displaced-default', context, command, key,
        message: `${key} moved from ${command} to ${owner}`,
      });
    }
  }

  return { bindings, diagnostics };
}
