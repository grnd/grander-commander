// src/main/archive/parse.ts
//
// Listing parsers for the three command lines. Kept pure so the output shapes
// can be pinned by tests without spawning anything; every command is run with
// LC_ALL=C so month names and number formats are stable.

import type { ArchiveEntry } from '@shared/types';

/** Strip the trailing slash archives use to mark directories. */
function normalise(path: string): string {
  return path.replace(/\/+$/, '');
}

/**
 * `unzip -Z -T` rows:
 *   `-rw-r--r--  3.0 unx    5 tx stor 20260816.030928 src/sub/b.txt`
 * The header and the trailing summary do not match and fall away on their own.
 */
export function parseZipListing(stdout: string): ArchiveEntry[] {
  const re = /^(\S{10,11})\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})(\d{2})\s+(.*)$/;
  const out: ArchiveEntry[] = [];
  for (const line of stdout.split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    const [, perms, size, y, mo, d, h, mi, sec, rawPath] = m;
    if (!rawPath) continue;
    out.push({
      path: normalise(rawPath),
      isDir: perms.startsWith('d') || rawPath.endsWith('/'),
      size: Number(size),
      mtime: Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${sec}`),
    });
  }
  return out;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * `tar -tvf` rows:
 *   `-rw-r--r--  0 grnd   wheel   6 Aug 16 03:09 src/a.txt`
 *   `-rw-r--r--  0 grnd   wheel   6 Aug 16  2023 src/a.txt`
 *
 * tar omits the year for recent files and the clock for old ones, which is the
 * one lossy corner of this format. `now` is injectable so the "recent files are
 * dated in the last twelve months" rule can be tested.
 */
export function parseTarListing(stdout: string, now: number = Date.now()): ArchiveEntry[] {
  const re = /^([dl-]\S{9,10})\s+\S+\s+\S+\s+\S+\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2}|\d{4})\s+(.*)$/;
  const out: ArchiveEntry[] = [];
  for (const line of stdout.split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    const [, perms, size, mon, day, clockOrYear, rest] = m;
    const month = MONTHS[mon];
    if (month === undefined) continue;
    // `a -> b` for a symlink; the entry is `a`.
    const rawPath = rest.split(' -> ')[0];
    if (!rawPath) continue;

    let mtime = 0;
    const nowDate = new Date(now);
    if (clockOrYear.includes(':')) {
      const [h, mi] = clockOrYear.split(':').map(Number);
      const candidate = new Date(nowDate.getFullYear(), month, Number(day), h, mi);
      // A date in the future means tar meant last year.
      if (candidate.getTime() > now) candidate.setFullYear(candidate.getFullYear() - 1);
      mtime = candidate.getTime();
    } else {
      mtime = new Date(Number(clockOrYear), month, Number(day)).getTime();
    }

    out.push({
      path: normalise(rawPath),
      isDir: perms.startsWith('d') || rawPath.endsWith('/'),
      size: Number(size),
      mtime,
    });
  }
  return out;
}

/**
 * `7z l -slt` emits `Key = Value` blocks after a `----------` marker, one blank
 * line between entries. Far friendlier than the column format, and the only
 * listing here that is not whitespace-sensitive.
 */
export function parseSevenZipListing(stdout: string): ArchiveEntry[] {
  const markerIndex = stdout.indexOf('\n----------\n');
  if (markerIndex < 0) return [];
  const body = stdout.slice(markerIndex + '\n----------\n'.length);

  const out: ArchiveEntry[] = [];
  let current: Record<string, string> = {};
  const flush = () => {
    const path = current.Path;
    if (path) {
      out.push({
        path: normalise(path),
        isDir: (current.Attributes ?? '').split(/\s+/)[0].includes('D'),
        size: Number(current.Size ?? 0) || 0,
        // "2026-08-16 03:09:28.7604531" — fractional seconds and the space
        // separator both need normalising before Date.parse will take it.
        mtime: current.Modified
          ? Date.parse(current.Modified.replace(' ', 'T').replace(/\.\d+$/, '')) || 0
          : 0,
      });
    }
    current = {};
  };

  for (const line of body.split('\n')) {
    if (line.trim() === '') { flush(); continue; }
    const eq = line.indexOf(' = ');
    if (eq < 0) continue;
    current[line.slice(0, eq).trim()] = line.slice(eq + 3).trim();
  }
  flush();
  return out;
}
