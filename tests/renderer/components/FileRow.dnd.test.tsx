import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileRow } from '@renderer/components/FileRow';
import type { FileEntry } from '@shared/types';

const entry = (name: string, isDir = false): FileEntry =>
  ({ name, ext: '', isDir, isSymlink: false, isAppBundle: false, isHidden: false, size: 1, mtime: 0, mode: 0 });

const noop = () => {};

describe('FileRow drag and drop', () => {
  it('is not draggable without a drag handler', () => {
    render(<FileRow entry={entry('a')} isCursor={false} isSelected={false}
      onMouseDown={noop} onDoubleClick={noop} />);
    expect(screen.getByText('a').parentElement).toHaveAttribute('draggable', 'false');
  });

  it('is draggable once a handler is supplied', () => {
    render(<FileRow entry={entry('a')} isCursor={false} isSelected={false}
      onMouseDown={noop} onDoubleClick={noop} onDragStart={noop} />);
    expect(screen.getByText('a').parentElement).toHaveAttribute('draggable', 'true');
  });

  // ".." is a destination, not a thing to pick up.
  it('never makes .. draggable', () => {
    render(<FileRow entry={entry('..', true)} isCursor={false} isSelected={false}
      onMouseDown={noop} onDoubleClick={noop} onDragStart={noop} />);
    expect(screen.getByText('..').parentElement).toHaveAttribute('draggable', 'false');
  });

  it('reports a drag start', () => {
    const onDragStart = vi.fn();
    render(<FileRow entry={entry('a')} isCursor={false} isSelected={false}
      onMouseDown={noop} onDoubleClick={noop} onDragStart={onDragStart} />);
    fireEvent.dragStart(screen.getByText('a').parentElement as HTMLElement);
    expect(onDragStart).toHaveBeenCalled();
  });

  it('reports a drop', () => {
    const onDrop = vi.fn();
    render(<FileRow entry={entry('sub', true)} isCursor={false} isSelected={false}
      onMouseDown={noop} onDoubleClick={noop} onDrop={onDrop} />);
    fireEvent.drop(screen.getByText('sub').parentElement as HTMLElement);
    expect(onDrop).toHaveBeenCalled();
  });

  it('marks itself as the drop destination when told to', () => {
    render(<FileRow entry={entry('sub', true)} isCursor={false} isSelected={false}
      onMouseDown={noop} onDoubleClick={noop} isDropTarget />);
    expect(screen.getByText('sub').parentElement).toHaveClass('is-drop-target');
  });
});
