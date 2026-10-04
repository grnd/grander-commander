import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('offers no remedy button for an error that has no action', () => {
    const props = mkProps();
    props.panel.error = 'Permission denied: /tmp/secret';
    render(<Panel {...props} />);
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
  });

  it('opens Full Disk Access settings when macOS privacy blocked the listing', () => {
    const openFullDiskAccessSettings = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { gc: unknown }).gc = { shell: { openFullDiskAccessSettings } };
    const props = mkProps();
    props.panel.error = 'macOS is blocking access to /Users/u/Pictures/Photos Library.photoslibrary';
    props.panel.errorAction = 'full-disk-access';
    render(<Panel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openFullDiskAccessSettings).toHaveBeenCalledTimes(1);
  });
});
