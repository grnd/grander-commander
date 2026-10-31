import { describe, it, expect } from 'vitest';
import { applyOp, applyInverse } from '@shared/keymap/ops';
import { resolveBindings } from '@shared/keymap/resolve';
import { emptyFile } from '@shared/keymap/types';
import { bindingsFor } from '@shared/keymap/lookup';

const keys = (file: Parameters<typeof resolveBindings>[0], command: string, context = 'global') =>
  bindingsFor(resolveBindings(file).bindings, context as never, command as never);

describe('applyOp', () => {
  it('assigns a free key and leaves everyone else alone', () => {
    const { file, displaced } = applyOp(emptyFile(),
      { kind: 'assign', context: 'global', command: 'copy', key: 'F12' });
    expect(keys(file, 'copy')).toEqual(['F5', 'Cmd+C', 'F12']);
    expect(displaced).toEqual([]);
  });

  it('is idempotent: assigning a key a command already holds changes nothing', () => {
    const { file, displaced } = applyOp(emptyFile(),
      { kind: 'assign', context: 'global', command: 'copy', key: 'F5' });
    expect(keys(file, 'copy')).toEqual(['F5', 'Cmd+C']);
    expect(displaced).toEqual([]);
  });

  it('takes a key from its owner and writes the owner’s rest down', () => {
    const { file, displaced } = applyOp(emptyFile(),
      { kind: 'assign', context: 'global', command: 'rename', key: 'F5' });
    expect(keys(file, 'rename')).toEqual(['F2', 'Cmd+Shift+R', 'F5']);
    expect(keys(file, 'copy')).toEqual(['Cmd+C']);
    expect(displaced).toEqual([{ context: 'global', command: 'copy', key: 'F5' }]);
  });

  it('undoes a take-over on both sides', () => {
    const first = applyOp(emptyFile(), { kind: 'assign', context: 'global', command: 'rename', key: 'F5' });
    const back = applyInverse(first.file, first.inverse);
    expect(keys(back, 'copy')).toEqual(['F5', 'Cmd+C']);
    expect(keys(back, 'rename')).toEqual(['F2', 'Cmd+Shift+R']);
  });

  it('removes one key and clears all of them', () => {
    const removed = applyOp(emptyFile(), { kind: 'remove', context: 'global', command: 'copy', key: 'F5' }).file;
    expect(keys(removed, 'copy')).toEqual(['Cmd+C']);
    const cleared = applyOp(emptyFile(), { kind: 'clear', context: 'global', command: 'copy' }).file;
    expect(keys(cleared, 'copy')).toEqual([]);
  });

  // The first draft read the original file for every reclaimed key, so the
  // second removal overwrote the first and one key stayed with the taker.
  it('reclaims every default key at once on reset', () => {
    const cleared = applyOp(emptyFile(), { kind: 'clear', context: 'global', command: 'copy' }).file;
    const taken = applyOp(cleared, { kind: 'assign', context: 'global', command: 'rename', key: 'F5' }).file;
    const taken2 = applyOp(taken, { kind: 'assign', context: 'global', command: 'rename', key: 'Cmd+C' }).file;
    expect(keys(taken2, 'rename')).toEqual(['F2', 'Cmd+Shift+R', 'F5', 'Cmd+C']);

    const { file, displaced } = applyOp(taken2, { kind: 'resetCommand', context: 'global', command: 'copy' });
    expect(keys(file, 'copy')).toEqual(['F5', 'Cmd+C']);
    expect(keys(file, 'rename')).toEqual(['F2', 'Cmd+Shift+R']);
    expect(displaced).toEqual([
      { context: 'global', command: 'rename', key: 'F5' },
      { context: 'global', command: 'rename', key: 'Cmd+C' },
    ]);
  });

  it('undoes that reset too', () => {
    const cleared = applyOp(emptyFile(), { kind: 'clear', context: 'global', command: 'copy' }).file;
    const taken = applyOp(cleared, { kind: 'assign', context: 'global', command: 'rename', key: 'F5' }).file;
    const reset = applyOp(taken, { kind: 'resetCommand', context: 'global', command: 'copy' });
    const back = applyInverse(reset.file, reset.inverse);
    expect(keys(back, 'copy')).toEqual([]);
    expect(keys(back, 'rename')).toContain('F5');
  });

  it('resets everything known and keeps what it does not know', () => {
    const edited = applyOp({ ...emptyFile(), userCommands: [{ id: 'user.x' }] },
      { kind: 'assign', context: 'global', command: 'copy', key: 'F12' }).file;
    const { file } = applyOp(edited, { kind: 'resetAll' });
    expect(file.bindings).toEqual({});
    expect(file.userCommands).toEqual([{ id: 'user.x' }]);
  });

  it('refuses an unbindable command, a bad key and a reserved key', () => {
    for (const op of [
      { kind: 'assign', context: 'global', command: 'runShellCommand', key: 'F12' },
      { kind: 'assign', context: 'global', command: 'copy', key: 'Cmd+/' },
      { kind: 'assign', context: 'global', command: 'copy', key: 'Cmd+Q' },
    ] as const) {
      expect(() => applyOp(emptyFile(), op as never)).toThrow();
    }
  });
});
