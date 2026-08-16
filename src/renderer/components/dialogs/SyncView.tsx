// src/renderer/components/dialogs/SyncView.tsx
import { useEffect, useMemo, useState } from 'react';
import type { OpError, Result, SyncEntry, SyncOptions, SyncStatus } from '@shared/types';
import { formatBytes } from '@shared/text';
import {
  buildSyncPlan, countFor, isDestructive, SYNC_LABELS, type SyncAction, type SyncPlan,
} from '@renderer/commands/sync';

type Props = {
  leftRoot: string;
  rightRoot: string;
  onRun: (action: SyncAction, plan: SyncPlan) => void;
  onClose: () => void;
  /** Injected in tests; defaults to the preload bridge. */
  scan?: (left: string, right: string, opts: SyncOptions) => Promise<Result<SyncEntry[]>>;
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  'left-only': 'left only',
  'right-only': 'right only',
  differ: 'differ',
  same: 'same',
};

const STATUS_MARK: Record<SyncStatus, string> = {
  'left-only': '→',
  'right-only': '←',
  differ: '≠',
  same: '=',
};

const ACTIONS: SyncAction[] = [
  'copy-missing-right', 'copy-missing-left', 'mirror-right', 'mirror-left',
];

function describe(e: OpError): string {
  switch (e.kind) {
    case 'not-found': return `Not found: ${e.path}`;
    case 'permission': return `Permission denied: ${e.path}`;
    case 'name-invalid': return e.reason;
    case 'unknown': return e.message;
    default: return e.kind;
  }
}

function when(ms: number | null): string {
  if (ms === null) return '';
  return new Date(ms).toLocaleString();
}

export function SyncView({ leftRoot, rightRoot, onRun, onClose, scan }: Props) {
  const [opts, setOpts] = useState<SyncOptions>({ showHidden: false, byContent: false, recursive: true });
  const [entries, setEntries] = useState<SyncEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<SyncAction | null>(null);
  const [scanToken, setScanToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    setExcluded(new Set());
    setConfirming(null);
    void (async () => {
      const r = await (scan ?? window.gc.fs.syncScan)(leftRoot, rightRoot, opts);
      if (cancelled) return;
      if (r.ok) setEntries(r.value);
      else setError(describe(r.error));
    })();
    return () => { cancelled = true; };
  }, [leftRoot, rightRoot, opts, scan, scanToken]);

  const visible = useMemo(
    () => (entries ?? []).filter((e) => showSame || e.status !== 'same'),
    [entries, showSame],
  );

  // Selection is expressed as exclusions so a rescan cannot silently drop rows
  // the user had ticked.
  const selected = useMemo(
    () => new Set(visible.filter((e) => !excluded.has(e.relPath)).map((e) => e.relPath)),
    [visible, excluded],
  );

  const counts = useMemo(() => {
    const list = entries ?? [];
    return Object.fromEntries(
      ACTIONS.map((a) => [a, countFor(list, leftRoot, rightRoot, a, selected)]),
    ) as Record<SyncAction, { copies: number; deletes: number }>;
  }, [entries, leftRoot, rightRoot, selected]);

  const summary = useMemo(() => {
    const list = entries ?? [];
    return {
      leftOnly: list.filter((e) => e.status === 'left-only').length,
      rightOnly: list.filter((e) => e.status === 'right-only').length,
      differ: list.filter((e) => e.status === 'differ').length,
      same: list.filter((e) => e.status === 'same').length,
    };
  }, [entries]);

  const trigger = (action: SyncAction) => {
    if (isDestructive(action) && confirming !== action) { setConfirming(action); return; }
    setConfirming(null);
    onRun(action, buildSyncPlan(entries ?? [], leftRoot, rightRoot, action, selected));
  };

  const toggle = (relPath: string) => setExcluded((prev) => {
    const next = new Set(prev);
    if (next.has(relPath)) next.delete(relPath);
    else next.add(relPath);
    return next;
  });

  return (
    <div className="gc-sync">
      <div className="gc-sync-roots">
        <span title={leftRoot}>{leftRoot}</span>
        <span title={rightRoot}>{rightRoot}</span>
      </div>

      <div className="gc-sync-toolbar">
        <label>
          <input type="checkbox" checked={opts.byContent}
            onChange={(e) => setOpts({ ...opts, byContent: e.target.checked })} />
          {' '}compare by content
        </label>
        <label>
          <input type="checkbox" checked={opts.showHidden}
            onChange={(e) => setOpts({ ...opts, showHidden: e.target.checked })} />
          {' '}hidden files
        </label>
        <label>
          <input type="checkbox" checked={opts.recursive}
            onChange={(e) => setOpts({ ...opts, recursive: e.target.checked })} />
          {' '}subfolders
        </label>
        <label>
          <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />
          {' '}show equal
        </label>
        <button type="button" onClick={() => setScanToken((t) => t + 1)}>Rescan</button>
      </div>

      {error && <div className="gc-sync-error" role="alert">{error}</div>}
      {!error && entries === null && <div className="gc-sync-empty">Scanning…</div>}

      {entries && (
        <>
          <div className="gc-sync-summary" role="status">
            {summary.leftOnly} left only · {summary.rightOnly} right only ·{' '}
            {summary.differ} differ · {summary.same} equal
          </div>

          {visible.length === 0 ? (
            <div className="gc-sync-empty">
              {entries.length === 0 ? 'Both folders are empty.' : 'No differences.'}
            </div>
          ) : (
            <div className="gc-sync-body">
              <table className="gc-sync-table">
                <thead>
                  <tr>
                    <th />
                    <th>Name</th>
                    <th>Left</th>
                    <th />
                    <th>Right</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.relPath} className={`is-${e.status}`}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={e.relPath}
                          checked={!excluded.has(e.relPath)}
                          onChange={() => toggle(e.relPath)}
                        />
                      </td>
                      <td className="gc-sync-name">
                        {e.isDir ? '📁 ' : ''}{e.relPath}
                        {e.typeConflict && <span className="gc-sync-badge">type conflict</span>}
                      </td>
                      <td className="gc-sync-cell" title={when(e.leftMtime)}>
                        {e.leftSize === null ? '—' : e.isDir ? '<dir>' : formatBytes(e.leftSize)}
                      </td>
                      <td className={`gc-sync-mark is-${e.status}`} title={STATUS_LABEL[e.status]}>
                        {STATUS_MARK[e.status]}
                        {e.status === 'differ' && e.newer && (
                          <span className="gc-sync-newer">{e.newer === 'left' ? '‹' : '›'}</span>
                        )}
                      </td>
                      <td className="gc-sync-cell" title={when(e.rightMtime)}>
                        {e.rightSize === null ? '—' : e.isDir ? '<dir>' : formatBytes(e.rightSize)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirming && (
        <div className="gc-sync-confirm" role="alert">
          {SYNC_LABELS[confirming]} will copy {counts[confirming].copies} item(s) and move{' '}
          {counts[confirming].deletes} item(s) to Trash. Click again to confirm.
        </div>
      )}

      <div className="gc-modal-actions gc-sync-actions">
        {ACTIONS.map((a) => {
          const c = counts[a] ?? { copies: 0, deletes: 0 };
          const total = c.copies + c.deletes;
          return (
            <button
              key={a}
              type="button"
              className={confirming === a ? 'is-confirming' : ''}
              disabled={!entries || total === 0}
              onClick={() => trigger(a)}
            >
              {SYNC_LABELS[a]}{total > 0 ? ` (${total})` : ''}
            </button>
          );
        })}
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
