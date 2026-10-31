import { keyIdParts, type KeyId, type Modifier } from './identity';

const MOD_GLYPH: Record<Modifier, string> = { Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };

/** US glyphs. A token absent here is shown by name rather than guessed at. */
const TOKEN_GLYPH: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  Backspace: '⌫', Delete: '⌦', Enter: '↩', Tab: '⇥', Escape: '⎋',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟',
};

const ACCELERATOR_TOKEN: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  Space: 'Space', Enter: 'Return', Escape: 'Esc',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv', NumpadDecimal: 'numdec', NumpadEnter: 'Enter',
};

export function toDisplay(id: KeyId): string {
  const parts = keyIdParts(id);
  if (!parts) return id;
  const mods = parts.mods.map((m) => MOD_GLYPH[m]).join('');
  return mods + (TOKEN_GLYPH[parts.token] ?? parts.token);
}

/** Electron's accelerator syntax, or null when it has no way to say this key. */
export function toAccelerator(id: KeyId): string | null {
  const parts = keyIdParts(id);
  if (!parts) return null;
  if (parts.token === 'IntlBackslash' || parts.token === 'Insert') return null;
  const token = ACCELERATOR_TOKEN[parts.token]
    ?? (/^Numpad[0-9]$/.test(parts.token) ? `num${parts.token.slice(6)}` : parts.token);
  return [...parts.mods, token].join('+');
}
