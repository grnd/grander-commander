import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cheatsheet } from '@renderer/components/Cheatsheet';
import { defaultBindings } from '@shared/commands/catalog';

describe('Cheatsheet', () => {
  it('lists shortcuts from the catalog, not from a copy of it', () => {
    const base = defaultBindings();
    render(<Cheatsheet bindings={{ ...base, global: { ...base.global, copy: ['Cmd+Shift+C'] } }} />);
    expect(screen.getByText('⌘⇧C')).toBeInTheDocument();
    expect(screen.queryByText('F5')).toBeNull();
  });

  it('names every command it shows', () => {
    render(<Cheatsheet bindings={defaultBindings()} />);
    expect(screen.getByText('Copy to the other pane')).toBeInTheDocument();
    expect(screen.getByText('Move to Trash')).toBeInTheDocument();
  });

  it('leaves out a command with no key', () => {
    render(<Cheatsheet bindings={defaultBindings()} />);
    // quitApp has no binding, so it is not a shortcut to advertise.
    expect(screen.queryByText('Quit')).toBeNull();
  });

  // Gestures and explanations are not bindings, and would be lost by a purely
  // generated list.
  it('keeps the hand-written help', () => {
    render(<Cheatsheet bindings={defaultBindings()} />);
    expect(screen.getByText(/Drag to other panel/i)).toBeInTheDocument();
    expect(screen.getByText(/quick search/i)).toBeInTheDocument();
  });
});
