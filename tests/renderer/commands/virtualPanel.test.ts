import { describe, it, expect, vi } from 'vitest';
import { navigateInto, navigateUp, revealPath, showSearchResults } from '@renderer/commands/navigation';
import { cursorPath, entryPath, initialPanelState, targetPaths } from '@renderer/state/panelSlice';
import type { PanelState } from '@renderer/state/panelSlice';
import type { FileEntry } from '@shared/types';

type Panel = PanelState;

const hit = (rel: string, srcPath: string, isDir = false): FileEntry => {
  const dot = rel.lastIndexOf('.');
  const slash = rel.lastIndexOf('/');
  const hasExt = dot > slash + 1 && dot > 0;
  return {
    name: hasExt ? rel.slice(0, dot) : rel,
    ext: hasExt ? rel.slice(dot + 1) : '',
    isDir, isSymlink: false, isAppBundle: false, isHidden: false,
    size: 1, mtime: 0, mode: 0, srcPath,
  };
};

function searchPanel(entries: FileEntry[], roots = ['/root']): Panel {
  let panel: Panel = { ...initialPanelState('/root') };
  showSearchResults(
    { panel, setPanel: (patch) => { panel = { ...panel, ...patch } as Panel; } },
    { label: 'Search: *.ts in /root', roots, entries },
  );
  return panel;
}

const api = () => ({
  fs: { listDir: vi.fn(async () => ({ ok: true as const, value: [] as FileEntry[] })) },
  shell: { openPath: vi.fn(async () => {}) },
});

describe('showSearchResults', () => {
  it('marks the panel as a search source and labels the path bar', () => {
    const panel = searchPanel([hit('a.ts', '/root/a.ts')]);
    expect(panel.source).toEqual({ kind: 'search', label: 'Search: *.ts in /root', roots: ['/root'] });
    expect(panel.path).toBe('Search: *.ts in /root');
  });

  it('adds a .. row and parks the cursor on the first hit', () => {
    const panel = searchPanel([hit('a.ts', '/root/a.ts'), hit('b.ts', '/root/b.ts')]);
    expect(panel.entries[0].name).toBe('..');
    expect(panel.cursor).toBe(1);
  });

  it('leaves the cursor on .. when nothing matched', () => {
    const panel = searchPanel([]);
    expect(panel.cursor).toBe(0);
    expect(panel.entries).toHaveLength(1);
  });

  it('clears any previous selection', () => {
    const panel = searchPanel([hit('a.ts', '/root/a.ts')]);
    expect(panel.selection.size).toBe(0);
  });
});

describe('paths in a virtual panel', () => {
  it('uses the row\'s own location, not panel.path + name', () => {
    const panel = searchPanel([hit('deep/a.ts', '/root/deep/a.ts')]);
    expect(cursorPath(panel)).toBe('/root/deep/a.ts');
  });

  it('resolves marked rows to their real paths for mutations', () => {
    const panel = searchPanel([
      hit('deep/a.ts', '/root/deep/a.ts'),
      hit('other/b.ts', '/elsewhere/other/b.ts'),
    ]);
    panel.selection = new Set(panel.entries.slice(1).map((e) => (e.ext ? `${e.name}.${e.ext}` : e.name)));
    expect(targetPaths(panel)).toEqual(['/root/deep/a.ts', '/elsewhere/other/b.ts']);
  });

  it('still derives ordinary rows from the panel folder', () => {
    const panel = { ...initialPanelState('/dir') };
    const entry: FileEntry = {
      name: 'a', ext: 'txt', isDir: false, isSymlink: false, isAppBundle: false,
      isHidden: false, size: 0, mtime: 0, mode: 0,
    };
    expect(entryPath(panel, entry)).toBe('/dir/a.txt');
  });
});

describe('navigating out of a virtual panel', () => {
  it('opens a matched file with the default app', async () => {
    const panel = searchPanel([hit('a.ts', '/root/deep/a.ts')]);
    const a = api();
    await navigateInto({ panel, setPanel: () => {}, api: a });
    expect(a.shell.openPath).toHaveBeenCalledWith('/root/deep/a.ts');
  });

  it('descends into a matched folder at its real location', async () => {
    const panel = searchPanel([hit('deep', '/root/deep', true)]);
    const a = api();
    await navigateInto({ panel, setPanel: () => {}, api: a });
    expect(a.fs.listDir).toHaveBeenCalledWith('/root/deep', expect.anything());
  });

  it('returns to the search root on ..', async () => {
    const panel = { ...searchPanel([hit('a.ts', '/root/a.ts')]), cursor: 0 };
    const a = api();
    await navigateInto({ panel, setPanel: () => {}, api: a });
    expect(a.fs.listDir).toHaveBeenCalledWith('/root', expect.anything());
  });

  it('returns to the search root on Backspace', async () => {
    const panel = searchPanel([hit('a.ts', '/root/a.ts')], ['/somewhere']);
    const a = api();
    await navigateUp({ panel, setPanel: () => {}, api: a });
    expect(a.fs.listDir).toHaveBeenCalledWith('/somewhere', expect.anything());
  });

  it('drops back to a filesystem source once a real folder loads', async () => {
    const panel = searchPanel([hit('a.ts', '/root/a.ts')]);
    let next = panel;
    const a = api();
    await navigateUp({ panel, setPanel: (p) => { next = { ...next, ...p } as Panel; }, api: a });
    expect(next.source).toEqual({ kind: 'fs' });
  });

  it('reveals a hit in its containing folder with the cursor on it', async () => {
    const panel = searchPanel([hit('deep/a.ts', '/root/deep/a.ts')]);
    const a = api();
    a.fs.listDir.mockResolvedValue({
      ok: true,
      value: [{ name: 'a', ext: 'ts', isDir: false, isSymlink: false, isAppBundle: false, isHidden: false, size: 0, mtime: 0, mode: 0 }],
    });
    let next = panel;
    await revealPath(
      { panel, setPanel: (p) => { next = { ...next, ...p } as Panel; }, api: a },
      '/root/deep/a.ts',
    );
    expect(a.fs.listDir).toHaveBeenCalledWith('/root/deep', expect.anything());
    expect(next.path).toBe('/root/deep');
    expect(next.entries[next.cursor].name).toBe('a');
  });
});
