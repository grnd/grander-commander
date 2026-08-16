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

/**
 * jsdom gives every element zero height and never scrolls, so the scroll box
 * is faked: the handler only ever reads clientHeight/scrollHeight/scrollTop and
 * writes scrollTop, which is exactly what these stubs expose.
 */
function fakeScrollBox(el: HTMLElement, opts: { scrollHeight: number; clientHeight: number; scrollTop?: number }) {
  let top = opts.scrollTop ?? 0;
  Object.defineProperty(el, 'scrollHeight', { value: opts.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: opts.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: (v: number) => { top = Math.max(0, Math.min(v, opts.scrollHeight - opts.clientHeight)); },
    configurable: true,
  });
  return { get top() { return top; } };
}

const viewerBody = () => document.querySelector('.gc-viewer-body') as HTMLElement;

// The bug: nothing in the overlay held focus, so arrow and page keys went to
// the document — which does not scroll — and only the trackpad worked.
describe('Viewer keyboard scrolling', () => {
  it('focuses its body so the keys have somewhere to land', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');
    expect(document.activeElement).toBe(viewerBody());
  });

  it('scrolls a line at a time on the arrows', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');
    const box = fakeScrollBox(viewerBody(), { scrollHeight: 1000, clientHeight: 100 });

    fireEvent.keyDown(viewerBody(), { key: 'ArrowDown' });
    expect(box.top).toBeGreaterThan(0);
    const afterDown = box.top;
    fireEvent.keyDown(viewerBody(), { key: 'ArrowUp' });
    expect(box.top).toBeLessThan(afterDown);
  });

  it('scrolls a screenful on PageDown, and on Space', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');
    const box = fakeScrollBox(viewerBody(), { scrollHeight: 5000, clientHeight: 300 });

    fireEvent.keyDown(viewerBody(), { key: 'PageDown' });
    const afterPage = box.top;
    expect(afterPage).toBeGreaterThan(100);

    fireEvent.keyDown(viewerBody(), { key: ' ' });
    expect(box.top).toBeGreaterThan(afterPage);
  });

  it('jumps to the ends with Home and End', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');
    const box = fakeScrollBox(viewerBody(), { scrollHeight: 5000, clientHeight: 300, scrollTop: 900 });

    fireEvent.keyDown(viewerBody(), { key: 'Home' });
    expect(box.top).toBe(0);
    fireEvent.keyDown(viewerBody(), { key: 'End' });
    expect(box.top).toBe(4700);
  });

  // Reaching the end of a page should carry on into the file, not stop dead.
  it('turns the page when PageDown hits the bottom', async () => {
    readChunk.mockResolvedValue(chunk('abc', 10_000_000));
    render(<Viewer path="/tmp/big.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByRole('button', { name: /next/ });
    fakeScrollBox(viewerBody(), { scrollHeight: 100, clientHeight: 100 });

    readChunk.mockClear();
    fireEvent.keyDown(viewerBody(), { key: 'PageDown' });
    await waitFor(() => expect(readChunk.mock.calls.map((c) => c[1])).toContain(3));
  });

  it('turns back when PageUp hits the top', async () => {
    readChunk.mockResolvedValue(chunk('abc', 10_000_000));
    render(<Viewer path="/tmp/big.txt" variant="overlay" onClose={() => {}} />);
    const next = await screen.findByRole('button', { name: /next/ });
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByRole('button', { name: /previous/ })).toBeEnabled());
    fakeScrollBox(viewerBody(), { scrollHeight: 100, clientHeight: 100, scrollTop: 0 });

    readChunk.mockClear();
    fireEvent.keyDown(viewerBody(), { key: 'PageUp' });
    await waitFor(() => expect(readChunk.mock.calls.map((c) => c[1])).toContain(0));
  });

  // Escape and F3 belong to the app's key router, which is what closes it.
  it('leaves Escape and F3 alone', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="overlay" onClose={() => {}} />);
    await screen.findByText('abc');

    expect(fireEvent.keyDown(viewerBody(), { key: 'Escape' })).toBe(true);
    expect(fireEvent.keyDown(viewerBody(), { key: 'F3' })).toBe(true);
  });

  // Quick view sits beside a panel that still owns the cursor keys.
  it('does not take the keyboard in the embedded variant', async () => {
    readChunk.mockResolvedValue(chunk('abc'));
    render(<Viewer path="/tmp/a.txt" variant="embedded" onClose={() => {}} />);
    await screen.findByText('abc');
    expect(document.activeElement).not.toBe(viewerBody());

    const box = fakeScrollBox(viewerBody(), { scrollHeight: 1000, clientHeight: 100 });
    fireEvent.keyDown(viewerBody(), { key: 'ArrowDown' });
    expect(box.top).toBe(0);
  });
});
