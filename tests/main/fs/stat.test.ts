import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stat as gcStat } from '@main/fs/stat';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gc-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('stat', () => {
  it('returns a FileEntry for an existing file', async () => {
    const p = join(tmp, 'a.txt');
    writeFileSync(p, 'hi');
    const r = await gcStat(p);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('a');
      expect(r.value.ext).toBe('txt');
      expect(r.value.size).toBe(2);
    }
  });

  it('returns not-found for missing path', async () => {
    const r = await gcStat(join(tmp, 'nope'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-found');
  });
});
