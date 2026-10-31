import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerSurface, surfaceHandler, mountedSurfaces } from '@renderer/keys/surfaces';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const off of cleanup) off(); cleanup.length = 0; });

describe('surface registry', () => {
  it('routes a command to the mounted surface', () => {
    const pageDown = vi.fn();
    cleanup.push(registerSurface('viewer', { viewerPageDown: pageDown }));
    surfaceHandler('viewerPageDown')!();
    expect(pageDown).toHaveBeenCalledOnce();
  });

  it('reports which surfaces are mounted', () => {
    expect(mountedSurfaces()).toEqual([]);
    cleanup.push(registerSurface('editor', { editorSave: vi.fn() }));
    expect(mountedSurfaces()).toEqual(['editor']);
  });

  it('forgets a surface once it unmounts', () => {
    const off = registerSurface('viewer', { viewerClose: vi.fn() });
    off();
    expect(surfaceHandler('viewerClose')).toBeNull();
    expect(mountedSurfaces()).toEqual([]);
  });

  it('returns null for a command no surface owns', () =>
    expect(surfaceHandler('copy')).toBeNull());
});
