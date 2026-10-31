import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FKeyBar } from '@renderer/components/FKeyBar';
import { defaultBindings } from '@shared/commands/catalog';

describe('FKeyBar', () => {
  it('labels each button with the key actually bound to it', () => {
    render(<FKeyBar bindings={defaultBindings()} onInvoke={() => {}} />);
    expect(screen.getByRole('button', { name: /F5.*Copy/ })).toBeInTheDocument();
    // D6: F9 was advertised with nothing listening; it is openTerminal's key now.
    expect(screen.getByRole('button', { name: /F9.*Term/ })).toBeInTheDocument();
  });

  it('shows no key chip for an action with no binding', () => {
    render(<FKeyBar bindings={defaultBindings()} onInvoke={() => {}} />);
    // Quit deliberately has no key: a keystroke that quits the app is not
    // something this phase adds.
    expect(screen.getByRole('button', { name: 'Quit' }).textContent).toBe('Quit');
  });

  it('follows a rebound key', () => {
    const base = defaultBindings();
    render(<FKeyBar
      bindings={{ ...base, global: { ...base.global, copy: ['F12'] } }}
      onInvoke={() => {}}
    />);
    expect(screen.getByRole('button', { name: /F12.*Copy/ })).toBeInTheDocument();
  });

  it('invokes the command behind the button', () => {
    const onInvoke = vi.fn();
    render(<FKeyBar bindings={defaultBindings()} onInvoke={onInvoke} />);
    screen.getByRole('button', { name: /F8.*Delete/ }).click();
    expect(onInvoke).toHaveBeenCalledWith('trash');
  });
});
