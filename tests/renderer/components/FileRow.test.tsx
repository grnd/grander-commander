import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileRow } from '@renderer/components/FileRow';
import type { FileEntry } from '@shared/types';

const mk = (over: Partial<FileEntry>): FileEntry => ({
  name: 'a', ext: '', isDir: false, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 0, mtime: 0, mode: 0, ...over,
});

describe('FileRow', () => {
  it('renders name, ext, size, mtime columns', () => {
    const e = mk({ name: 'readme', ext: 'md', size: 1234, mtime: 1712000000000 });
    render(<FileRow entry={e} isCursor={false} isSelected={false} onClick={() => {}} onDoubleClick={() => {}} />);
    expect(screen.getByText('readme')).toBeInTheDocument();
    expect(screen.getByText('md')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows <DIR> for directories', () => {
    const e = mk({ name: 'photos', isDir: true });
    render(<FileRow entry={e} isCursor={false} isSelected={false} onClick={() => {}} onDoubleClick={() => {}} />);
    expect(screen.getByText('<DIR>')).toBeInTheDocument();
  });

  it('applies selected class when isSelected', () => {
    const e = mk({ name: 'a' });
    const { container } = render(
      <FileRow entry={e} isCursor={false} isSelected={true} onClick={() => {}} onDoubleClick={() => {}} />,
    );
    expect(container.firstChild).toHaveClass('is-selected');
  });

  it('applies cursor class when isCursor', () => {
    const e = mk({ name: 'a' });
    const { container } = render(
      <FileRow entry={e} isCursor={true} isSelected={false} onClick={() => {}} onDoubleClick={() => {}} />,
    );
    expect(container.firstChild).toHaveClass('is-cursor');
  });
});
