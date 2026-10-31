import { commandById, type Context } from '../commands/catalog';
import type { CommandId } from '../commands/ids';
import { isKeyId, type KeyId } from '../keys/identity';
import { bindingsFor, collidingContexts, type Bindings } from './lookup';
import { RESERVED_KEYS, reservedReason } from './reserved';
import { resolveBindings } from './resolve';
import { SCHEMA_VERSION, type Displaced, type KeymapFile } from './types';

export type Op =
  | { kind: 'assign'; context: Context; command: CommandId; key: KeyId }
  | { kind: 'remove'; context: Context; command: CommandId; key: KeyId }
  | { kind: 'clear'; context: Context; command: CommandId }
  | { kind: 'resetCommand'; context: Context; command: CommandId }
  | { kind: 'resetAll' };

/** How to put back what an op changed. `null` drops the override entirely. */
export type Inverse = {
  entries: { context: Context; command: CommandId; keys: KeyId[] | null }[];
};

function clone(file: KeymapFile): KeymapFile {
  return { ...file, bindings: structuredClone(file.bindings ?? {}) };
}

function setOverride(file: KeymapFile, context: Context, command: CommandId, keys: KeyId[]): void {
  ((file.bindings ??= {})[context] ??= {})[command] = keys;
}

function effective(file: KeymapFile, context: Context, command: CommandId): KeyId[] {
  return bindingsFor(resolveBindings(file).bindings, context, command);
}

function ownerOf(bindings: Bindings, context: Context, key: KeyId): CommandId | null {
  for (const [command, keys] of Object.entries(bindings[context] ?? {}) as [CommandId, KeyId[]][]) {
    if (keys.includes(key)) return command;
  }
  return null;
}

export function applyOp(input: KeymapFile, op: Op): {
  file: KeymapFile; displaced: Displaced[]; inverse: Inverse;
} {
  const file = clone(input);
  const displaced: Displaced[] = [];
  const inverse: Inverse = { entries: [] };
  const remembered = new Set<string>();
  /** Record a command's state before this op touches it, once per command. */
  const remember = (context: Context, command: CommandId) => {
    const slot = `${context}|${command}`;
    if (remembered.has(slot)) return;
    remembered.add(slot);
    inverse.entries.push({ context, command, keys: input.bindings?.[context]?.[command] ?? null });
  };

  if (op.kind === 'resetAll') {
    for (const [context, perCommand] of Object.entries(input.bindings ?? {})) {
      for (const command of Object.keys(perCommand ?? {})) {
        remember(context as Context, command as CommandId);
      }
    }
    file.bindings = {};
    file.version = SCHEMA_VERSION;
    return { file, displaced, inverse };
  }

  const meta = commandById(op.command);
  if (!meta) throw new Error(`unknown command ${op.command}`);
  if ((op.kind === 'assign' || op.kind === 'remove') && !isKeyId(op.key)) {
    throw new Error(`${op.key} is not a key id`);
  }

  if (op.kind === 'assign') {
    if (meta.system || meta.requiresArgs) throw new Error(`${op.command} cannot take a key`);
    if (RESERVED_KEYS.has(op.key)) throw new Error(`${op.key} belongs to ${reservedReason(op.key)}`);
    if (effective(file, op.context, op.command).includes(op.key)) {
      return { file, displaced, inverse };          // already bound: nothing to do
    }
    // Every context this one can collide with, so a shadowed binding cannot
    // stay behind and make a menu advertise a key that no longer fires.
    for (const context of collidingContexts(op.context)) {
      takeKey(file, context, op.key, op.command, displaced, remember);
    }
    remember(op.context, op.command);
    setOverride(file, op.context, op.command, [...effective(file, op.context, op.command), op.key]);
    return { file, displaced, inverse };
  }

  if (op.kind === 'remove') {
    remember(op.context, op.command);
    setOverride(file, op.context, op.command,
      effective(file, op.context, op.command).filter((k) => k !== op.key));
    return { file, displaced, inverse };
  }

  if (op.kind === 'clear') {
    remember(op.context, op.command);
    setOverride(file, op.context, op.command, []);
    return { file, displaced, inverse };
  }

  // resetCommand: the catalog's keys come back, taking them off whoever has them.
  const wanted = [
    ...(meta.context === op.context ? meta.defaults : []),
    ...(meta.alsoIn?.[op.context] ?? []),
  ];
  for (const key of wanted) {
    for (const context of collidingContexts(op.context)) {
      takeKey(file, context, key, op.command, displaced, remember);
    }
  }
  remember(op.context, op.command);
  delete file.bindings?.[op.context]?.[op.command];
  return { file, displaced, inverse };
}

/**
 * Move `key` off whoever holds it. This reads the file being built, not the
 * original, so reclaiming several keys from one command accumulates. The first
 * draft read the original every time, and each removal overwrote the last.
 */
function takeKey(
  file: KeymapFile, context: Context, key: KeyId, to: CommandId,
  displaced: Displaced[], remember: (context: Context, command: CommandId) => void,
): void {
  const holder = ownerOf(resolveBindings(file).bindings, context, key);
  if (!holder || holder === to) return;
  remember(context, holder);
  setOverride(file, context, holder, effective(file, context, holder).filter((k) => k !== key));
  displaced.push({ context, command: holder, key });
}

export function applyInverse(input: KeymapFile, inverse: Inverse): KeymapFile {
  const file = clone(input);
  for (const entry of inverse.entries) {
    if (entry.keys === null) delete file.bindings?.[entry.context]?.[entry.command];
    else setOverride(file, entry.context, entry.command, entry.keys);
  }
  return file;
}
