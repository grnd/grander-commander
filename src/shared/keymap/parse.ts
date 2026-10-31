import { commandById, type Context } from '../commands/catalog';
import type { CommandId } from '../commands/ids';
import { isKeyId, type KeyId } from '../keys/identity';
import type { Bindings } from './lookup';
import { RESERVED_KEYS, reservedReason } from './reserved';
import { emptyFile, SCHEMA_VERSION, type Diagnostic, type KeymapFile } from './types';

const CONTEXTS: readonly Context[] = [
  'global', 'panel', 'input', 'viewer', 'editor', 'terminal', 'quickSearch',
];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Turn whatever is in the file into a shape the rest of the code can trust.
 * Every rejection is a diagnostic rather than a throw: one bad line must not
 * cost the owner the other forty.
 */
export function parseKeymapFile(raw: unknown): { file: KeymapFile; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(raw)) {
    diagnostics.push({ kind: 'malformed', message: 'keymap.json must hold a JSON object' });
    return { file: emptyFile(), diagnostics };
  }

  const file: KeymapFile = { ...raw, version: SCHEMA_VERSION };
  const version = typeof raw.version === 'number' ? raw.version : SCHEMA_VERSION;
  file.version = version;
  if (version > SCHEMA_VERSION) {
    diagnostics.push({
      kind: 'future-version',
      message: `keymap.json is version ${version}; this build understands ${SCHEMA_VERSION}`,
    });
  }

  if (raw.bindings === undefined) {
    delete file.bindings;
    return { file, diagnostics };
  }
  if (!isRecord(raw.bindings)) {
    diagnostics.push({ kind: 'invalid-entry', message: 'bindings must hold an object' });
    delete file.bindings;
    return { file, diagnostics };
  }

  const bindings: Bindings = {};
  for (const [context, perCommand] of Object.entries(raw.bindings)) {
    if (!CONTEXTS.includes(context as Context)) {
      diagnostics.push({ kind: 'unknown-context', message: `unknown context ${context}` });
      continue;
    }
    const ctx = context as Context;
    if (!isRecord(perCommand)) {
      diagnostics.push({
        kind: 'invalid-entry', context: ctx,
        message: `${context} must hold an object of commands`,
      });
      continue;
    }
    for (const [command, value] of Object.entries(perCommand)) {
      const meta = commandById(command as CommandId);
      if (!meta) {
        diagnostics.push({
          kind: 'unknown-command', context: ctx, message: `unknown command ${command}`,
        });
        continue;
      }
      if (meta.system || meta.requiresArgs) {
        diagnostics.push({
          kind: 'unbindable', context: ctx, command: command as CommandId,
          message: `${command} cannot take a key`,
        });
        continue;
      }
      if (!Array.isArray(value)) {
        diagnostics.push({
          kind: 'invalid-entry', context: ctx, command: command as CommandId,
          message: `${command} must hold an array of keys`,
        });
        continue;
      }
      const keys: KeyId[] = [];
      for (const key of value) {
        if (typeof key !== 'string' || !isKeyId(key)) {
          diagnostics.push({
            kind: 'invalid-key', context: ctx, command: command as CommandId,
            message: `${String(key)} is not a key id`,
          });
          continue;
        }
        if (RESERVED_KEYS.has(key)) {
          diagnostics.push({
            kind: 'reserved', context: ctx, command: command as CommandId, key,
            message: `${key} belongs to ${reservedReason(key)}`,
          });
          continue;
        }
        keys.push(key);
      }
      (bindings[ctx] ??= {})[command as CommandId] = keys;
    }
  }
  file.bindings = bindings;
  return { file, diagnostics };
}
