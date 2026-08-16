import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchDialog, parseDate, parseSize } from '@renderer/components/dialogs/SearchDialog';
import type { FileEntry, SearchOutcome } from '@shared/types';

const hit = (path: string): FileEntry => ({
  name: path, ext: '', isDir: false, isSymlink: false, isAppBundle: false,
  isHidden: false, size: 1, mtime: 0, mode: 0, srcPath: `/root/${path}`,
});

function setup(outcome: Partial<SearchOutcome> = {}) {
  const onResults = vi.fn();
  const onCancel = vi.fn();
  const search = vi.fn(async () => ({
    ok: true as const,
    value: { entries: [hit('a.ts')], scanned: 5, truncated: false, cancelled: false, ...outcome },
  }));
  const cancelSearch = vi.fn(async () => {});
  render(
    <SearchDialog
      root="/root" otherRoot="/other"
      onResults={onResults} onCancel={onCancel}
      search={search} cancelSearch={cancelSearch} />,
  );
  return { onResults, onCancel, search, cancelSearch };
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Search' }));

describe('parseSize', () => {
  it('reads bare bytes and unit suffixes', () => {
    expect(parseSize('10')).toBe(10);
    expect(parseSize('10KB')).toBe(10240);
    expect(parseSize('1.5 MB')).toBe(1572864);
  });

  it('returns null for blank or nonsense', () => {
    expect(parseSize('')).toBeNull();
    expect(parseSize('   ')).toBeNull();
    expect(parseSize('big')).toBeNull();
  });
});

describe('parseDate', () => {
  it('returns null for blank', () => {
    expect(parseDate('')).toBeNull();
  });

  it('reads a date input and can extend it to end of day', () => {
    const start = parseDate('2024-03-01') as number;
    const end = parseDate('2024-03-01', true) as number;
    expect(end - start).toBe(86_399_999);
  });
});

describe('SearchDialog', () => {
  it('sends the typed name pattern and the active folder', async () => {
    const { search } = setup();
    fireEvent.change(screen.getByPlaceholderText(/glob/), { target: { value: '*.ts' } });
    submit();
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search.mock.calls[0][1]).toMatchObject({ roots: ['/root'], namePattern: '*.ts' });
  });

  it('can search both panel folders', async () => {
    const { search } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: /both panel folders/i }));
    submit();
    await waitFor(() => expect(search.mock.calls[0][1].roots).toEqual(['/root', '/other']));
  });

  it('passes the parsed size and date filters', async () => {
    const { search } = setup();
    fireEvent.change(screen.getByLabelText('minimum size'), { target: { value: '10KB' } });
    fireEvent.change(screen.getByLabelText('modified after'), { target: { value: '2024-03-01' } });
    submit();
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search.mock.calls[0][1].minSize).toBe(10240);
    expect(search.mock.calls[0][1].modifiedAfter).toBe(Date.parse('2024-03-01T00:00:00.000'));
  });

  it('hands results back with a label naming the query and root', async () => {
    const { onResults } = setup();
    fireEvent.change(screen.getByPlaceholderText(/glob/), { target: { value: '*.ts' } });
    submit();
    await waitFor(() => expect(onResults).toHaveBeenCalled());
    const [label, roots, entries] = onResults.mock.calls[0];
    expect(label).toContain('*.ts');
    expect(label).toContain('/root');
    expect(roots).toEqual(['/root']);
    expect(entries).toHaveLength(1);
  });

  it('says so when nothing matched instead of opening an empty panel', async () => {
    const { onResults } = setup({ entries: [] });
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent(/No matches \(5 item\(s\) scanned\)/);
    expect(onResults).not.toHaveBeenCalled();
  });

  it('marks a truncated result in the label', async () => {
    const { onResults } = setup({ truncated: true });
    submit();
    await waitFor(() => expect(onResults).toHaveBeenCalled());
    expect(onResults.mock.calls[0][0]).toContain('truncated');
  });

  it('mentions the content pattern in the label', async () => {
    const { onResults } = setup();
    fireEvent.change(screen.getByPlaceholderText(/inside files/), { target: { value: 'needle' } });
    submit();
    await waitFor(() => expect(onResults).toHaveBeenCalled());
    expect(onResults.mock.calls[0][0]).toContain('needle');
  });

  it('surfaces a search error', async () => {
    const search = vi.fn(async () => ({ ok: false as const, error: { kind: 'permission' as const, path: '/root' } }));
    render(
      <SearchDialog root="/root" otherRoot="/other" onResults={() => {}} onCancel={() => {}} search={search} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
  });

  it('offers Stop while a search is running and cancels with the same token', async () => {
    let release: (v: unknown) => void = () => {};
    const search = vi.fn(() => new Promise<never>((r) => { release = r as never; }));
    const cancelSearch = vi.fn(async () => {});
    render(
      <SearchDialog root="/root" otherRoot="/other" onResults={() => {}} onCancel={() => {}}
        search={search as never} cancelSearch={cancelSearch} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const stop = await screen.findByRole('button', { name: 'Stop' });
    fireEvent.click(stop);
    expect(cancelSearch).toHaveBeenCalledWith(search.mock.calls[0][0]);
    release({ ok: true, value: { entries: [], scanned: 0, truncated: false, cancelled: true } });
  });
});
