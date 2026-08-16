import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookmarkBar } from '@renderer/components/BookmarkBar';

const slots = (...paths: (string | null)[]) => {
  const out: (string | null)[] = Array.from({ length: 9 }, () => null);
  paths.forEach((p, i) => { out[i] = p; });
  return out;
};

describe('BookmarkBar', () => {
  it('renders nothing while every slot is empty', () => {
    const { container } = render(
      <BookmarkBar bookmarks={slots()} onPick={() => {}} onClear={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the slots that are set, with their number', () => {
    render(<BookmarkBar bookmarks={slots('/a/src', null, '/b/docs')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /src/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /docs/ })).toHaveTextContent('3');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('navigates to the bookmarked path on click', () => {
    const onPick = vi.fn();
    render(<BookmarkBar bookmarks={slots('/a/src')} onPick={onPick} onClear={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /src/ }));
    expect(onPick).toHaveBeenCalledWith('/a/src');
  });

  it('clears a slot on right-click', () => {
    const onClear = vi.fn();
    render(<BookmarkBar bookmarks={slots(null, '/b/docs')} onPick={() => {}} onClear={onClear} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: /docs/ }));
    expect(onClear).toHaveBeenCalledWith(2);
  });

  it('names the root sensibly instead of rendering an empty label', () => {
    render(<BookmarkBar bookmarks={slots('/')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('/');
  });

  it('spells out the shortcut in the tooltip', () => {
    render(<BookmarkBar bookmarks={slots('/a/src')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringContaining('Ctrl+1'));
  });
});
