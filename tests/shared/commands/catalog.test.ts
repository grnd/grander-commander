import { describe, it, expect } from 'vitest';
import { CATALOG, commandById, defaultBindings } from '@shared/commands/catalog';
import { SURFACE_COMMAND_IDS } from '@shared/commands/ids';
import { isKeyId } from '@shared/keys/identity';
import { bindingsFor, buildKeyTable, lookupKey } from '@shared/keymap/lookup';

describe('catalog', () => {
  it('lists every command exactly once', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every command a label and a category', () => {
    for (const c of CATALOG) {
      expect(c.label.length, c.id).toBeGreaterThan(0);
      expect(c.category.length, c.id).toBeGreaterThan(0);
    }
  });

  it('uses only valid key ids as defaults', () => {
    for (const c of CATALOG) {
      for (const k of c.defaults) expect(isKeyId(k), `${c.id}: ${k}`).toBe(true);
      for (const keys of Object.values(c.alsoIn ?? {})) {
        for (const k of keys) expect(isKeyId(k), `${c.id}: ${k}`).toBe(true);
      }
    }
  });

  it('never binds a system or argument-taking command', () => {
    for (const c of CATALOG) {
      if (c.system || c.requiresArgs) expect(c.defaults, c.id).toEqual([]);
    }
  });

  it('marks runShellCommand as argument-taking and quitApp as bindable', () => {
    expect(commandById('runShellCommand')?.requiresArgs).toBe(true);
    expect(commandById('quitApp')?.requiresArgs).toBeUndefined();
  });

  it('names a surface for every surface command, and only those', () => {
    const withSurface = CATALOG.filter((c) => c.surface).map((c) => c.id).sort();
    expect(withSurface).toEqual([...SURFACE_COMMAND_IDS].sort());
  });

  it('never gives one key two commands in a context', () => {
    const seen = new Map<string, string>();
    for (const c of CATALOG) {
      const perContext: [string, readonly string[]][] = [
        [c.context, c.defaults],
        ...Object.entries(c.alsoIn ?? {}),
      ];
      for (const [ctx, keys] of perContext) {
        for (const k of keys) {
          const key = `${ctx}|${k}`;
          expect(seen.has(key), `${key} also held by ${seen.get(key)}`).toBe(false);
          seen.set(key, c.id);
        }
      }
    }
  });

  // What allowedFromInput used to decide, now a property of the catalog:
  // app-wide combos survive a focused field, bare keys belong to the field.
  it('puts app-wide shortcuts in global and bare keys in panel', () => {
    const table = buildKeyTable(defaultBindings());
    for (const k of ['F5', 'F8', 'Shift+F8', 'Cmd+R', 'Ctrl+H', 'Ctrl+1', 'Cmd+1', 'Ctrl+Backquote']) {
      expect(lookupKey(table, 'input', k), `${k} must survive a focused input`).not.toBeNull();
    }
    for (const k of ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Space', 'Slash', 'Tab', 'Backspace']) {
      expect(lookupKey(table, 'input', k), `${k} belongs to the input`).toBeNull();
      expect(lookupKey(table, 'panel', k), `${k} must work in the panel`).not.toBeNull();
    }
  });

  // These move the caret or delete text inside a field. applyTextEditing only
  // implements Cmd+A/C/X, so the rest must not resolve to a command at all.
  it('keeps the macOS text-editing combos out of a focused field', () => {
    const table = buildKeyTable(defaultBindings());
    for (const k of ['Cmd+Backspace', 'Cmd+Delete', 'Cmd+ArrowLeft', 'Cmd+ArrowRight',
                     'Cmd+ArrowUp', 'Cmd+ArrowDown']) {
      expect(lookupKey(table, 'input', k), `${k} must stay with the input`).toBeNull();
      expect(lookupKey(table, 'panel', k), `${k} must work in the panel`).not.toBeNull();
    }
  });

  // Parity with the deleted keybindings.test.ts, which asserted these through
  // lookup() and allowedFromInput().
  it('resolves the keys the old table resolved', () => {
    const table = buildKeyTable(defaultBindings());
    expect(lookupKey(table, 'panel', 'F5')).toBe('copy');
    expect(lookupKey(table, 'panel', 'ArrowDown')).toBe('cursorDown');
    expect(lookupKey(table, 'panel', 'Cmd+A')).toBe('selectAll');
    expect(lookupKey(table, 'panel', 'Ctrl+Z')).toBeNull();
    for (const k of ['Ctrl+Shift+1', 'Cmd+G', 'Cmd+Slash']) {
      expect(lookupKey(table, 'input', k), `${k} must survive a focused input`).not.toBeNull();
    }
  });

  it('keeps the bindings the app shipped with', () => {
    const b = defaultBindings();
    expect(bindingsFor(b, 'global', 'copy')).toContain('F5');
    expect(bindingsFor(b, 'panel', 'navigateInto')).toContain('Enter');
    expect(bindingsFor(b, 'panel', 'eraseCommandLineOrParent')).toContain('Backspace');
    expect(bindingsFor(b, 'quickSearch', 'clearSelection')).toEqual([]);
    expect(bindingsFor(b, 'viewer', 'viewerPageDown')).toContain('PageDown');
    expect(bindingsFor(b, 'editor', 'editorSave')).toContain('Cmd+S');
    expect(bindingsFor(b, 'panel', 'trash')).toContain('Cmd+Delete');
  });
});
