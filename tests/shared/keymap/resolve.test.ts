import { describe, it, expect } from 'vitest';
import { resolveBindings } from '@shared/keymap/resolve';
import { emptyFile, SCHEMA_VERSION } from '@shared/keymap/types';
import { defaultBindings } from '@shared/commands/catalog';
import { bindingsFor } from '@shared/keymap/lookup';

const V = SCHEMA_VERSION;

describe('resolveBindings', () => {
  it('returns the defaults for an empty file and for no file', () => {
    expect(resolveBindings(emptyFile()).bindings).toEqual(defaultBindings());
    expect(resolveBindings(null).bindings).toEqual(defaultBindings());
  });

  it('replaces one command’s keys and leaves the rest', () => {
    const { bindings } = resolveBindings({ version: V, bindings: { global: { copy: ['Cmd+Shift+C'] } } });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual(['Cmd+Shift+C']);
    expect(bindingsFor(bindings, 'global', 'move')).toEqual(['F6', 'Cmd+X']);
  });

  it('clears a command on an empty array', () => {
    const { bindings } = resolveBindings({ version: V, bindings: { global: { copy: [] } } });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual([]);
  });

  it('takes a key from the command that held it by default', () => {
    const { bindings, diagnostics } = resolveBindings({ version: V, bindings: { global: { rename: ['F5'] } } });
    expect(bindingsFor(bindings, 'global', 'rename')).toEqual(['F5']);
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual(['Cmd+C']);
    expect(diagnostics).toEqual([{
      kind: 'displaced-default', context: 'global', command: 'copy', key: 'F5',
      message: 'F5 moved from copy to rename',
    }]);
  });

  // The first claim wins the key. The second command keeps its defaults rather
  // than ending with nothing, because the owner's own line was a conflict.
  it('keeps the first claim when two commands want one key', () => {
    const { bindings, diagnostics } = resolveBindings({
      version: V, bindings: { global: { copy: ['F12'], move: ['F12'] } },
    });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual(['F12']);
    expect(bindingsFor(bindings, 'global', 'move')).toEqual(['F6', 'Cmd+X']);
    expect(diagnostics[0].kind).toBe('duplicate');
  });

  it('keeps a command’s own keys in each of its contexts', () => {
    const { bindings } = resolveBindings({ version: V, bindings: { global: { trash: ['F9'] } } });
    expect(bindingsFor(bindings, 'global', 'trash')).toEqual(['F9']);
    // Cmd+Delete lives in `panel` through alsoIn and is untouched.
    expect(bindingsFor(bindings, 'panel', 'trash')).toEqual(['Cmd+Delete']);
  });

  it('ignores a stray field on the file', () => {
    const { diagnostics } = resolveBindings({ version: V, bindings: {}, diagnostics: ['nonsense'] } as never);
    expect(diagnostics).toEqual([]);
  });
});

// A line the build cannot use must not cost the owner a working shortcut. The
// clearing rule belongs to an array the owner really wrote as empty.
describe('resolveBindings on a file it cannot fully use', () => {
  it('keeps the defaults when every key in an entry is rejected', () => {
    const { bindings, diagnostics } = resolveBindings({
      version: V, bindings: { global: { rename: ['F77'] } },
    });
    expect(bindingsFor(bindings, 'global', 'rename')).toEqual(['F2', 'Cmd+Shift+R']);
    expect(diagnostics.map((d) => d.kind)).toContain('invalid-key');
  });

  it('keeps the defaults when the only key is one the OS owns', () => {
    const { bindings } = resolveBindings({ version: V, bindings: { global: { copy: ['Cmd+Q'] } } });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual(['F5', 'Cmd+C']);
  });

  it('keeps the valid half of a mixed entry', () => {
    const { bindings } = resolveBindings({
      version: V, bindings: { global: { copy: ['F77', 'F12'] } },
    });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual(['F12']);
  });

  it('still clears on an array the owner wrote as empty', () => {
    const { bindings } = resolveBindings({ version: V, bindings: { global: { copy: [] } } });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual([]);
  });

  it('ignores an entry it cannot read at all', () => {
    const { bindings } = resolveBindings({
      version: V,
      bindings: { nosuch: { copy: ['F5'] }, global: { copy: 42, someFuture: ['F9'] } } as never,
    });
    expect(bindingsFor(bindings, 'global', 'copy')).toEqual(['F5', 'Cmd+C']);
  });
});
