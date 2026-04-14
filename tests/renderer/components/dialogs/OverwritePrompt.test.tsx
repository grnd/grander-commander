import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverwritePrompt } from '@renderer/components/dialogs/OverwritePrompt';

describe('OverwritePrompt', () => {
  it('calls onAnswer with overwrite action on button click', () => {
    const onAnswer = vi.fn();
    render(<OverwritePrompt srcPath="/a" dstPath="/b" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
    expect(onAnswer).toHaveBeenCalledWith({ action: 'overwrite', applyToAll: false });
  });

  it('includes applyToAll when the checkbox is checked', () => {
    const onAnswer = vi.fn();
    render(<OverwritePrompt srcPath="/a" dstPath="/b" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onAnswer).toHaveBeenCalledWith({ action: 'skip', applyToAll: true });
  });

  it('Rename button reveals an input and answers with newName', () => {
    const onAnswer = vi.fn();
    render(<OverwritePrompt srcPath="/a" dstPath="/dir/b" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('b');
    fireEvent.change(input, { target: { value: 'b-new' } });
    fireEvent.click(screen.getByRole('button', { name: /use this name/i }));
    expect(onAnswer).toHaveBeenCalledWith({ action: 'rename', newName: 'b-new', applyToAll: false });
  });
});
