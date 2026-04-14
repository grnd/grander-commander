import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RenamePrompt } from '@renderer/components/dialogs/RenamePrompt';

describe('RenamePrompt', () => {
  it('prefills with old name', () => {
    render(<RenamePrompt oldName="readme.md" onSubmit={() => {}} onCancel={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('readme.md');
  });

  it('submits new name on Enter', () => {
    const onSubmit = vi.fn();
    render(<RenamePrompt oldName="a.txt" onSubmit={onSubmit} onCancel={() => {}} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'b.txt' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('b.txt');
  });
});
