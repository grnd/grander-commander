import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Viewer } from '@renderer/components/Viewer';
import { surfaceHandler, mountedSurfaces } from '@renderer/keys/surfaces';

const readChunk = vi.fn();

beforeEach(() => {
  readChunk.mockReset();
  readChunk.mockResolvedValue({ ok: true as const, value: { bytes: new TextEncoder().encode('abc'), size: 3 } });
  (window as unknown as { gc: unknown }).gc = { fs: { readChunk } };
});

describe('Viewer as a surface', () => {
  it('registers its actions while it is mounted and gives them up on unmount', async () => {
    const { unmount } = render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);

    await waitFor(() => expect(mountedSurfaces()).toContain('viewer'));
    expect(surfaceHandler('viewerPageDown')).toBeTypeOf('function');
    expect(surfaceHandler('viewerClose')).toBeTypeOf('function');

    unmount();
    expect(mountedSurfaces()).not.toContain('viewer');
  });

  it('closes through the registered handler', async () => {
    const onClose = vi.fn();
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={onClose} />);
    await screen.findByText('abc');

    surfaceHandler('viewerClose')!();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Quick view sits beside a panel that still owns the cursor keys.
  it('registers nothing in the embedded variant', async () => {
    render(<Viewer path="/tmp/a.txt" variant="embedded" onClose={() => {}} />);
    await screen.findByText('abc');
    expect(mountedSurfaces()).not.toContain('viewer');
  });
});
