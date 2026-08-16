import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncView } from '@renderer/components/dialogs/SyncView';
import type { SyncEntry } from '@shared/types';

const entry = (over: Partial<SyncEntry> & { relPath: string; status: SyncEntry['status'] }): SyncEntry => ({
  isDir: false,
  leftSize: 10,
  rightSize: 10,
  leftMtime: 1_700_000_000_000,
  rightMtime: 1_700_000_000_000,
  newer: null,
  typeConflict: false,
  isLink: false,
  ...over,
});

const ENTRIES: SyncEntry[] = [
  entry({ relPath: 'onlyLeft.txt', status: 'left-only', rightSize: null, rightMtime: null }),
  entry({ relPath: 'onlyRight.txt', status: 'right-only', leftSize: null, leftMtime: null }),
  entry({ relPath: 'both.txt', status: 'differ', newer: 'left' }),
  entry({ relPath: 'equal.txt', status: 'same' }),
];

function setup(entries: SyncEntry[] | 'error' = ENTRIES, unreadable: string[] = []) {
  const onRun = vi.fn();
  const scan = vi.fn(async () =>
    entries === 'error'
      ? { ok: false as const, error: { kind: 'permission' as const, path: '/l' } }
      : { ok: true as const, value: { entries, unreadable } });
  render(<SyncView leftRoot="/l" rightRoot="/r" onRun={onRun} onClose={() => {}} scan={scan} />);
  return { onRun, scan };
}

const button = (name: RegExp) => screen.getByRole('button', { name });

describe('SyncView', () => {
  it('summarises the comparison', async () => {
    setup();
    expect(await screen.findByRole('status'))
      .toHaveTextContent('1 left only · 1 right only · 1 differ · 1 equal');
  });

  it('hides equal rows until asked', async () => {
    setup();
    await screen.findByText('onlyLeft.txt');
    expect(screen.queryByText('equal.txt')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /show equal/i }));
    expect(screen.getByText('equal.txt')).toBeInTheDocument();
  });

  it('counts what each action would do', async () => {
    setup();
    expect(await screen.findByRole('button', { name: /Copy missing → \(1\)/ })).toBeEnabled();
    expect(button(/Mirror → \(3\)/)).toBeEnabled();
  });

  it('runs a non-destructive action immediately', async () => {
    const { onRun } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Copy missing →/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
    const [action, plan] = onRun.mock.calls[0];
    expect(action).toBe('copy-missing-right');
    expect(plan.copies).toHaveLength(1);
    expect(plan.deletes).toHaveLength(0);
  });

  it('makes a mirror ask before it deletes anything', async () => {
    const { onRun } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Mirror →/ }));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/move 1 item\(s\) to Trash/);

    fireEvent.click(button(/Mirror →/));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0][1].deletes).toEqual(['/r/onlyRight.txt']);
  });

  it('excludes a row from the plan when it is unticked', async () => {
    const { onRun } = setup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'onlyLeft.txt' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Copy missing → \(1\)/ })).not.toBeInTheDocument());

    fireEvent.click(button(/Mirror →/));
    fireEvent.click(button(/Mirror →/));
    expect(onRun.mock.calls[0][1].copies.map((c: { relPath: string }) => c.relPath)).toEqual(['both.txt']);
  });

  it('disables an action with nothing to do', async () => {
    setup([entry({ relPath: 'equal.txt', status: 'same' })]);
    await screen.findByRole('status');
    expect(button(/Copy missing →/)).toBeDisabled();
    expect(button(/Mirror →/)).toBeDisabled();
  });

  it('rescans when a comparison option changes', async () => {
    const { scan } = setup();
    await screen.findByText('onlyLeft.txt');
    fireEvent.click(screen.getByRole('checkbox', { name: /compare by content/i }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(scan.mock.calls[1][2]).toMatchObject({ byContent: true });
  });

  it('rescans on demand', async () => {
    const { scan } = setup();
    await screen.findByText('onlyLeft.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
  });

  it('flags a type conflict on the row', async () => {
    setup([entry({ relPath: 'thing', status: 'differ', typeConflict: true })]);
    expect(await screen.findByText('type conflict')).toBeInTheDocument();
  });

  it('says so when the folders match', async () => {
    setup([entry({ relPath: 'equal.txt', status: 'same' })]);
    expect(await screen.findByText('No differences.')).toBeInTheDocument();
  });

  it('surfaces a scan error', async () => {
    setup('error');
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
  });
});

// A tree the scan could not read looks empty, so Mirror would trash the other
// side's copies of files that do exist.
describe('SyncView with an incomplete scan', () => {
  it('says the comparison is incomplete and names a folder', async () => {
    setup(ENTRIES, ['/l/locked']);
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/);
    expect(screen.getByRole('alert')).toHaveTextContent('/l/locked');
  });

  it('disables both mirrors', async () => {
    setup(ENTRIES, ['/l/locked']);
    await screen.findByRole('alert');
    expect(button(/Mirror →/)).toBeDisabled();
    expect(button(/← Mirror/)).toBeDisabled();
  });

  // Adding what is missing cannot destroy anything, so it stays available.
  it('leaves copy-missing available', async () => {
    setup(ENTRIES, ['/l/locked']);
    await screen.findByRole('alert');
    expect(button(/Copy missing →/)).toBeEnabled();
  });

  it('refuses to run a mirror even if the button is reached', async () => {
    const { onRun } = setup(ENTRIES, ['/l/locked']);
    await screen.findByRole('alert');
    fireEvent.click(button(/Mirror →/));
    fireEvent.click(button(/Mirror →/));
    expect(onRun).not.toHaveBeenCalled();
  });

  it('says nothing when the scan was complete', async () => {
    setup();
    await screen.findByRole('status');
    expect(screen.queryByText(/incomplete/)).not.toBeInTheDocument();
  });
});
