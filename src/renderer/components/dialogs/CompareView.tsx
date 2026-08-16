// src/renderer/components/dialogs/CompareView.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffResult, DiffRow, OpError } from '@shared/types';
import { formatBytes } from '@shared/text';

type Props = {
  left: string;
  right: string;
  onClose: () => void;
  /** Injected in tests; defaults to the preload bridge. */
  compare?: (left: string, right: string) => Promise<{ ok: true; value: DiffResult } | { ok: false; error: OpError }>;
};

/** Unchanged lines kept either side of a change when folding is on. */
const CONTEXT = 3;

function baseName(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

function describe(e: OpError): string {
  switch (e.kind) {
    case 'not-found': return `Not found: ${e.path}`;
    case 'permission': return `Permission denied: ${e.path}`;
    case 'name-invalid': return e.reason;
    case 'unknown': return e.message;
    default: return e.kind;
  }
}

type Visible =
  | { kind: 'row'; row: DiffRow; index: number }
  | { kind: 'gap'; count: number; index: number };

/**
 * Drop long runs of identical lines, keeping CONTEXT rows of either side, and
 * replace each run with a single "N unchanged lines" marker.
 */
export function foldUnchanged(rows: DiffRow[], context = CONTEXT): Visible[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, i) => {
    if (row.kind === 'same') return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) {
      keep[j] = true;
    }
  });

  const out: Visible[] = [];
  let run = 0;
  rows.forEach((row, i) => {
    if (keep[i]) {
      if (run > 0) { out.push({ kind: 'gap', count: run, index: i - run }); run = 0; }
      out.push({ kind: 'row', row, index: i });
    } else {
      run++;
    }
  });
  if (run > 0) out.push({ kind: 'gap', count: run, index: rows.length - run });
  return out;
}

export function CompareView({ left, right, onClose, compare }: Props) {
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fold, setFold] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    void (async () => {
      const r = await (compare ?? window.gc.fs.compare)(left, right);
      if (cancelled) return;
      if (r.ok) setResult(r.value);
      else setError(describe(r.error));
    })();
    return () => { cancelled = true; };
  }, [left, right, compare]);

  const visible = useMemo(
    () => (result && !result.binary ? (fold ? foldUnchanged(result.rows) : result.rows.map((row, index) => ({ kind: 'row' as const, row, index }))) : []),
    [result, fold],
  );

  const jumpToChange = (direction: 1 | -1) => {
    const host = bodyRef.current;
    if (!host) return;
    const marks = [...host.querySelectorAll<HTMLElement>('tr.is-add, tr.is-del, tr.is-change')];
    if (marks.length === 0) return;
    const top = host.scrollTop;
    const target = direction === 1
      ? marks.find((m) => m.offsetTop > top + 4) ?? marks[0]
      : [...marks].reverse().find((m) => m.offsetTop < top - 4) ?? marks[marks.length - 1];
    host.scrollTop = Math.max(0, target.offsetTop - 40);
  };

  return (
    <div className="gc-compare">
      <div className="gc-compare-head">
        <span className="gc-compare-file" title={left}>{baseName(left)}</span>
        <span className="gc-compare-file" title={right}>{baseName(right)}</span>
      </div>

      {error && <div className="gc-compare-error" role="alert">{error}</div>}
      {!error && !result && <div className="gc-compare-empty">Comparing…</div>}

      {result && result.identical && (
        <div className="gc-compare-verdict is-same" role="status">
          Files are identical ({formatBytes(result.leftSize)}).
        </div>
      )}
      {result && !result.identical && result.binary && (
        <div className="gc-compare-verdict is-diff" role="status">
          Binary files differ — {formatBytes(result.leftSize)} vs {formatBytes(result.rightSize)}.
          Open them with F3 in hex mode to inspect the bytes.
        </div>
      )}

      {result && !result.binary && !result.identical && (
        <>
          <div className="gc-compare-toolbar">
            <span>
              <b className="gc-diff-add-fg">+{result.stats.added}</b>{' '}
              <b className="gc-diff-del-fg">−{result.stats.removed}</b>{' '}
              <b className="gc-diff-change-fg">~{result.stats.changed}</b>
            </span>
            <label>
              <input type="checkbox" checked={fold} onChange={(e) => setFold(e.target.checked)} />
              {' '}fold unchanged
            </label>
            <button type="button" onClick={() => jumpToChange(-1)}>◀ prev</button>
            <button type="button" onClick={() => jumpToChange(1)}>next ▶</button>
            {result.truncated && <span className="gc-compare-truncated">showing first {result.rows.length} rows</span>}
          </div>

          <div className="gc-compare-body" ref={bodyRef}>
            <table className="gc-diff">
              <tbody>
                {visible.map((v) => v.kind === 'gap' ? (
                  <tr key={`gap-${v.index}`} className="is-gap">
                    <td colSpan={4}>⋯ {v.count} unchanged line{v.count === 1 ? '' : 's'}</td>
                  </tr>
                ) : (
                  <tr key={`row-${v.index}`} className={`is-${v.row.kind}`}>
                    <td className="gc-diff-no">{v.row.leftNo ?? ''}</td>
                    <td className="gc-diff-text">{v.row.left ?? ''}</td>
                    <td className="gc-diff-no">{v.row.rightNo ?? ''}</td>
                    <td className="gc-diff-text">{v.row.right ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="gc-modal-actions">
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
