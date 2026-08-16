import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, utimes, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncScan, MTIME_TOLERANCE_MS } from '@main/fs/syncScan';
import type { SyncEntry, SyncOptions } from '@shared/types';

let root: string;
let left: string;
let right: string;

const OPTS: SyncOptions = { showHidden: false, byContent: false, recursive: true };

const write = async (dir: string, rel: string, content: string, mtime?: Date) => {
  const p = join(dir, rel);
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, content);
  if (mtime) await utimes(p, mtime, mtime);
  return p;
};

const scan = async (opts: Partial<SyncOptions> = {}) => {
  const r = await syncScan(left, right, { ...OPTS, ...opts });
  if (!r.ok) throw new Error(`scan failed: ${JSON.stringify(r.error)}`);
  return r.value.entries;
};

/** The full scan result, for the completeness assertions. */
const scanFull = async (opts: Partial<SyncOptions> = {}) => {
  const r = await syncScan(left, right, { ...OPTS, ...opts });
  if (!r.ok) throw new Error(`scan failed: ${JSON.stringify(r.error)}`);
  return r.value;
};

const byPath = (entries: SyncEntry[]) =>
  Object.fromEntries(entries.map((e) => [e.relPath, e.status]));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gc-sync-'));
  left = join(root, 'left');
  right = join(root, 'right');
  await mkdir(left);
  await mkdir(right);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('syncScan', () => {
  it('reports two empty folders as no entries', async () => {
    expect(await scan()).toEqual([]);
  });

  it('classifies one-sided files', async () => {
    await write(left, 'only-left.txt', 'a');
    await write(right, 'only-right.txt', 'b');
    expect(byPath(await scan())).toEqual({
      'only-left.txt': 'left-only',
      'only-right.txt': 'right-only',
    });
  });

  it('treats matching size and mtime as the same file', async () => {
    const when = new Date(1_700_000_000_000);
    await write(left, 'a.txt', 'same', when);
    await write(right, 'a.txt', 'same', when);
    expect(byPath(await scan())).toEqual({ 'a.txt': 'same' });
  });

  it('flags a size difference without reading the files', async () => {
    const when = new Date(1_700_000_000_000);
    await write(left, 'a.txt', 'short', when);
    await write(right, 'a.txt', 'much longer', when);
    const [entry] = await scan();
    expect(entry.status).toBe('differ');
  });

  it('flags an mtime difference beyond the tolerance', async () => {
    await write(left, 'a.txt', 'abcd', new Date(1_700_000_000_000));
    await write(right, 'a.txt', 'abcd', new Date(1_700_000_600_000));
    const [entry] = await scan();
    expect(entry.status).toBe('differ');
    expect(entry.newer).toBe('right');
  });

  // FAT and many network shares round mtimes to two seconds, so a faithful
  // copy can come back off by up to that much.
  it('ignores an mtime difference within the tolerance', async () => {
    await write(left, 'a.txt', 'abcd', new Date(1_700_000_000_000));
    await write(right, 'a.txt', 'abcd', new Date(1_700_000_000_000 + MTIME_TOLERANCE_MS - 100));
    expect(byPath(await scan())).toEqual({ 'a.txt': 'same' });
  });

  it('trusts content over timestamps when asked', async () => {
    await write(left, 'a.txt', 'abcd', new Date(1_700_000_000_000));
    await write(right, 'a.txt', 'abcd', new Date(1_700_000_600_000));
    expect(byPath(await scan({ byContent: true }))).toEqual({ 'a.txt': 'same' });
  });

  it('still detects same-size different-content files by content', async () => {
    const when = new Date(1_700_000_000_000);
    await write(left, 'a.txt', 'abcd', when);
    await write(right, 'a.txt', 'wxyz', when);
    expect(byPath(await scan())).toEqual({ 'a.txt': 'same' }); // timestamps agree
    expect(byPath(await scan({ byContent: true }))).toEqual({ 'a.txt': 'differ' });
  });

  it('descends into folders present on both sides', async () => {
    await write(left, 'sub/a.txt', 'x');
    await mkdir(join(right, 'sub'));
    expect(byPath(await scan())).toEqual({ sub: 'same', 'sub/a.txt': 'left-only' });
  });

  it('reports a one-sided folder as a single entry, not its whole subtree', async () => {
    await write(left, 'sub/deep/a.txt', 'x');
    expect(byPath(await scan())).toEqual({ sub: 'left-only' });
  });

  it('stops at the top level when recursion is off', async () => {
    await write(left, 'sub/a.txt', 'x');
    await mkdir(join(right, 'sub'));
    expect(byPath(await scan({ recursive: false }))).toEqual({ sub: 'same' });
  });

  it('skips hidden files unless asked', async () => {
    await write(left, '.secret', 'x');
    expect(await scan()).toEqual([]);
    expect(byPath(await scan({ showHidden: true }))).toEqual({ '.secret': 'left-only' });
  });

  it('marks a folder-versus-file clash as a type conflict', async () => {
    await write(left, 'thing', 'a file');
    await mkdir(join(right, 'thing'));
    const [entry] = await scan();
    expect(entry.status).toBe('differ');
    expect(entry.typeConflict).toBe(true);
  });

  it('carries both sizes and timestamps for the UI', async () => {
    await write(left, 'a.txt', 'abc');
    await write(right, 'a.txt', 'abcdef');
    const [entry] = await scan();
    expect(entry.leftSize).toBe(3);
    expect(entry.rightSize).toBe(6);
    expect(entry.leftMtime).toBeGreaterThan(0);
  });

  it('returns entries sorted by path', async () => {
    await write(left, 'z.txt', 'x');
    await write(left, 'a.txt', 'x');
    await write(left, 'm.txt', 'x');
    expect((await scan()).map((e) => e.relPath)).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });

  it('refuses a root that is not a folder', async () => {
    const file = await write(root, 'plain.txt', 'x');
    const r = await syncScan(file, right, OPTS);
    expect(r.ok).toBe(false);
  });

  it('reports a missing root as not-found', async () => {
    const r = await syncScan(join(root, 'nope'), right, OPTS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('not-found');
  });
});
// Both found by the pre-release review; both let Mirror destroy data.
describe('syncScan safety', () => {
  it('reports a clean scan as complete', async () => {
    await write(left, 'a.txt', 'x');
    expect((await scanFull()).unreadable).toEqual([]);
  });

  // A tree the scan cannot read looks empty, so Mirror would trash the other
  // side's perfectly good copies of files it simply could not see.
  it('records an unreadable folder instead of reporting it empty', async () => {
    await write(left, 'locked/secret.txt', 'x');
    await chmod(join(left, 'locked'), 0o000);
    try {
      const result = await scanFull();
      expect(result.unreadable.length).toBeGreaterThan(0);
      expect(result.unreadable.some((p) => p.endsWith('/locked'))).toBe(true);
    } finally {
      await chmod(join(left, 'locked'), 0o755);
    }
  });

  // Following one takes the comparison outside the folder the user picked, and
  // Mirror would then copy into and delete out of wherever it points.
  it('never descends a symlinked directory', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'private.txt'), 'do not touch');
    await symlink(outside, join(left, 'link'));

    const entries = await scan();
    expect(entries.map((e) => e.relPath)).toEqual(['link']);
    expect(entries.map((e) => e.relPath)).not.toContain('link/private.txt');
  });

  it('marks the link so the plan can see what it is', async () => {
    const outside = join(root, 'outside2');
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(left, 'link2'));
    const entry = (await scan()).find((e) => e.relPath === 'link2');
    expect(entry?.isLink).toBe(true);
  });
});
