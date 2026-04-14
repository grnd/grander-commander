import { readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Volume } from '@shared/types';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

// Approximates Finder's default sidebar favorites. Reading the user's actual
// customized sidebar would require parsing the NSKeyedArchiver-encoded
// com.apple.LSSharedFileList.FavoriteItems.sfl2 file, which is brittle.
export async function listVolumes(): Promise<Volume[]> {
  const home = homedir();
  const vols: Volume[] = [
    { name: 'Home', path: home, kind: 'home' },
  ];

  const userFavorites: { name: string; path: string }[] = [
    { name: 'Desktop', path: join(home, 'Desktop') },
    { name: 'Documents', path: join(home, 'Documents') },
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Movies', path: join(home, 'Movies') },
    { name: 'Music', path: join(home, 'Music') },
    { name: 'Pictures', path: join(home, 'Pictures') },
    { name: 'iCloud Drive', path: join(home, 'Library/Mobile Documents/com~apple~CloudDocs') },
  ];
  for (const f of userFavorites) {
    if (await exists(f.path)) vols.push({ ...f, kind: 'home' });
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
