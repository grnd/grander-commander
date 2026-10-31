import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KeyRecorder } from '@renderer/settings/KeyRecorder';

const setCapture = vi.fn();

beforeEach(() => {
  setCapture.mockReset().mockResolvedValue({ capturing: true });
  (window as unknown as { gc: unknown }).gc = { keymap: { setCapture } };
});

describe('KeyRecorder', () => {
  it('captures a combo by physical key and shows it', () => {
    const onRecord = vi.fn();
    render(<KeyRecorder onRecord={onRecord} onCancel={() => {}} />);
    fireEvent.keyDown(document, { key: 'ç', code: 'KeyC', metaKey: true, shiftKey: true });
    expect(screen.getByText('⌘⇧C')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRecord).toHaveBeenCalledWith('Cmd+Shift+C');
  });

  // Enter and Escape are bindable keys, so they cannot double as the buttons.
  it('records Enter and Escape like any other key', () => {
    const onRecord = vi.fn();
    render(<KeyRecorder onRecord={onRecord} onCancel={() => {}} />);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(screen.getByText('⎋')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });
    expect(screen.getByText('↩')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRecord).toHaveBeenCalledWith('Enter');
  });

  it('cancels on the button and on Cmd+period', () => {
    const onCancel = vi.fn();
    render(<KeyRecorder onRecord={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: '.', code: 'Period', metaKey: true });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ignores a bare modifier', () => {
    render(<KeyRecorder onRecord={() => {}} onCancel={() => {}} />);
    fireEvent.keyDown(document, { key: 'Meta', code: 'MetaLeft', metaKey: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // Review Focus 4
  it('accepts a key Electron cannot express, and says the menu will not show it', () => {
    render(<KeyRecorder onRecord={() => {}} onCancel={() => {}} />);
    fireEvent.keyDown(document, { key: '§', code: 'IntlBackslash' });
    expect(screen.getByText('IntlBackslash')).toBeInTheDocument();
    expect(screen.getByText(/menu cannot show/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('refuses a key the system owns', () => {
    render(<KeyRecorder onRecord={() => {}} onCancel={() => {}} />);
    fireEvent.keyDown(document, { key: 'q', code: 'KeyQ', metaKey: true });
    expect(screen.getByText(/macOS Quit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not let the app act on a key while recording', () => {
    render(<KeyRecorder onRecord={() => {}} onCancel={() => {}} />);
    const e = new KeyboardEvent('keydown', { key: 'F8', code: 'F8', cancelable: true, bubbles: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('tells main it is capturing, and stops on blur', async () => {
    const onCancel = vi.fn();
    const { unmount } = render(<KeyRecorder onRecord={() => {}} onCancel={onCancel} />);

    await waitFor(() => expect(setCapture).toHaveBeenCalledWith({ capturing: true }));
    fireEvent.blur(window);
    expect(onCancel).toHaveBeenCalledOnce();

    unmount();
    await waitFor(() => expect(setCapture).toHaveBeenLastCalledWith({ capturing: false }));
  });
});
