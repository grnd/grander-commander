import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelStatusBar } from '@renderer/components/PanelStatusBar';
import type { FileEntry } from '@shared/types';

const mk = (over: Partial<FileEntry>): FileEntry => ({
  name: 'a', ext: '', isDir: false, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 100, mtime: 0, mode: 0, ...over,
});

describe('PanelStatusBar', () => {
  it('with no selection, shows total file count and bytes', () => {
    const entries = [mk({ name: 'a', size: 100 }), mk({ name: 'b', size: 200 }), mk({ name: 'dir', isDir: true })];
    render(<PanelStatusBar entries={entries} selection={new Set()} />);
    expect(screen.getByText(/2 files · 300 bytes/)).toBeInTheDocument();
  });

  it('with selection, shows selected count and total bytes', () => {
    const entries = [mk({ name: 'a', size: 100 }), mk({ name: 'b', size: 250 })];
    render(<PanelStatusBar entries={entries} selection={new Set(['a', 'b'])} />);
    expect(screen.getByText(/Selected 2 \/ 2 files · 350 bytes/)).toBeInTheDocument();
  });
});
