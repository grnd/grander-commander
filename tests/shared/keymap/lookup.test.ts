import { describe, it, expect } from 'vitest';
import { buildKeyTable, lookupKey, bindingsFor, primaryAccelerator } from '@shared/keymap/lookup';

const bindings = {
  global: { refresh: ['Cmd+R'] },
  panel: { copy: ['F5', 'Cmd+C'] },
  editor: { editorSave: ['Cmd+S'] },
  viewer: { viewerClose: ['Escape', 'Insert'] },
} as const;

describe('lookupKey', () => {
  const table = buildKeyTable(bindings);
  it('finds a key in its own context', () => expect(lookupKey(table, 'panel', 'F5')).toBe('copy'));
  it('falls through to global', () => expect(lookupKey(table, 'editor', 'Cmd+R')).toBe('refresh'));
  it('does not fall through to another surface', () =>
    expect(lookupKey(table, 'editor', 'F5')).toBeNull());
  it('prefers the context over global', () => {
    const t = buildKeyTable({ global: { refresh: ['F5'] }, panel: { copy: ['F5'] } });
    expect(lookupKey(t, 'panel', 'F5')).toBe('copy');
    expect(lookupKey(t, 'input', 'F5')).toBe('refresh');
  });
  it('returns null for an unbound key', () => expect(lookupKey(table, 'panel', 'Cmd+Z')).toBeNull());

  // Quick search is a mode layered over the panel, not a separate surface: the
  // row walk has to keep working while the box is up.
  it('lets quick search see the panel underneath it', () => {
    const t = buildKeyTable({ panel: { cursorDown: ['ArrowDown'] }, global: { refresh: ['Cmd+R'] } });
    expect(lookupKey(t, 'quickSearch', 'ArrowDown')).toBe('cursorDown');
    expect(lookupKey(t, 'quickSearch', 'Cmd+R')).toBe('refresh');
  });
  it('prefers a quick-search binding over the panel one', () => {
    const t = buildKeyTable({ quickSearch: { clearSelection: ['Escape'] }, panel: { viewFile: ['Escape'] } });
    expect(lookupKey(t, 'quickSearch', 'Escape')).toBe('clearSelection');
  });
});

describe('primaryAccelerator', () => {
  it('takes the first binding Electron can express', () =>
    expect(primaryAccelerator(bindings, 'panel', 'copy')).toBe('F5'));
  it('skips one it cannot', () =>
    expect(primaryAccelerator(bindings, 'viewer', 'viewerClose')).toBe('Esc'));
  it('returns null when a command has no bindings', () =>
    expect(primaryAccelerator(bindings, 'panel', 'trash')).toBeNull());
});

describe('bindingsFor', () => {
  it('returns an empty array for an unbound command', () =>
    expect(bindingsFor(bindings, 'panel', 'trash')).toEqual([]));
});
