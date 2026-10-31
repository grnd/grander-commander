import { describe, it, expect } from 'vitest';
import { parseKeymapFile } from '@shared/keymap/parse';
import { SCHEMA_VERSION } from '@shared/keymap/types';
import { reservedReason, RESERVED_KEYS } from '@shared/keymap/reserved';

const kinds = (ds: { kind: string }[]) => ds.map((d) => d.kind).sort();

describe('parseKeymapFile', () => {
  it('accepts a file it understands', () => {
    const { file, diagnostics } = parseKeymapFile({
      version: 1, bindings: { global: { copy: ['F5'] } },
    });
    expect(file.bindings).toEqual({ global: { copy: ['F5'] } });
    expect(diagnostics).toEqual([]);
  });

  // Review Focus 3: a hand-written file can hold anything.
  it('survives a root that is not an object', () => {
    for (const raw of [null, 42, 'text', []]) {
      const { file, diagnostics } = parseKeymapFile(raw);
      expect(file.version).toBe(SCHEMA_VERSION);
      expect(file.bindings).toBeUndefined();
      expect(diagnostics[0].kind).toBe('malformed');
    }
  });

  it('drops a value that is not an array of keys', () => {
    const { file, diagnostics } = parseKeymapFile({
      version: 1,
      bindings: { global: { copy: 42, move: 'F6', trash: ['F8'], rename: [7] } },
    });
    expect(file.bindings).toEqual({ global: { trash: ['F8'], rename: [] } });
    expect(kinds(diagnostics)).toEqual(['invalid-entry', 'invalid-entry', 'invalid-key']);
  });

  it('keeps an explicit empty array, which means cleared', () => {
    const { file } = parseKeymapFile({ version: 1, bindings: { global: { copy: [] } } });
    expect(file.bindings).toEqual({ global: { copy: [] } });
  });

  it('drops an unknown context, an unknown command and an unbindable one', () => {
    const { file, diagnostics } = parseKeymapFile({
      version: 1,
      bindings: {
        nosuch: { copy: ['F5'] },
        global: { nosuchcommand: ['F12'], runShellCommand: ['F11'], copy: ['F5'] },
      },
    });
    expect(file.bindings).toEqual({ global: { copy: ['F5'] } });
    expect(kinds(diagnostics)).toEqual(['unbindable', 'unknown-command', 'unknown-context']);
  });

  it('drops a key the OS owns', () => {
    const { file, diagnostics } = parseKeymapFile({
      version: 1, bindings: { global: { copy: ['Cmd+Q', 'F5'] } },
    });
    expect(file.bindings).toEqual({ global: { copy: ['F5'] } });
    expect(diagnostics[0].kind).toBe('reserved');
  });

  it('keeps keys it does not understand at the top level', () => {
    const { file } = parseKeymapFile({ version: 1, note: 'mine', userCommands: [{ id: 'user.x' }] });
    expect(file.note).toBe('mine');
    expect(file.userCommands).toEqual([{ id: 'user.x' }]);
  });

  it('reports a newer version and keeps the number', () => {
    const { file, diagnostics } = parseKeymapFile({ version: 2, bindings: { global: { copy: ['F5'] } } });
    expect(file.version).toBe(2);
    expect(diagnostics[0].kind).toBe('future-version');
  });
});

describe('reserved keys', () => {
  it('names the system owner of a key', () => {
    expect(reservedReason('Cmd+Q')).toMatch(/quit/i);
    expect(reservedReason('Cmd+V')).toMatch(/paste/i);
    expect(reservedReason('F5')).toBeNull();
  });
  it('holds the seven the menu keeps registered', () => {
    expect([...RESERVED_KEYS].sort()).toEqual(
      ['Cmd+Alt+I', 'Cmd+H', 'Cmd+M', 'Cmd+Q', 'Cmd+Shift+Z', 'Cmd+V', 'Cmd+Z']);
  });
});
