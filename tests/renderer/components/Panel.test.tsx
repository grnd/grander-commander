import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from '@renderer/components/Panel';
import { initialPanelState } from '@renderer/state/panelSlice';

beforeAll(() => {
  // jsdom has no ResizeObserver; Panel observes its body to size the file list.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const mkProps = () => ({
  side: 'left' as const,
  panel: initialPanelState('/tmp'),
  isActive: true,
  onActivate: vi.fn(),
  onRowMouseDown: vi.fn(),
  onRowDouble: vi.fn(),
  onPathCommit: vi.fn().mockResolvedValue(true),
  onSort: vi.fn(),
});

describe('Panel', () => {
  it('shows the panel error so a failed navigation is not silent', () => {
    const props = mkProps();
    props.panel.error = 'Not found: /tmp/gone';
    render(<Panel {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not found: /tmp/gone');
  });

  it('renders no alert when there is no error', () => {
    render(<Panel {...mkProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
