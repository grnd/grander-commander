import type { KeyId } from '../keys/identity';

/**
 * Keys the OS or the web platform answers before the app can. A command bound
 * to one of these would be advertised and never fire, so nothing may hold them.
 */
const OWNERS: Record<string, string> = {
  'Cmd+Q': 'macOS Quit',
  'Cmd+H': 'macOS Hide',
  'Cmd+M': 'macOS Minimize',
  'Cmd+V': 'the Paste menu item',
  'Cmd+Z': 'the Undo menu item',
  'Cmd+Shift+Z': 'the Redo menu item',
  'Cmd+Alt+I': 'the developer tools',
};

export const RESERVED_KEYS: ReadonlySet<KeyId> = new Set(Object.keys(OWNERS));

export function reservedReason(key: KeyId): string | null {
  return OWNERS[key] ?? null;
}
