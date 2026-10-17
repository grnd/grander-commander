import { describe, it, expect } from 'vitest';
import {
  dragPaths, dropTarget, droppedPaths, externalPaths, locationPath, resolveDrop,
} from '@renderer/commands/dnd';
import { initialPanelState, type PanelState } from '@renderer/state/panelSlice';
import type { FileEntry } from '@shared/types';

const file = (name: string, ext = '', isDir = false): FileEntry => ({
  name,
  ext,
  isDir,
  isSymlink: false,
  isAppBundle: false,
  isHidden: false,
  size: 1,
  mtime: 0,
  mode: 0,
});

const dotDot = file('..', '', true);

function panel(over: Partial<PanelState> = {}): PanelState {
  return {
    ...initialPanelState('/dir'),
    entries: [dotDot, file('a', 'txt'), file('b', 'txt'), file('sub', '', true)],
    cursor: 1,
    ...over,
  };
}

describe('dragPaths', () => {
  it('drags the row under the pointer when nothing is marked', () => {
    expect(dragPaths(panel(), 1)).toEqual(['/dir/a.txt']);
  });

  it('drags the whole marked set when the grabbed row is part of it', () => {
    const p = panel({ selection: new Set(['a.txt', 'b.txt']) });
    expect(dragPaths(p, 1)).toEqual(['/dir/a.txt', '/dir/b.txt']);
  });

  // Grabbing an unmarked row means that row, not the selection elsewhere.
  it('drags only the grabbed row when it is outside the marked set', () => {
    const p = panel({ selection: new Set(['b.txt']) });
    expect(dragPaths(p, 1)).toEqual(['/dir/a.txt']);
  });

  it('refuses to drag ..', () => {
    expect(dragPaths(panel(), 0)).toEqual([]);
  });

  it('refuses an index that is not there', () => {
    expect(dragPaths(panel(), 99)).toEqual([]);
  });

  it("uses a search hit's real location", () => {
    const hit = { ...file('deep/a', 'txt'), srcPath: '/root/deep/a.txt' };
    const p = panel({
      source: { kind: 'search', label: 'Search', roots: ['/root'] },
      entries: [dotDot, hit],
      cursor: 1,
    });
    expect(dragPaths(p, 1)).toEqual(['/root/deep/a.txt']);
  });
});

describe('dropTarget', () => {
  it('drops into the panel folder when not over a row', () => {
    expect(dropTarget(panel(), null)).toBe('/dir');
  });

  it('drops into a folder row under the pointer', () => {
    expect(dropTarget(panel(), 3)).toBe('/dir/sub');
  });

  it('drops into the panel folder when over a file', () => {
    expect(dropTarget(panel(), 1)).toBe('/dir');
  });

  it('drops into the panel folder when over ..', () => {
    expect(dropTarget(panel(), 0)).toBe('/dir');
  });

  it('refuses a virtual panel, which has no folder to write to', () => {
    const p = panel({ source: { kind: 'search', label: 'Search', roots: ['/root'] } });
    expect(dropTarget(p, null)).toBeNull();
  });
});

describe('resolveDrop', () => {
  it('copies on a plain drop', () => {
    expect(resolveDrop(['/a/x.txt'], '/b', { shiftKey: false })).toEqual({
      kind: 'copy',
      sources: ['/a/x.txt'],
      dest: '/b',
    });
  });

  it('moves when Shift is held', () => {
    expect(resolveDrop(['/a/x.txt'], '/b', { shiftKey: true })?.kind).toBe('move');
  });

  // Dropping a file back where it already lives should do nothing, not raise a
  // conflict prompt about overwriting itself.
  it('ignores sources already in the destination', () => {
    expect(resolveDrop(['/a/x.txt'], '/a', { shiftKey: false })).toBeNull();
  });

  it('keeps the sources that would actually move', () => {
    const intent = resolveDrop(['/a/x.txt', '/c/y.txt'], '/a', { shiftKey: false });
    expect(intent?.sources).toEqual(['/c/y.txt']);
  });

  it('refuses to drop a folder into itself', () => {
    expect(resolveDrop(['/a/sub'], '/a/sub', { shiftKey: false })).toBeNull();
  });

  it('refuses to drop a folder into its own descendant', () => {
    expect(resolveDrop(['/a/sub'], '/a/sub/deeper', { shiftKey: false })).toBeNull();
  });

  it('returns nothing without a destination or sources', () => {
    expect(resolveDrop([], '/b', { shiftKey: false })).toBeNull();
    expect(resolveDrop(['/a/x'], null, { shiftKey: false })).toBeNull();
  });

  it('handles a source at the filesystem root', () => {
    expect(resolveDrop(['/x.txt'], '/b', { shiftKey: false })?.sources).toEqual(['/x.txt']);
    expect(resolveDrop(['/x.txt'], '/', { shiftKey: false })).toBeNull();
  });
});

describe('externalPaths', () => {
  it('reads the location Electron puts on a dropped File', () => {
    const files = [{ path: '/Users/me/a.txt' }, { path: '/Users/me/b.txt' }];
    expect(externalPaths(files as unknown as FileList)).toEqual([
      '/Users/me/a.txt',
      '/Users/me/b.txt',
    ]);
  });

  it('skips anything with no real location, such as dragged text', () => {
    const files = [{ path: '' }, {}, { path: '/Users/me/a.txt' }];
    expect(externalPaths(files as unknown as FileList)).toEqual(['/Users/me/a.txt']);
  });

  it('handles an empty drop', () => {
    expect(externalPaths([] as unknown as FileList)).toEqual([]);
  });
});

describe('droppedPaths', () => {
  const dt = (over: { files?: { path: string }[]; data?: Record<string, string> } = {}) => ({
    files: (over.files ?? []) as unknown as FileList,
    getData: (type: string) => over.data?.[type] ?? '',
  });

  it('reads the real locations off dropped files', () => {
    expect(droppedPaths(dt({ files: [{ path: '/a/one' }, { path: '/a/two' }] }))).toEqual([
      '/a/one', '/a/two',
    ]);
  });

  it('falls back to text/uri-list when nothing carries a File', () => {
    const paths = droppedPaths(dt({
      data: { 'text/uri-list': '# comment\nfile:///Users/me/My%20Stuff\n' },
    }));
    expect(paths).toEqual(['/Users/me/My Stuff']);
  });

  // A link dragged out of a browser is a place, but not one on this disk.
  it('skips uris that are not local files', () => {
    expect(droppedPaths(dt({ data: { 'text/uri-list': 'https://example.com/x' } }))).toEqual([]);
  });

  it('takes a plain absolute path, as a terminal or an editor hands one over', () => {
    expect(droppedPaths(dt({ data: { 'text/plain': '  /Users/me/notes.txt ' } })))
      .toEqual(['/Users/me/notes.txt']);
  });

  it('ignores dropped prose', () => {
    expect(droppedPaths(dt({ data: { 'text/plain': 'see you tomorrow' } }))).toEqual([]);
  });

  it('prefers the files over any text riding along with them', () => {
    const paths = droppedPaths(dt({
      files: [{ path: '/real/file' }],
      data: { 'text/plain': '/decoy' },
    }));
    expect(paths).toEqual(['/real/file']);
  });
});

describe('locationPath', () => {
  it('takes the first of several dropped items — a panel is in one folder', () => {
    expect(locationPath(['/a', '/b'])).toBe('/a');
  });

  it('is null when the drop carried nothing usable', () => {
    expect(locationPath([])).toBeNull();
  });
});
