// src/main/archive/format.ts
import type { ArchiveFormat } from '@shared/types';

/**
 * Longest suffix first: `.tar.gz` must beat `.gz`, and `.tgz` is its own thing.
 */
const SUFFIXES: [string, ArchiveFormat][] = [
  ['.tar.gz', 'tar.gz'],
  ['.tar.bz2', 'tar.bz2'],
  ['.tar.xz', 'tar.xz'],
  ['.tgz', 'tar.gz'],
  ['.tbz', 'tar.bz2'],
  ['.tbz2', 'tar.bz2'],
  ['.txz', 'tar.xz'],
  ['.tar', 'tar'],
  ['.zip', 'zip'],
  ['.jar', 'zip'],
  ['.7z', '7z'],
];

export function detectFormat(path: string): ArchiveFormat | null {
  const lower = path.toLowerCase();
  for (const [suffix, format] of SUFFIXES) {
    if (lower.endsWith(suffix)) return format;
  }
  return null;
}

export function isArchivePath(path: string): boolean {
  return detectFormat(path) !== null;
}

/** Which command line drives a given format. */
export function toolFor(format: ArchiveFormat): 'zip' | 'tar' | '7z' {
  if (format === 'zip') return 'zip';
  if (format === '7z') return '7z';
  return 'tar';
}

/** The `tar` compression flag for a format, or '' for an uncompressed tar. */
export function tarCompressionFlag(format: ArchiveFormat): string {
  switch (format) {
    case 'tar.gz': return '-z';
    case 'tar.bz2': return '-j';
    case 'tar.xz': return '-J';
    default: return '';
  }
}

/** Formats offered when creating an archive, in the order they are listed. */
export const CREATABLE_FORMATS: ArchiveFormat[] = ['zip', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar', '7z'];

export const DEFAULT_EXTENSION: Record<ArchiveFormat, string> = {
  zip: '.zip',
  tar: '.tar',
  'tar.gz': '.tar.gz',
  'tar.bz2': '.tar.bz2',
  'tar.xz': '.tar.xz',
  '7z': '.7z',
};
