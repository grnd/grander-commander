import { describe, it, expect } from 'vitest';
import { toDisplay, toAccelerator } from '@shared/keys/adapters';

describe('toDisplay', () => {
  it('uses macOS glyphs in modifier order', () =>
    expect(toDisplay('Cmd+Ctrl+Alt+Shift+R')).toBe('⌘⌃⌥⇧R'));
  it('shows the US glyph for punctuation', () => {
    expect(toDisplay('Cmd+Shift+Slash')).toBe('⌘⇧/');
    expect(toDisplay('Shift+Equal')).toBe('⇧=');
  });
  it('names the editing keys', () => {
    expect(toDisplay('Backspace')).toBe('⌫');
    expect(toDisplay('Enter')).toBe('↩');
    expect(toDisplay('ArrowDown')).toBe('↓');
    expect(toDisplay('Space')).toBe('Space');
    expect(toDisplay('F5')).toBe('F5');
  });
  // Review Focus 5: no glyph is claimed for a key whose character is layout-bound.
  it('falls back to the token name when no glyph is safe', () =>
    expect(toDisplay('Cmd+IntlBackslash')).toBe('⌘IntlBackslash'));
  it('returns the raw id when it is not a key id', () =>
    expect(toDisplay('nonsense')).toBe('nonsense'));
});

describe('toAccelerator', () => {
  it('converts to Electron syntax', () => {
    expect(toAccelerator('Cmd+Shift+Slash')).toBe('Cmd+Shift+/');
    expect(toAccelerator('F5')).toBe('F5');
    expect(toAccelerator('Shift+F8')).toBe('Shift+F8');
    expect(toAccelerator('Ctrl+Backquote')).toBe('Ctrl+`');
    expect(toAccelerator('Cmd+Backspace')).toBe('Cmd+Backspace');
  });
  it('maps numpad tokens to Electron names', () =>
    expect(toAccelerator('NumpadAdd')).toBe('numadd'));
  it('returns null for what Electron cannot express', () => {
    expect(toAccelerator('IntlBackslash')).toBeNull();
    expect(toAccelerator('not+a+key')).toBeNull();
  });
});
