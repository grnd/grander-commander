import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Viewer } from '@renderer/components/Viewer';

const readChunk = vi.fn();

function installApi() {
  (window as unknown as { gc: unknown }).gc = { fs: { readChunk } };
}

function chunk(text: string | Uint8Array, size?: number) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return { ok: true as const, value: { bytes, size: size ?? bytes.length } };
}

beforeEach(() => {
  readChunk.mockReset();
  installApi();
  // jsdom has no object URL plumbing; image mode only needs it not to throw.
  URL.createObjectURL = vi.fn(() => 'blob:stub');
  URL.revokeObjectURL = vi.fn();
});

describe('Viewer', () => {
  it('renders a text file as text', async () => {
    readChunk.mockResolvedValue(chunk('hello\nworld'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);

    await screen.findByText(/hello/);
    expect(screen.getByText(/world/)).toBeInTheDocument();
    expect(screen.getByText('a.txt')).toBeInTheDocument();
  });

  it('opens binary content in hex mode', async () => {
    readChunk.mockResolvedValue(chunk(Uint8Array.from([0x00, 0x01, 0x41])));
    render(<Viewer path="/tmp/blob.dat" variant="overlay" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/00000000/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'hex' })).toHaveClass('is-active');
  });

  it('lets the user force hex on a text file', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');

    fireEvent.click(screen.getByRole('button', { name: 'hex' }));
    await waitFor(() => expect(screen.getByText(/61 62 63/)).toBeInTheDocument());
  });

  it('surfaces a read error instead of rendering an empty document', async () => {
    readChunk.mockResolvedValue({ ok: false, error: { kind: 'permission', path: '/tmp/x' } });
    render(<Viewer path="/tmp/x" variant="overlay" onClose={() => {}} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
  });

  it('offers paging only when the file exceeds the window', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    const { rerender } = render(<Viewer path="/tmp/small.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');
    expect(screen.queryByRole('button', { name: /next/ })).not.toBeInTheDocument();

    readChunk.mockResolvedValue(chunk('abc', 10_000_000));
    rerender(<Viewer path="/tmp/big.txt" variant="overlay" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /next/ })).toBeInTheDocument());
  });

  it('re-reads at the new offset when the page advances', async () => {
    readChunk.mockResolvedValue(chunk('abc', 10_000_000));
    render(<Viewer path="/tmp/big.txt" variant="overlay" onClose={() => {}} />);
    const next = await screen.findByRole('button', { name: /next/ });

    fireEvent.click(next);
    await waitFor(() => {
      const offsets = readChunk.mock.calls.map((c) => c[1]);
      expect(offsets).toContain(3);
    });
  });

  it('closes on the close button', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    const onClose = vi.fn();
    render(<Viewer path="/tmp/a.txt" variant="embedded" onClose={onClose} />);
    await screen.findByText('abc');

    fireEvent.click(screen.getByLabelText('Close viewer'));
    expect(onClose).toHaveBeenCalled();
  });

  it('re-reads when the path changes, as quick view does on every cursor move', async () => {
    readChunk.mockResolvedValue(chunk('first'));
    const { rerender } = render(<Viewer path="/tmp/a.txt" variant="embedded" onClose={() => {}} />);
    await screen.findByText('first');

    readChunk.mockResolvedValue(chunk('second'));
    rerender(<Viewer path="/tmp/b.txt" variant="embedded" onClose={() => {}} />);
    await screen.findByText('second');
    expect(screen.getByText('b.txt')).toBeInTheDocument();
  });
});
