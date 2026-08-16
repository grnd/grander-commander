import { describe, it, expect, vi } from 'vitest';
import {
  archiveChildren, archiveLabel, archiveTargets, innerJoin, innerParent, normaliseInner,
} from '@renderer/commands/archive';
import { navigateInto, navigateUp, openArchive, isKnownArchive } from '@renderer/commands/navigation';
import { initialPanelState, type PanelState } from '@renderer/state/panelSlice';
import type { ArchiveEntry } from '@shared/types';

const entry = (path: string, isDir = false, size = 10): ArchiveEntry =>
  ({ path, isDir, size, mtime: 1_700_000_000_000 });

const FLAT: ArchiveEntry[] = [
  entry('src', true, 0),
  entry('src/a.txt', false, 5),
  entry('src/sub', true, 0),
  entry('src/sub/b.txt', false, 4),
  entry('README.md', false, 12),
];

const names = (rows: { name: string; ext: string }[]) =>
  rows.map((r) => (r.ext ? `${r.name}.${r.ext}` : r.name)).sort();

describe('inner path helpers', () => {
  it('normalises leading and trailing slashes', () => {
    expect(normaliseInner('/a/b/')).toBe('a/b');
    expect(normaliseInner('')).toBe('');
    expect(normaliseInner('/')).toBe('');
  });

  it('walks up one level, stopping at the root', () => {
    expect(innerParent('a/b/c')).toBe('a/b');
    expect(innerParent('a')).toBe('');
    expect(innerParent('')).toBe('');
  });

  it('joins without doubling the slash at the root', () => {
    expect(innerJoin('', 'a')).toBe('a');
    expect(innerJoin('a/b', 'c')).toBe('a/b/c');
  });

  it('labels the archive itself at the root and the folder inside it deeper', () => {
    expect(archiveLabel('/x/t.zip', '')).toBe('/x/t.zip');
    expect(archiveLabel('/x/t.zip', 'src/sub')).toBe('/x/t.zip/src/sub');
  });
});

describe('archiveChildren', () => {
  it('lists only the top level at the root', () => {
    expect(names(archiveChildren(FLAT, ''))).toEqual(['README.md', 'src']);
  });

  it('lists one folder deep', () => {
    expect(names(archiveChildren(FLAT, 'src'))).toEqual(['a.txt', 'sub']);
  });

  it('tolerates a leading or trailing slash on the inner path', () => {
    expect(names(archiveChildren(FLAT, '/src/'))).toEqual(['a.txt', 'sub']);
  });

  it('keeps the extension split for files and not for folders', () => {
    const rows = archiveChildren(FLAT, 'src');
    const file = rows.find((r) => r.name === 'a');
    const dir = rows.find((r) => r.name === 'sub');
    expect(file).toMatchObject({ ext: 'txt', isDir: false, size: 5 });
    expect(dir).toMatchObject({ ext: '', isDir: true });
  });

  // Plenty of archives store `a/b/c.txt` without ever storing `a/`.
  it('invents folders that exist only implicitly', () => {
    const sparse = [entry('deep/nested/c.txt', false, 3)];
    expect(names(archiveChildren(sparse, ''))).toEqual(['deep']);
    expect(archiveChildren(sparse, '')[0].isDir).toBe(true);
    expect(names(archiveChildren(sparse, 'deep'))).toEqual(['nested']);
    expect(names(archiveChildren(sparse, 'deep/nested'))).toEqual(['c.txt']);
  });

  it('prefers a real member over the implied folder of the same name', () => {
    const rows = archiveChildren([entry('src/a.txt'), entry('src', true, 0)], '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'src', isDir: true });
  });

  it('does not confuse a sibling with a matching prefix', () => {
    const rows = archiveChildren([entry('src/a.txt'), entry('srcfoo/b.txt')], 'src');
    expect(names(rows)).toEqual(['a.txt']);
  });

  it('returns nothing for a folder with no members', () => {
    expect(archiveChildren(FLAT, 'nope')).toEqual([]);
  });

  it('handles an empty archive', () => {
    expect(archiveChildren([], '')).toEqual([]);
  });
});

function archivePanel(innerPath = ''): PanelState {
  return {
    ...initialPanelState('/x/t.zip'),
    source: { kind: 'archive', archivePath: '/x/t.zip', innerPath },
    entries: [
      { name: '..', ext: '', isDir: true, isSymlink: false, isAppBundle: false, isHidden: false, size: 0, mtime: 0, mode: 0 },
      ...archiveChildren(FLAT, innerPath),
    ],
    cursor: 1,
  };
}

describe('archiveTargets', () => {
  it('resolves the cursor row to its inner path', () => {
    const panel = archivePanel('src');
    panel.cursor = panel.entries.findIndex((e) => e.name === 'a');
    expect(archiveTargets(panel)).toEqual([{ path: 'src/a.txt', isDir: false }]);
  });

  it('resolves marked rows and keeps their folder flag', () => {
    const panel = archivePanel('src');
    panel.selection = new Set(['a.txt', 'sub']);
    expect(archiveTargets(panel).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
      { path: 'src/a.txt', isDir: false },
      { path: 'src/sub', isDir: true },
    ]);
  });

  it('never targets the .. row', () => {
    const panel = archivePanel();
    panel.cursor = 0;
    expect(archiveTargets(panel)).toEqual([]);
  });

  it('returns nothing for a filesystem panel', () => {
    expect(archiveTargets(initialPanelState('/x'))).toEqual([]);
  });
});

describe('isKnownArchive', () => {
  it('matches the formats the main side supports', () => {
    expect(isKnownArchive('/x/t.zip')).toBe(true);
    expect(isKnownArchive('/x/t.TAR.GZ')).toBe(true);
    expect(isKnownArchive('/x/notes.txt')).toBe(false);
  });
});

const api = (entries: ArchiveEntry[] = FLAT) => ({
  fs: { listDir: vi.fn(async () => ({ ok: true as const, value: [] })) },
  shell: { openPath: vi.fn(async () => {}) },
  archive: {
    list: vi.fn(async () => ({ ok: true as const, value: entries })),
    extractToTemp: vi.fn(async () => ({ ok: true as const, value: '/tmp/gc/a.txt' })),
  },
});

describe('navigating an archive', () => {
  it('opens an archive listing instead of launching the file', async () => {
    const panel = { ...initialPanelState('/x') };
    panel.entries = [{ name: 't', ext: 'zip', isDir: false, isSymlink: false, isAppBundle: false, isHidden: false, size: 1, mtime: 0, mode: 0 }];
    panel.cursor = 0;
    const a = api();
    let next = panel;
    await navigateInto({ panel, setPanel: (p) => { next = { ...next, ...p } as PanelState; }, api: a });

    expect(a.archive.list).toHaveBeenCalledWith('/x/t.zip');
    expect(a.shell.openPath).not.toHaveBeenCalled();
    expect(next.source).toEqual({ kind: 'archive', archivePath: '/x/t.zip', innerPath: '' });
    expect(next.entries[0].name).toBe('..');
  });

  it('falls back to the default app when the archive cannot be read', async () => {
    const panel = { ...initialPanelState('/x') };
    panel.entries = [{ name: 't', ext: 'zip', isDir: false, isSymlink: false, isAppBundle: false, isHidden: false, size: 1, mtime: 0, mode: 0 }];
    panel.cursor = 0;
    const a = api();
    a.archive.list.mockResolvedValue({ ok: false, error: { kind: 'unknown', message: 'broken' } } as never);
    await navigateInto({ panel, setPanel: () => {}, api: a });
    expect(a.shell.openPath).toHaveBeenCalledWith('/x/t.zip');
  });

  it('descends into a folder inside the archive', async () => {
    const panel = archivePanel('');
    panel.cursor = panel.entries.findIndex((e) => e.name === 'src');
    const a = api();
    let next = panel;
    await navigateInto({ panel, setPanel: (p) => { next = { ...next, ...p } as PanelState; }, api: a });
    expect(next.source).toEqual({ kind: 'archive', archivePath: '/x/t.zip', innerPath: 'src' });
    expect(next.path).toBe('/x/t.zip/src');
  });

  it('extracts a member to a scratch copy before opening it', async () => {
    const panel = archivePanel('src');
    panel.cursor = panel.entries.findIndex((e) => e.name === 'a');
    const a = api();
    await navigateInto({ panel, setPanel: () => {}, api: a });
    expect(a.archive.extractToTemp).toHaveBeenCalledWith('/x/t.zip', 'src/a.txt');
    expect(a.shell.openPath).toHaveBeenCalledWith('/tmp/gc/a.txt');
  });

  it('goes up one level inside the archive', async () => {
    const panel = archivePanel('src/sub');
    const a = api();
    let next = panel;
    await navigateUp({ panel, setPanel: (p) => { next = { ...next, ...p } as PanelState; }, api: a });
    expect(next.source).toEqual({ kind: 'archive', archivePath: '/x/t.zip', innerPath: 'src' });
  });

  it('leaves the archive from its root, landing on it in its folder', async () => {
    const panel = archivePanel('');
    const a = api();
    let next = panel;
    await navigateUp({ panel, setPanel: (p) => { next = { ...next, ...p } as PanelState; }, api: a });
    expect(a.fs.listDir).toHaveBeenCalledWith('/x', expect.anything());
    expect(next.source).toEqual({ kind: 'fs' });
  });

  it('surfaces a listing failure in the panel instead of silently doing nothing', async () => {
    const panel = { ...initialPanelState('/x') };
    const a = api();
    a.archive.list.mockResolvedValue({ ok: false, error: { kind: 'permission', path: '/x/t.zip' } } as never);
    let next = panel;
    const ok = await openArchive(
      { panel, setPanel: (p) => { next = { ...next, ...p } as PanelState; }, api: a },
      '/x/t.zip', '',
    );
    expect(ok).toBe(false);
    expect(next.error).toMatch(/Permission denied/);
  });
});
