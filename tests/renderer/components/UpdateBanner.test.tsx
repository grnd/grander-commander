import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { UpdateStatus } from '@shared/types';
import { UpdateBanner } from '@renderer/components/UpdateBanner';

let emit: ((s: UpdateStatus) => void) | null = null;

function mockUpdateApi(initial: UpdateStatus = { kind: 'idle' }) {
  emit = null;
  const api = {
    check: vi.fn(), download: vi.fn(), install: vi.fn(), releaseNotes: vi.fn(),
    status: vi.fn().mockResolvedValue(initial),
    onStatus: vi.fn((cb: (s: UpdateStatus) => void) => { emit = cb; return () => {}; }),
  };
  (window as unknown as { gc: unknown }).gc = { update: api };
  return api;
}

describe('UpdateBanner', () => {
  beforeEach(() => { mockUpdateApi(); });

  it('renders nothing while idle', async () => {
    const { container } = render(<UpdateBanner />);
    await waitFor(() => expect(api_called()).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('stays quiet when the app is up to date', async () => {
    const { container } = render(<UpdateBanner />);
    await waitFor(() => expect(emit).toBeTypeOf('function'));
    emit!({ kind: 'up-to-date', checkedAt: 0 });
    // A background check finding nothing must not take a row of chrome.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('stays quiet on a background error', async () => {
    const { container } = render(<UpdateBanner />);
    await waitFor(() => expect(emit).toBeTypeOf('function'));
    emit!({ kind: 'error', message: 'network unreachable' });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('offers a download when an update is available', async () => {
    const api = mockUpdateApi();
    render(<UpdateBanner />);
    await waitFor(() => expect(emit).toBeTypeOf('function'));
    emit!({ kind: 'available', version: '0.2.0', releaseUrl: 'https://x/tag/v0.2.0' });
    await screen.findByText(/0\.2\.0 is available/);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(api.download).toHaveBeenCalledOnce();
  });

  it('offers restart-and-install once downloaded', async () => {
    const api = mockUpdateApi();
    render(<UpdateBanner />);
    await waitFor(() => expect(emit).toBeTypeOf('function'));
    emit!({ kind: 'ready', version: '0.2.0', releaseUrl: 'https://x/tag/v0.2.0' });
    await screen.findByText(/ready to install/);
    fireEvent.click(screen.getByRole('button', { name: /Restart/ }));
    expect(api.install).toHaveBeenCalledOnce();
  });

  it('stays dismissed for the same version but returns for a newer one', async () => {
    render(<UpdateBanner />);
    await waitFor(() => expect(emit).toBeTypeOf('function'));

    emit!({ kind: 'available', version: '0.2.0', releaseUrl: 'https://x/tag/v0.2.0' });
    await screen.findByText(/0\.2\.0 is available/);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByText(/0\.2\.0 is available/)).toBeNull());

    // Dismissing 0.2.0 must not suppress 0.3.0 — otherwise one "Later" click
    // silently opts the user out of every future update.
    emit!({ kind: 'available', version: '0.3.0', releaseUrl: 'https://x/tag/v0.3.0' });
    await screen.findByText(/0\.3\.0 is available/);
  });

  it('offers release notes for an available update', async () => {
    const api = mockUpdateApi();
    render(<UpdateBanner />);
    await waitFor(() => expect(emit).toBeTypeOf('function'));
    emit!({ kind: 'available', version: '0.2.0', releaseUrl: 'https://x/tag/v0.2.0' });
    await screen.findByText(/0\.2\.0 is available/);
    fireEvent.click(screen.getByRole('button', { name: /What's new/ }));
    // Main holds the URL; the renderer never passes one to openExternal.
    expect(api.releaseNotes).toHaveBeenCalledOnce();
  });
});

function api_called(): boolean {
  return (window as unknown as { gc: { update: { status: { mock: { calls: unknown[] } } } } })
    .gc.update.status.mock.calls.length > 0;
}
