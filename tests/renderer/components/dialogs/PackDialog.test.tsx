import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PackDialog, retarget } from '@renderer/components/dialogs/PackDialog';

function setup(sources = ['/a/one.txt', '/a/two.txt'], defaultName = 'one.txt') {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <PackDialog sources={sources} destDir="/b" defaultName={defaultName}
      onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { onSubmit, onCancel };
}

const nameField = () => screen.getByRole('textbox') as HTMLInputElement;

describe('retarget', () => {
  it('swaps a known archive extension', () => {
    expect(retarget('backup.zip', '.tar.gz')).toBe('backup.tar.gz');
    expect(retarget('backup.tar.gz', '.zip')).toBe('backup.zip');
  });

  it('appends when there is nothing to swap', () => {
    expect(retarget('backup', '.zip')).toBe('backup.zip');
  });

  it('leaves an unrelated extension in the stem', () => {
    expect(retarget('notes.txt', '.zip')).toBe('notes.txt.zip');
  });
});

describe('PackDialog', () => {
  it('proposes a name based on the selection and defaults to zip', () => {
    setup();
    expect(nameField().value).toBe('one.txt.zip');
  });

  it('says how many items go where', () => {
    setup();
    expect(screen.getByText('Pack 2 items into /b')).toBeInTheDocument();
  });

  it('rewrites the extension when the format changes', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tar.gz' } });
    expect(nameField().value).toBe('one.txt.tar.gz');
  });

  it('keeps a name the user typed, only swapping the extension', () => {
    setup();
    fireEvent.change(nameField(), { target: { value: 'release.zip' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tar.xz' } });
    expect(nameField().value).toBe('release.tar.xz');
  });

  it('submits the name and format', () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pack' }));
    expect(onSubmit).toHaveBeenCalledWith('one.txt.7z', '7z');
  });

  it('refuses a name containing a slash', () => {
    setup();
    fireEvent.change(nameField(), { target: { value: 'sub/x.zip' } });
    expect(screen.getByRole('button', { name: 'Pack' })).toBeDisabled();
    expect(screen.getByText(/without a slash/)).toBeInTheDocument();
  });

  it('refuses an empty name', () => {
    setup();
    fireEvent.change(nameField(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Pack' })).toBeDisabled();
  });

  it('cancels without packing', () => {
    const { onSubmit, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
