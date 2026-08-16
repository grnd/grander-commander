import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MultiRename } from '@renderer/components/dialogs/MultiRename';

const setup = (names = ['IMG_1.jpg', 'IMG_2.jpg'], existing = names) => {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(<MultiRename names={names} existingNames={existing} onApply={onApply} onCancel={onCancel} />);
  return { onApply, onCancel };
};

const previewRows = () =>
  within(screen.getByRole('table')).getAllByRole('row').slice(1); // drop the header

describe('MultiRename', () => {
  it('previews every selected name unchanged before a rule is typed', () => {
    setup();
    const rows = previewRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('IMG_1.jpg');
  });

  it('keeps Rename disabled while nothing would change', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Rename/ })).toBeDisabled();
  });

  it('updates the preview live as the pattern is typed', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/regex/), { target: { value: 'IMG' } });
    fireEvent.change(screen.getByPlaceholderText(/backreferences/), { target: { value: 'pic' } });
    expect(previewRows()[0]).toHaveTextContent('pic_1.jpg');
    expect(screen.getByText(/2 of 2 will be renamed/)).toBeInTheDocument();
  });

  it('shows the counter template result', () => {
    setup();
    const nameField = screen.getByDisplayValue('{name}');
    fireEvent.change(nameField, { target: { value: 'shot{n}' } });
    fireEvent.change(screen.getByLabelText('counter digits'), { target: { value: '2' } });
    expect(previewRows()[0]).toHaveTextContent('shot01.jpg');
    expect(previewRows()[1]).toHaveTextContent('shot02.jpg');
  });

  it('blocks Rename and explains when the rule creates duplicates', () => {
    setup();
    fireEvent.change(screen.getByDisplayValue('{name}'), { target: { value: 'same' } });
    expect(screen.getAllByText('duplicate in batch').length).toBe(2);
    expect(screen.getByRole('button', { name: /^Rename/ })).toBeDisabled();
    expect(screen.getByText(/blocking problem/)).toBeInTheDocument();
  });

  it('reports an invalid regex rather than silently renaming nothing', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/regex/), { target: { value: '([' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid pattern/);
    expect(screen.getByRole('button', { name: /^Rename/ })).toBeDisabled();
  });

  it('hands the full row set to onApply so execution matches the preview', () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByPlaceholderText(/regex/), { target: { value: 'IMG' } });
    fireEvent.change(screen.getByPlaceholderText(/backreferences/), { target: { value: 'pic' } });
    fireEvent.click(screen.getByRole('button', { name: /^Rename/ }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual([
      { oldName: 'IMG_1.jpg', newName: 'pic_1.jpg', changed: true, error: null },
      { oldName: 'IMG_2.jpg', newName: 'pic_2.jpg', changed: true, error: null },
    ]);
  });

  it('flags a collision with a file that is not being renamed', () => {
    setup(['a.txt'], ['a.txt', 'taken.txt']);
    fireEvent.change(screen.getByDisplayValue('{name}'), { target: { value: 'taken' } });
    expect(screen.getByText('name already taken')).toBeInTheDocument();
  });

  it('cancels without applying', () => {
    const { onApply, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
