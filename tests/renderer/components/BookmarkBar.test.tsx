import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookmarkBar } from '@renderer/components/BookmarkBar';
import { defaultBindings } from '@shared/commands/catalog';

const slots = (...paths: (string | null)[]) => {
  const out: (string | null)[] = Array.from({ length: 9 }, () => null);
  paths.forEach((p, i) => { out[i] = p; });
  return out;
};

describe('BookmarkBar', () => {
  it('renders nothing while every slot is empty', () => {
    const { container } = render(
      <BookmarkBar bindings={defaultBindings()} bookmarks={slots()} onPick={() => {}} onClear={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the slots that are set, with their number', () => {
    render(<BookmarkBar bindings={defaultBindings()} bookmarks={slots('/a/src', null, '/b/docs')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /src/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /docs/ })).toHaveTextContent('3');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('navigates to the bookmarked path on click', () => {
    const onPick = vi.fn();
    render(<BookmarkBar bindings={defaultBindings()} bookmarks={slots('/a/src')} onPick={onPick} onClear={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /src/ }));
    expect(onPick).toHaveBeenCalledWith('/a/src');
  });

  it('clears a slot on right-click', () => {
    const onClear = vi.fn();
    render(<BookmarkBar bindings={defaultBindings()} bookmarks={slots(null, '/b/docs')} onPick={() => {}} onClear={onClear} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: /docs/ }));
    expect(onClear).toHaveBeenCalledWith(2);
  });

  it('names the root sensibly instead of rendering an empty label', () => {
    render(<BookmarkBar bindings={defaultBindings()} bookmarks={slots('/')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('/');
  });

  it('spells out the shortcut in the tooltip', () => {
    render(<BookmarkBar bindings={defaultBindings()} bookmarks={slots('/a/src')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringContaining('\u23031'));
  });

  // The row carried a Cmd glyph while the slots answer to Ctrl, and Cmd+1..9
  // is taken by tab switching — so the glyph pointed at the wrong modifier.
  it('labels the row with the Control glyph, not Command', () => {
    render(<BookmarkBar bindings={defaultBindings()} bookmarks={slots('/a/src')} onPick={() => {}} onClear={() => {}} />);
    expect(screen.getByText('\u2303')).toBeInTheDocument();
    expect(screen.queryByText('\u2318')).toBeNull();
  });

  // The row used to hardcode its hint, so rebinding the slots would leave it
  // promising a key that no longer jumped anywhere.
  it('shows the key the slots are actually bound to', () => {
    const base = defaultBindings();
    render(
      <BookmarkBar
        bindings={{ ...base, global: { ...base.global, gotoBookmark1: ['Cmd+Alt+1'] } }}
        bookmarks={['/tmp/a', ...Array(8).fill(null)]}
        onPick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringContaining('⌘⌥1'));
  });
});
