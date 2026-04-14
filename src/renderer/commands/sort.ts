import type { FileEntry, SortCol, SortDir } from '@shared/types';

export function sortEntries(entries: FileEntry[], sort: { col: SortCol; dir: SortDir }): FileEntry[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const nameCmp = (a: FileEntry, b: FileEntry) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const cmp = (a: FileEntry, b: FileEntry): number => {
    // Dirs always first, regardless of sort dir.
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    switch (sort.col) {
      case 'name': return sign * nameCmp(a, b);
      case 'ext':  return sign * (a.ext.localeCompare(b.ext) || nameCmp(a, b));
      case 'size': return sign * (a.size - b.size || nameCmp(a, b));
      case 'date': return sign * (a.mtime - b.mtime || nameCmp(a, b));
    }
  };

  return [...entries].sort(cmp);
}
