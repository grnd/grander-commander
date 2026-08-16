import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, chmod } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { complete } from '@main/fs/complete';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gc-complete-'));
  await mkdir(join(dir, 'components'));
  await mkdir(join(dir, 'commands'));
  await writeFile(join(dir, 'common.ts'), '');
  await writeFile(join(dir, '.hidden'), '');
  await writeFile(join(dir, 'my file.txt'), '');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const values = (c: { value: string }[]) => c.map((x) => x.value);

describe('complete — paths', () => {
  it('offers everything matching the fragment', async () => {
    const r = await complete('com', dir, 'path');
    expect(values(r)).toEqual(['commands', 'common.ts', 'components']);
  });

  it('marks directories so the caller can append a slash', async () => {
    const r = await complete('comp', dir, 'path');
    expect(r).toEqual([{ value: 'components', kind: 'dir' }]);
  });

  it('lists the whole directory for an empty fragment', async () => {
    const r = await complete('', dir, 'path');
    expect(values(r)).toContain('components');
    expect(values(r)).toContain('my file.txt');
  });

  it('hides dotfiles unless the fragment asks for them', async () => {
    expect(values(await complete('', dir, 'path'))).not.toContain('.hidden');
    expect(values(await complete('.h', dir, 'path'))).toEqual(['.hidden']);
  });

  it('keeps the directory part the user already typed', async () => {
    const r = await complete('components/', dir, 'path');
    expect(r).toEqual([]);
    await writeFile(join(dir, 'components', 'Panel.tsx'), '');
    const r2 = await complete('components/Pa', dir, 'path');
    expect(values(r2)).toEqual(['components/Panel.tsx']);
  });

  it('resolves an absolute prefix without consulting cwd', async () => {
    const r = await complete(`${dir}/comp`, '/', 'path');
    expect(values(r)).toEqual([`${dir}/components`]);
  });

  it('expands a leading tilde but echoes it back unexpanded', async () => {
    const r = await complete('~/', homedir(), 'path');
    // Whatever is in $HOME, results must stay written in tilde form so
    // inserting one does not rewrite what the user typed.
    expect(r.every((c) => c.value.startsWith('~/'))).toBe(true);
  });

  it('returns nothing for a directory that does not exist', async () => {
    expect(await complete('no-such-dir/x', dir, 'path')).toEqual([]);
  });
});

describe('complete — commands', () => {
  it('offers shell builtins', async () => {
    const r = await complete('ec', dir, 'command');
    expect(values(r)).toContain('echo');
  });

  it('offers executables found on PATH', async () => {
    const bin = join(dir, 'bin');
    await mkdir(bin);
    const exe = join(bin, 'gc-test-tool');
    await writeFile(exe, '#!/bin/sh\n');
    await chmod(exe, 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bin;
    try {
      expect(values(await complete('gc-test', dir, 'command'))).toEqual(['gc-test-tool']);
    } finally {
      process.env.PATH = prevPath;
    }
  });

  it('skips PATH entries that are not executable', async () => {
    const bin = join(dir, 'bin2');
    await mkdir(bin);
    await writeFile(join(bin, 'gc-not-exec'), 'data');
    const prevPath = process.env.PATH;
    process.env.PATH = bin;
    try {
      expect(await complete('gc-not', dir, 'command')).toEqual([]);
    } finally {
      process.env.PATH = prevPath;
    }
  });

  it('refuses to enumerate every executable for an empty prefix', async () => {
    expect(await complete('', dir, 'command')).toEqual([]);
  });
});
