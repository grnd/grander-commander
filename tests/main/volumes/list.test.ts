import { describe, it, expect } from 'vitest';
import { listVolumes } from '@main/volumes/list';

describe('listVolumes', () => {
  it('always includes home and root entries', async () => {
    const vols = await listVolumes();
    const kinds = vols.map((v) => v.kind);
    expect(kinds).toContain('home');
    expect(kinds).toContain('root');
  });

  it('home path is absolute and points to user HOME', async () => {
    const vols = await listVolumes();
    const home = vols.find((v) => v.kind === 'home');
    expect(home?.path).toBe(process.env.HOME);
  });

  it('root is /', async () => {
    const vols = await listVolumes();
    expect(vols.find((v) => v.kind === 'root')?.path).toBe('/');
  });
});
