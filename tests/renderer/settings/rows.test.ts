import { describe, it, expect } from 'vitest';
import { shortcutRows } from '@renderer/settings/rows';

describe('shortcutRows', () => {
  const rows = shortcutRows();
  const find = (command: string, context: string) =>
    rows.find((r) => r.command === command && r.context === context);

  it('gives a command one row per context it holds keys in', () => {
    expect(find('trash', 'global')).toBeTruthy();
    expect(find('trash', 'panel')).toBeTruthy();
    expect(rows.filter((r) => r.command === 'trash')).toHaveLength(2);
  });

  it('names a row by its label and its context', () => {
    expect(find('trash', 'panel')!.label).toBe('Move to Trash');
    expect(find('trash', 'panel')!.contextLabel).toBe('Panel');
  });

  it('leaves out what cannot take a key', () => {
    expect(find('runShellCommand', 'global')).toBeUndefined();
    expect(find('quitApp', 'global')).toBeTruthy();
  });

  // The command line rule sits in front of the keymap lookup, so rebinding
  // this row would not take effect.
  it('marks the one row this version cannot change', () => {
    expect(find('eraseCommandLineOrParent', 'panel')!.fixed).toMatch(/command line/i);
    expect(find('quickLook', 'panel')!.fixed).toBeNull();
    expect(find('copy', 'global')!.fixed).toBeNull();
  });

  it('notes the keys a text field keeps for itself', () => {
    expect(find('copy', 'global')!.note).toMatch(/text field/i);
    expect(find('selectAll', 'global')!.note).toMatch(/text field/i);
    expect(find('trash', 'global')!.note).toBeNull();
  });

  it('has no rows for a context the catalog does not use yet', () => {
    expect(rows.some((r) => r.context === 'input')).toBe(false);
    expect(rows.some((r) => r.context === 'quickSearch')).toBe(false);
  });

  it('keeps the catalog’s category on each row', () => {
    expect(find('copy', 'global')!.category).toBe('Files');
    expect(find('cursorDown', 'panel')!.category).toBe('Navigation');
  });
});
