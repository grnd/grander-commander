import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpRunner } from '@main/ops/runner';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

const collect = (runner: OpRunner, id: string) => {
  const events: import('@shared/types').OpEvent[] = [];
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

  it('skip honors skip answer', async () => {
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

  it('cancel aborts pending op and emits cancelled or error', async () => {
    writeFileSync(join(tmp, 'big'), Buffer.alloc(200 * 1024 * 1024, 0x42));
    const dst = join(tmp, 'out');
    mkdirSync(dst);
    const runner = new OpRunner();
    const id = runner.start({ kind: 'copy', sources: [join(tmp, 'big')], dst });
    const events = collect(runner, id);
    await new Promise((r) => setTimeout(r, 10));
    runner.cancel(id);
    await runner.await(id);
    const last = events[events.length - 1];
    expect(last.kind === 'cancelled' || last.kind === 'error').toBe(true);
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
  });
});
