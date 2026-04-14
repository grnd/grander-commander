import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressDialog } from '@renderer/components/dialogs/ProgressDialog';

describe('ProgressDialog', () => {
  it('shows current file and counts', () => {
    render(<ProgressDialog title="Copying…" filesDone={2} filesTotal={5} bytesDone={100} bytesTotal={500} currentFile="a.bin" onCancel={() => {}} />);
    expect(screen.getByText(/a\.bin/)).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument();
  });

  it('calls onCancel on Cancel click', () => {
    const onCancel = vi.fn();
    render(<ProgressDialog title="x" filesDone={0} filesTotal={1} bytesDone={0} bytesTotal={1} currentFile="" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
