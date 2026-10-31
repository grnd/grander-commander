import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeymapStore } from '@main/keymap/store';
import { bindingsFor } from '@shared/keymap/lookup';
import type { KeymapSnapshot } from '@shared/keymap/types';

let dir = '';
const file = () => join(dir, 'keymap.json');
const read = () => JSON.parse(readFileSync(file(), 'utf8'));
const copyKeys = (s: KeymapSnapshot) => bindingsFor(s.bindings, 'global', 'copy');

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gc-keymap-')); });

describe('KeymapStore', () => {
  it('starts on the defaults with no file', async () => {
    const store = await KeymapStore.open(dir);
    expect(copyKeys(store.snapshot())).toEqual(['F5', 'Cmd+C']);
    expect(store.snapshot().revision).toBe(1);
  });

  it('commits an edit, bumps the revision and writes the file', async () => {
    const store = await KeymapStore.open(dir);
    const out = await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, 1);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.snapshot.revision).toBe(2);
    expect(read().bindings.global.copy).toEqual(['F5', 'Cmd+C', 'F12']);
    expect(read().version).toBe(1);
  });

  it('reads its own file back after a reopen', async () => {
    const first = await KeymapStore.open(dir);
    await first.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, 1);
    const second = await KeymapStore.open(dir);
    expect(copyKeys(second.snapshot())).toContain('F12');
  });

  it('refuses a stale revision and hands back the current snapshot', async () => {
    const store = await KeymapStore.open(dir);
    await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, 1);
    const out = await store.apply({ kind: 'assign', context: 'global', command: 'move', key: 'F11' }, 1);
    expect(out).toMatchObject({ ok: false, reason: 'stale-revision' });
    if (out.ok) return;
    expect(out.snapshot.revision).toBe(2);
  });

  it('undoes a take-over through its token', async () => {
    const store = await KeymapStore.open(dir);
    const first = await store.apply({ kind: 'assign', context: 'global', command: 'rename', key: 'F5' }, 1);
    if (!first.ok) throw new Error('setup failed');
    expect(first.displaced).toEqual([{ context: 'global', command: 'copy', key: 'F5' }]);
    const out = await store.undo(first.undoToken!, first.snapshot.revision);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(bindingsFor(out.snapshot.bindings, 'global', 'copy')).toEqual(['F5', 'Cmd+C']);
  });

  // The first draft checked the caller's revision but not the token's, so an
  // old undo could erase newer work.
  it('refuses an undo token that a later edit has overtaken', async () => {
    const store = await KeymapStore.open(dir);
    const first = await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, 1);
    if (!first.ok) throw new Error('setup failed');
    await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F11' }, 2);

    const out = await store.undo(first.undoToken!, store.snapshot().revision);
    expect(out).toMatchObject({ ok: false, reason: 'no-undo' });
    expect(copyKeys(store.snapshot())).toEqual(['F5', 'Cmd+C', 'F12', 'F11']);
  });

  // Review Focus 2
  it('refuses to write over a file that changed, and rebases itself', async () => {
    const store = await KeymapStore.open(dir);
    await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, 1);
    writeFileSync(file(), JSON.stringify({ version: 1, bindings: { global: { move: ['F11'] } } }));

    const out = await store.apply({ kind: 'assign', context: 'global', command: 'trash', key: 'F10' }, 2);
    expect(out).toMatchObject({ ok: false, reason: 'external-change' });
    if (out.ok) return;
    expect(bindingsFor(out.snapshot.bindings, 'global', 'move')).toEqual(['F11']);
    expect(read().bindings.global.move).toEqual(['F11']);

    const again = await store.apply(
      { kind: 'assign', context: 'global', command: 'trash', key: 'F10' }, out.snapshot.revision);
    expect(again.ok).toBe(true);
  });

  it('picks up an external edit on reload, once', async () => {
    const store = await KeymapStore.open(dir);
    writeFileSync(file(), JSON.stringify({ version: 1, bindings: { global: { copy: ['F11'] } } }));
    const first = await store.reloadIfChanged();
    expect(first.changed).toBe(true);
    expect(bindingsFor(first.snapshot.bindings, 'global', 'copy')).toEqual(['F11']);
    expect((await store.reloadIfChanged()).changed).toBe(false);
  });

  it('keeps a malformed file as .bak and runs on the defaults', async () => {
    writeFileSync(file(), '{ this is not json');
    const store = await KeymapStore.open(dir);
    expect(copyKeys(store.snapshot())).toEqual(['F5', 'Cmd+C']);
    expect(store.snapshot().diagnostics.map((d) => d.kind)).toContain('unreadable');
    expect(readFileSync(join(dir, 'keymap.bak.json'), 'utf8')).toBe('{ this is not json');
  });

  it('says so when the backup could not be written', async () => {
    writeFileSync(file(), '{ bad');
    chmodSync(dir, 0o500);
    try {
      const store = await KeymapStore.open(dir);
      expect(store.snapshot().diagnostics.map((d) => d.kind)).toContain('backup-failed');
      expect(store.snapshot().readOnly).toBe(true);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  // Review Focus 1
  it('never writes to a file from a newer version', async () => {
    writeFileSync(file(), JSON.stringify({ version: 2, bindings: { global: { copy: ['F11'] } } }));
    const store = await KeymapStore.open(dir);
    expect(store.snapshot().readOnly).toBe(true);
    expect(copyKeys(store.snapshot())).toEqual(['F5', 'Cmd+C']);

    const out = await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, 1);
    expect(out).toMatchObject({ ok: false, reason: 'read-only' });
    expect(read().version).toBe(2);
  });

  it('preserves keys it does not understand', async () => {
    writeFileSync(file(), JSON.stringify({ version: 1, note: 'mine', userCommands: [] }));
    const store = await KeymapStore.open(dir);
    await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' },
      store.snapshot().revision);
    expect(read().note).toBe('mine');
    expect(read().userCommands).toEqual([]);
  });

  it('clears a stale diagnostic once a write succeeds', async () => {
    writeFileSync(file(), '{ bad');
    const store = await KeymapStore.open(dir);
    expect(store.snapshot().diagnostics.length).toBeGreaterThan(0);
    await store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' },
      store.snapshot().revision);
    expect(store.snapshot().diagnostics).toEqual([]);
  });

  it('serialises two edits made from the same revision', async () => {
    const store = await KeymapStore.open(dir);
    const r = store.snapshot().revision;
    const [first, second] = await Promise.all([
      store.apply({ kind: 'assign', context: 'global', command: 'copy', key: 'F12' }, r),
      store.apply({ kind: 'assign', context: 'global', command: 'move', key: 'F11' }, r),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
  });
});
