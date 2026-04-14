import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Volume } from '@shared/types';

export async function listVolumes(): Promise<Volume[]> {
  const vols: Volume[] = [
    { name: 'Home', path: homedir(), kind: 'home' },
    { name: '/', path: '/', kind: 'root' },
  ];

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
