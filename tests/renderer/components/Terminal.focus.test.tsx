import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Terminal } from '@renderer/components/Terminal';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  (window as unknown as { gc: unknown }).gc = {
    terminal: {
      spawn: vi.fn().mockResolvedValue('t1'),
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}),
    },
  };
});

// The pane opened without focus, so the first keys typed into it went to the
// panel instead of the shell — Ctrl+H toggled hidden files rather than erasing
// a character in bash.
describe('Terminal focus', () => {
  it('takes the keyboard when it opens', () => {
    render(<Terminal cwd="/home/u" onClose={() => {}} />);
    expect(document.activeElement?.closest('.gc-terminal')).not.toBeNull();
  });

  it('takes the keyboard when it stops being hidden', () => {
    const { rerender } = render(<Terminal cwd="/home/u" onClose={() => {}} hidden />);
    document.body.focus();
    expect(document.activeElement?.closest('.gc-terminal')).toBeNull();

    rerender(<Terminal cwd="/home/u" onClose={() => {}} />);
    expect(document.activeElement?.closest('.gc-terminal')).not.toBeNull();
  });

  it('does not take the keyboard while hidden', () => {
    render(<Terminal cwd="/home/u" onClose={() => {}} hidden />);
    expect(document.activeElement?.closest('.gc-terminal')).toBeNull();
  });
});
