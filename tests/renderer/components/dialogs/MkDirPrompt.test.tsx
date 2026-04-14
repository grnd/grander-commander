import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MkDirPrompt } from '@renderer/components/dialogs/MkDirPrompt';

describe('MkDirPrompt', () => {
  it('renders an input and submit button', () => {
    render(<MkDirPrompt onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed name on Enter', () => {
    const onSubmit = vi.fn();
    render(<MkDirPrompt onSubmit={onSubmit} onCancel={() => {}} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  new folder  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('new folder');
  });

  it('does not submit empty name', () => {
    const onSubmit = vi.fn();
    render(<MkDirPrompt onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
