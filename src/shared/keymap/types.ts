import type { Context } from '../commands/catalog';
import type { CommandId } from '../commands/ids';
import type { KeyId } from '../keys/identity';
import type { Bindings } from './lookup';

export const SCHEMA_VERSION = 1;

/** The on-disk shape. Keys this build does not know are preserved, never rewritten. */
export type KeymapFile = {
  version: number;
  bindings?: Bindings;
  [other: string]: unknown;
};

export type Diagnostic = {
  kind:
    | 'malformed' | 'unreadable' | 'future-version'
    | 'unknown-context' | 'unknown-command' | 'unbindable'
    | 'invalid-entry' | 'invalid-key' | 'reserved'
    | 'duplicate' | 'displaced-default' | 'backup-failed';
  message: string;
  context?: Context;
  command?: CommandId;
  key?: KeyId;
};

/** What every renderer holds: the committed keymap and why it looks like that. */
export type KeymapSnapshot = {
  revision: number;
  bindings: Bindings;
  overrides: Bindings;
  diagnostics: Diagnostic[];
  readOnly: boolean;
};

export type Displaced = { context: Context; command: CommandId; key: KeyId };

/**
 * An edit either commits or is refused, and a refusal carries the snapshot to
 * rebase on. It is a return value rather than a thrown error because Electron
 * drops custom properties off an Error crossing `invoke`, which would leave the
 * settings window a revision behind for good.
 */
export type ApplyOutcome =
  | { ok: true; snapshot: KeymapSnapshot; displaced: Displaced[]; undoToken: string | null }
  | {
      ok: false;
      reason: 'stale-revision' | 'external-change' | 'read-only' | 'no-undo' | 'refused';
      message: string;
      snapshot: KeymapSnapshot;
    };

export function emptyFile(): KeymapFile {
  return { version: SCHEMA_VERSION };
}
