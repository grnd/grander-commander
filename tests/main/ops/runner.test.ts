import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OpEvent } from '@shared/types';

const trashPathsMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, value: undefined })));

vi.mock('@main/fs/trash', () => ({
  trashPaths: trashPathsMock,
}));

import { OpRunner } from '@main/ops/runner';

let tmp: string;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'gc-'));
  trashPathsMock.mockReset();
  trashPathsMock.mockResolvedValue({ ok: true, value: undefined });
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tmp, { recursive: true, force: true });
});

const collect = (runner: OpRunner, id: string) => {
  const events: OpEvent[] = [];
  runner.subscribe(id, (e) => events.push(e));
  return events;
};

describe('OpRunner copy', () => {
  it('copies multiple files and emits progress + complete', async () => {
    writeFileSync(join(tmp, 'a'), 'aaa');
    writeFileSync(join(tmp, 'b'), 'bbbb');
    const dst = join(tmp, 'out');
    mkdirSync(dst);

    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'a'), join(tmp, 'b')], dst });
    const events = collect(runner, id);
    await runner.await(id);

    expect(existsSync(join(dst, 'a'))).toBe(true);
    expect(existsSync(join(dst, 'b'))).toBe(true);
    expect(readFileSync(join(dst, 'a'), 'utf8')).toBe('aaa');
    const last = events[events.length - 1];
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') {
      expect(last.filesDone).toBe(2);
      expect(last.bytesDone).toBe(7);
    }
  });

  it('delivers terminal events for empty operations even when subscribing after start returns', async () => {
    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [], dst: join(tmp, 'out') });
    const events = collect(runner, id);

    await runner.await(id);

    expect(events).toContainEqual({ kind: 'complete', filesDone: 0, bytesDone: 0 });
  });

  it('emits conflict event and honors overwrite answer', async () => {
    writeFileSync(join(tmp, 'a'), 'new');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    writeFileSync(join(dst, 'a'), 'old');

    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'a')], dst });
    const events = collect(runner, id);

    await vi.waitFor(() => {
      expect(events.some((e) => e.kind === 'conflict')).toBe(true);
    });
    runner.answerConflict(id, { action: 'overwrite', applyToAll: false });
    await runner.await(id);
    expect(readFileSync(join(dst, 'a'), 'utf8')).toBe('new');
  });

  it('skips files when the conflict answer is skip', async () => {
    writeFileSync(join(tmp, 'a'), 'new');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    writeFileSync(join(dst, 'a'), 'old');

    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'a')], dst });
    const events = collect(runner, id);
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'conflict')).toBe(true));
    runner.answerConflict(id, { action: 'skip', applyToAll: false });
    await runner.await(id);
    expect(readFileSync(join(dst, 'a'), 'utf8')).toBe('old');
  });

  it('rejects rename answers that are not basenames', async () => {
    writeFileSync(join(tmp, 'a'), 'new');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    writeFileSync(join(dst, 'a'), 'old');

    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'a')], dst });
    const events = collect(runner, id);
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'conflict')).toBe(true));
    runner.answerConflict(id, { action: 'rename', newName: 'nested/b', applyToAll: false });
    await runner.await(id);

    const last = events[events.length - 1];
    expect(last.kind).toBe('error');
    if (last.kind === 'error') expect(last.error.kind).toBe('name-invalid');
  });

  it('re-checks rename answers against a newly conflicting destination for moves', async () => {
    writeFileSync(join(tmp, 'a'), 'new');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    writeFileSync(join(dst, 'a'), 'old');
    writeFileSync(join(dst, 'b'), 'existing');

    const runner = new OpRunner();
    const id = runner.start({ kind: 'move', sources: [join(tmp, 'a')], dst });
    const events = collect(runner, id);
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'conflict')).toBe(true));
    runner.answerConflict(id, { action: 'rename', newName: 'b', applyToAll: false });
    await runner.await(id);

    expect(readFileSync(join(tmp, 'a'), 'utf8')).toBe('new');
    expect(readFileSync(join(dst, 'b'), 'utf8')).toBe('existing');
    expect(events.some((e) => e.kind === 'complete')).toBe(false);
    const last = events[events.length - 1];
    expect(last.kind).toBe('error');
    if (last.kind === 'error') expect(last.error.kind).toBe('exists');
  });

  it('copies directories recursively', async () => {
    mkdirSync(join(tmp, 'src', 'nested'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'nested', 'file.txt'), 'nested');
    symlinkSync('nested/file.txt', join(tmp, 'src', 'link.txt'));
    const dst = join(tmp, 'out');
    mkdirSync(dst);

    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'src')], dst });
    await runner.await(id);

    expect(readFileSync(join(dst, 'src', 'nested', 'file.txt'), 'utf8')).toBe('nested');
    expect(existsSync(join(dst, 'src', 'link.txt'))).toBe(true);
  });

  it('cleans completed promises after the retention timeout', async () => {
    vi.useFakeTimers();
    writeFileSync(join(tmp, 'a'), 'aaa');
    const dst = join(tmp, 'out');
    mkdirSync(dst);

    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'a')], dst });
    await runner.await(id);

    expect((runner as unknown as { runningPromise: Map<string, Promise<void>> }).runningPromise.has(id)).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((runner as unknown as { runningPromise: Map<string, Promise<void>> }).runningPromise.has(id)).toBe(false);
  });
});

describe('OpRunner move', () => {
  it('same-volume move uses rename', async () => {
    writeFileSync(join(tmp, 'a'), 'hi');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    const runner = new OpRunner();
    const id = runner.start({ kind: 'move', sources: [join(tmp, 'a')], dst });
    await runner.await(id);

    expect(existsSync(join(tmp, 'a'))).toBe(false);
    expect(readFileSync(join(dst, 'a'), 'utf8')).toBe('hi');
    expect(trashPathsMock).not.toHaveBeenCalled();
  });

  it('uses recursive copy+trash for overwrite moves that cannot rename in place', async () => {
    mkdirSync(join(tmp, 'src', 'nested'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'nested', 'file.txt'), 'nested');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    mkdirSync(join(dst, 'src'));

    const runner = new OpRunner();
    const id = runner.start({ kind: 'move', sources: [join(tmp, 'src')], dst });
    const events = collect(runner, id);
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'conflict')).toBe(true));
    runner.answerConflict(id, { action: 'overwrite', applyToAll: false });
    await runner.await(id);

    expect(readFileSync(join(dst, 'src', 'nested', 'file.txt'), 'utf8')).toBe('nested');
    expect(trashPathsMock).toHaveBeenCalledWith([join(tmp, 'src')]);
  });

  it('emits an error when trashing fails after a copy-backed move', async () => {
    writeFileSync(join(tmp, 'a'), 'hi');
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    writeFileSync(join(dst, 'a'), 'old');
    trashPathsMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'permission', path: join(tmp, 'a') },
    });

    const runner = new OpRunner();
    const id = runner.start({ kind: 'move', sources: [join(tmp, 'a')], dst });
    const events = collect(runner, id);
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'conflict')).toBe(true));
    runner.answerConflict(id, { action: 'overwrite', applyToAll: false });
    await runner.await(id);

    expect(existsSync(join(tmp, 'a'))).toBe(true);
    expect(readFileSync(join(dst, 'a'), 'utf8')).toBe('hi');
    expect(events.some((e) => e.kind === 'complete')).toBe(false);
    const last = events[events.length - 1];
    expect(last.kind).toBe('error');
  });
});
