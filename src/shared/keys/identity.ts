/**
 * A key, named by physical position rather than by the character it produces.
 *
 * Modifiers come first in a fixed order, then one token: "Cmd+Shift+Slash".
 * Naming the position is what makes a binding survive a layout change and what
 * gives the =/+ key a single name — the old format called it "=" unshifted and
 * "+" shifted, and joined parts with the very character it was producing.
 */
export type KeyId = string;

export const MODIFIERS = ['Cmd', 'Ctrl', 'Alt', 'Shift'] as const;
export type Modifier = typeof MODIFIERS[number];

const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const DIGITS = Array.from({ length: 10 }, (_, i) => String(i));
const FKEYS = Array.from({ length: 20 }, (_, i) => `F${i + 1}`);

const PUNCTUATION = [
  'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
  'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash', 'IntlBackslash',
];

const NUMPAD = [
  'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide',
  'NumpadDecimal', 'NumpadEnter', ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
];

const NAMED = [
  'Space', 'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Insert',
  'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
];

export const KEY_TOKENS: ReadonlySet<string> = new Set([
  ...LETTERS, ...DIGITS, ...FKEYS, ...PUNCTUATION, ...NUMPAD, ...NAMED,
]);

/** `e.code` -> token. Letters and digits shed their prefix; the rest match. */
function tokenFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (KEY_TOKENS.has(code)) return code;
  return null;
}

export function keyIdFromEvent(e: KeyboardEvent): KeyId | null {
  if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return null;
  const token = tokenFromCode(e.code);
  if (!token) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(token);
  return parts.join('+');
}

export function keyIdParts(id: KeyId): { mods: Modifier[]; token: string } | null {
  const parts = id.split('+');
  const token = parts.pop();
  if (!token || !KEY_TOKENS.has(token)) return null;
  const mods: Modifier[] = [];
  for (const part of parts) {
    if (!(MODIFIERS as readonly string[]).includes(part)) return null;
    mods.push(part as Modifier);
  }
  // Canonical order, no repeats.
  const expected = MODIFIERS.filter((m) => mods.includes(m));
  if (expected.length !== mods.length || expected.some((m, i) => m !== mods[i])) return null;
  return { mods, token };
}

export function isKeyId(value: unknown): value is KeyId {
  return typeof value === 'string' && keyIdParts(value) !== null;
}
