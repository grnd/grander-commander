import { access } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { copyFile } from './copyFile';
import type { OpError, Result } from '@shared/types';

// Find an unused name of the form "<stem> copy<maybe count>.<ext>" next to src.
async function findFreeName(parent: string, origName: string): Promise<string> {
  const dot = origName.lastIndexOf('.');
  const stem = dot > 0 ? origName.slice(0, dot) : origName;
  const ext = dot > 0 ? origName.slice(dot) : '';
  for (let n = 1; n < 999; n++) {
    const suffix = n === 1 ? ' copy' : ` copy ${n}`;
    const candidate = `${stem}${suffix}${ext}`;
    try { await access(join(parent, candidate)); } catch { return candidate; }
  }
  return `${stem} copy.${Date.now()}${ext}`;
}

export async function duplicate(srcPath: string): Promise<Result<string>> {
  try {
    await access(srcPath);
  } catch {
    return { ok: false, error: { kind: 'not-found', path: srcPath } };
  }
  const parent = dirname(srcPath);
  const name = basename(srcPath);
  const newName = await findFreeName(parent, name);
  const dst = join(parent, newName);
  const r = await copyFile(srcPath, dst, { onProgress: () => {}, signal: undefined, overwrite: false });
  if (!r.ok) {
    const e: OpError = r.error;
    return { ok: false, error: e };
  }
  return { ok: true, value: dst };
}
