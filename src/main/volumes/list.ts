import { readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Volume } from '@shared/types';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

// File Provider mounts (Google Drive, Dropbox, OneDrive) live in
// ~/Library/CloudStorage as "Provider-account" directories. Show the provider
// alone, unless one provider has several accounts and the account disambiguates.
export function cloudVolumeNames(dirNames: string[]): { dir: string; name: string }[] {
  const visible = dirNames.filter((n) => !n.startsWith('.'));
  const providerOf = (n: string) => n.split('-')[0];
  const counts = new Map<string, number>();
  for (const n of visible) {
    const p = providerOf(n);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return visible.map((dir) => {
    const p = providerOf(dir);
    return { dir, name: counts.get(p) === 1 ? p : dir };
  });
}

// Approximates Finder's default sidebar favorites. Reading the user's actual
// customized sidebar would require parsing the NSKeyedArchiver-encoded
// com.apple.LSSharedFileList.FavoriteItems.sfl2 file, which is brittle.
export async function listVolumes(): Promise<Volume[]> {
  const home = homedir();
  const vols: Volume[] = [
    { name: 'Home', path: home, kind: 'home' },
  ];

  // Include the standard home subdirectories unconditionally. Probing them
  // with access() triggers macOS TCC prompts for Desktop / Documents /
  // Downloads on every launch of an ad-hoc-signed dev build, which is what
  // caused the "constantly asks for Downloads permission" symptom.
  const userFavorites: { name: string; path: string }[] = [
    { name: 'Desktop', path: join(home, 'Desktop') },
    { name: 'Documents', path: join(home, 'Documents') },
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Movies', path: join(home, 'Movies') },
    { name: 'Music', path: join(home, 'Music') },
    { name: 'Pictures', path: join(home, 'Pictures') },
    { name: 'iCloud Drive', path: join(home, 'Library/Mobile Documents/com~apple~CloudDocs') },
  ];
  for (const f of userFavorites) vols.push({ ...f, kind: 'home' });

  const cloudRoot = join(home, 'Library/CloudStorage');
  try {
    for (const c of cloudVolumeNames(await readdir(cloudRoot))) {
      vols.push({ name: c.name, path: join(cloudRoot, c.dir), kind: 'external' });
    }
  } catch {
    // No CloudStorage dir (no providers installed) — skip.
  }

  if (await exists('/Applications')) {
    vols.push({ name: 'Applications', path: '/Applications', kind: 'home' });
  }

  vols.push({ name: '/', path: '/', kind: 'root' });

  try {
    const names = await readdir('/Volumes');
    for (const name of names) {
      if (name.startsWith('.')) continue;
      vols.push({ name, path: `/Volumes/${name}`, kind: 'external' });
    }
  } catch {
    // /Volumes not readable — skip external volumes
  }

  return vols;
}
