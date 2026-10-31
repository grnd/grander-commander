import { defaultBindings, type Context } from '../commands/catalog';
import type { CommandId } from '../commands/ids';
import type { KeyId } from '../keys/identity';
import type { Bindings } from './lookup';
import type { Diagnostic, KeymapFile } from './types';

/**
 * The catalog's defaults with the file's overrides over them. The file comes
 * from `parseKeymapFile`, so every entry here is a known context, a bindable
 * command and an array of valid keys.
 */
export function resolveBindings(file: KeymapFile | null): {
  bindings: Bindings; diagnostics: Diagnostic[];
} {
  const bindings = defaultBindings();
  const diagnostics: Diagnostic[] = [];
  if (!file?.bindings) return { bindings, diagnostics };

  const claimed = new Map<string, CommandId>();
  for (const [context, perCommand] of Object.entries(file.bindings) as
    [Context, Partial<Record<CommandId, KeyId[]>>][]) {
    for (const [command, keys] of Object.entries(perCommand ?? {}) as [CommandId, KeyId[]][]) {
      const kept: KeyId[] = [];
      for (const key of keys) {
        const slot = `${context}|${key}`;
        const holder = claimed.get(slot);
        if (holder) {
          diagnostics.push({
            kind: 'duplicate', context, command, key,
            message: `${key} is already held by ${holder} in ${context}`,
          });
          continue;
        }
        claimed.set(slot, command);
        kept.push(key);
      }
      (bindings[context] ??= {})[command] = kept;
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
      if (file.bindings?.[context]?.[command]) continue;     // an override, not a default
      perCommand[command] = keys.filter((k) => k !== key);
      diagnostics.push({
        kind: 'displaced-default', context, command, key,
        message: `${key} moved from ${command} to ${owner}`,
      });
    }
  }

  return { bindings, diagnostics };
}
