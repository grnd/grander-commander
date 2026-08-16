import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompareView, foldUnchanged } from '@renderer/components/dialogs/CompareView';
import type { DiffResult, DiffRow } from '@shared/types';

const same = (n: number, text: string): DiffRow =>
  ({ leftNo: n, rightNo: n, left: text, right: text, kind: 'same' });
const change = (n: number, l: string, r: string): DiffRow =>
  ({ leftNo: n, rightNo: n, left: l, right: r, kind: 'change' });

const result = (over: Partial<DiffResult> = {}): DiffResult => ({
  left: '/a/one.txt',
  right: '/b/two.txt',
  identical: false,
  binary: false,
  truncated: false,
  leftSize: 10,
  rightSize: 12,
  rows: [same(1, 'alpha'), change(2, 'old', 'new'), same(3, 'omega')],
  stats: { added: 0, removed: 0, changed: 1 },
  ...over,
});

const renderView = (r: DiffResult | { error: true }) => {
  const compare = vi.fn(async () =>
    'error' in r
      ? { ok: false as const, error: { kind: 'permission' as const, path: '/a/one.txt' } }
      : { ok: true as const, value: r });
  render(<CompareView left="/a/one.txt" right="/b/two.txt" onClose={() => {}} compare={compare} />);
  return compare;
};

describe('foldUnchanged', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => same(i + 1, `l${i}`));

  it('keeps everything when there is nothing to collapse', () => {
    const r = [...rows(2), change(3, 'a', 'b')];
    expect(foldUnchanged(r, 3).filter((v) => v.kind === 'gap')).toHaveLength(0);
  });

  it('collapses a long unchanged run into one marker', () => {
    const r = [change(1, 'a', 'b'), ...rows(50), change(52, 'c', 'd')];
    const folded = foldUnchanged(r, 3);
    const gaps = folded.filter((v) => v.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ count: 44 });
  });

  it('keeps context rows either side of a change', () => {
    const r = [...rows(20), change(21, 'a', 'b'), ...rows(20)];
    const kept = foldUnchanged(r, 3).filter((v) => v.kind === 'row');
    expect(kept).toHaveLength(7); // 3 before + the change + 3 after
  });

  it('collapses a file with no changes at all', () => {
    const folded = foldUnchanged(rows(10), 3);
    expect(folded).toEqual([{ kind: 'gap', count: 10, index: 0 }]);
  });
});

describe('CompareView', () => {
  it('shows both file names', async () => {
    renderView(result());
    expect(await screen.findByText('one.txt')).toBeInTheDocument();
    expect(screen.getByText('two.txt')).toBeInTheDocument();
  });

  it('announces identical files instead of drawing an empty table', async () => {
    renderView(result({ identical: true, rows: [], stats: { added: 0, removed: 0, changed: 0 } }));
    expect(await screen.findByRole('status')).toHaveTextContent(/identical/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('gives binary files a bytes verdict and points at hex mode', async () => {
    renderView(result({ binary: true, rows: [] }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Binary files differ/);
    expect(screen.getByRole('status')).toHaveTextContent(/hex mode/);
  });

  it('renders changed lines side by side', async () => {
    renderView(result());
    expect(await screen.findByText('old')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('summarises the change counts', async () => {
    renderView(result({ stats: { added: 2, removed: 3, changed: 1 } }));
    expect(await screen.findByText('+2')).toBeInTheDocument();
    expect(screen.getByText('−3')).toBeInTheDocument();
    expect(screen.getByText('~1')).toBeInTheDocument();
  });

  it('can unfold the unchanged lines', async () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => same(i + 1, `line ${i}`)),
      change(31, 'old', 'new'),
    ];
    renderView(result({ rows }));
    await screen.findByText('old');
    expect(screen.queryByText('line 0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    // Once per side, since an unchanged line shows in both columns.
    expect(screen.getAllByText('line 0')).toHaveLength(2);
  });

  it('says when the row list was capped', async () => {
    renderView(result({ truncated: true }));
    expect(await screen.findByText(/showing first 3 rows/)).toBeInTheDocument();
  });

  it('surfaces a read error', async () => {
    renderView({ error: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
  });
});
