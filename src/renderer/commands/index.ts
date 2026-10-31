// src/renderer/commands/index.ts
export type { CommandId, Digit1To9, BookmarkSlot } from '@shared/commands/ids';
import type { CommandId } from '@shared/commands/ids';

/** Historical name; the ids live in @shared so main and shared can read them. */
export type CommandName = CommandId;
