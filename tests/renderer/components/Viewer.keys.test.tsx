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

// Cmd+Home / Cmd+End used to jump to the first and last *page* of the file;
// the surface rewrite left them scrolling the loaded 256 KiB window, while the
// generated cheatsheet started promising "Start / End of the file" louder.
describe('Viewer whole-file paging', () => {
  it('reads the last window of a big file on viewerFileEnd', async () => {
    const size = 10_000_000;
    readChunk.mockResolvedValue({ ok: true, value: { bytes: new TextEncoder().encode('abc'), size } });
    render(<Viewer path="/tmp/big.log" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');

    readChunk.mockClear();
    surfaceHandler('viewerFileEnd')!();
    await waitFor(() => {
      const offsets = readChunk.mock.calls.map((c) => c[1]);
      expect(offsets.some((o) => o > 9_000_000)).toBe(true);
    });
  });

  it('reads the first window again on viewerFileStart', async () => {
    const size = 10_000_000;
    readChunk.mockResolvedValue({ ok: true, value: { bytes: new TextEncoder().encode('abc'), size } });
    render(<Viewer path="/tmp/big.log" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');
    surfaceHandler('viewerFileEnd')!();
    await waitFor(() => expect(readChunk.mock.calls.length).toBeGreaterThan(1));

    readChunk.mockClear();
    surfaceHandler('viewerFileStart')!();
    await waitFor(() => expect(readChunk.mock.calls.map((c) => c[1])).toContain(0));
  });
});
