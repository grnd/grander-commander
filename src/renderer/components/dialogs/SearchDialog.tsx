// src/renderer/components/dialogs/SearchDialog.tsx
import { useRef, useState } from 'react';
import type { FileEntry, OpError, Result, SearchOutcome, SearchQuery } from '@shared/types';

type Props = {
  /** Folder the active panel is showing; the default search root. */
  root: string;
  otherRoot: string;
  onResults: (label: string, roots: string[], entries: FileEntry[]) => void;
  onCancel: () => void;
  /** Injected in tests; defaults to the preload bridge. */
  search?: (token: string, query: SearchQuery) => Promise<Result<SearchOutcome>>;
  cancelSearch?: (token: string) => Promise<void>;
};

const SIZE_UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };

/** Accepts "10", "10KB", "1.5 MB"; returns null for blank or unparseable input. */
export function parseSize(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i.exec(text);
  if (!m) return null;
  const unit = SIZE_UNITS[(m[2] ?? 'B').toUpperCase()] ?? 1;
  return Math.round(Number(m[1]) * unit);
}

/** A date input gives "YYYY-MM-DD"; blank means no bound. */
export function parseDate(raw: string, endOfDay = false): number | null {
  if (!raw.trim()) return null;
  const ms = Date.parse(endOfDay ? `${raw}T23:59:59.999` : `${raw}T00:00:00.000`);
  return Number.isNaN(ms) ? null : ms;
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

export function SearchDialog({ root, otherRoot, onResults, onCancel, search, cancelSearch }: Props) {
  const [namePattern, setNamePattern] = useState('');
  const [nameIsRegex, setNameIsRegex] = useState(false);
  const [contentPattern, setContentPattern] = useState('');
  const [contentIsRegex, setContentIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [bothPanels, setBothPanels] = useState(false);
  const [minSize, setMinSize] = useState('');
  const [maxSize, setMaxSize] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const roots = bothPanels && otherRoot !== root ? [root, otherRoot] : [root];

  const run = async () => {
    const token = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tokenRef.current = token;
    setRunning(true);
    setError(null);
    setStatus('Searching…');

    const query: SearchQuery = {
      roots,
      namePattern,
      nameIsRegex,
      caseSensitive,
      contentPattern,
      contentIsRegex,
      showHidden,
      minSize: parseSize(minSize),
      maxSize: parseSize(maxSize),
      modifiedAfter: parseDate(after),
      modifiedBefore: parseDate(before, true),
    };

    const r = await (search ?? window.gc.fs.search)(token, query);
    tokenRef.current = null;
    setRunning(false);
    if (!r.ok) { setStatus(null); setError(describe(r.error)); return; }

    const { entries, scanned, truncated, cancelled } = r.value;
    if (entries.length === 0) {
      setStatus(`No matches (${scanned} item(s) scanned)${cancelled ? ', cancelled' : ''}.`);
      return;
    }
    const parts = [namePattern || '*'];
    if (contentPattern) parts.push(`containing "${contentPattern}"`);
    const label = `Search: ${parts.join(' ')} in ${roots.join(', ')}`
      + (truncated ? ' (truncated)' : '')
      + (cancelled ? ' (cancelled)' : '');
    onResults(label, roots, entries);
  };

  const stop = () => {
    const token = tokenRef.current;
    if (token) void (cancelSearch ?? window.gc.fs.cancelSearch)(token);
  };

  return (
    <form
      className="gc-search"
      onSubmit={(e) => { e.preventDefault(); if (!running) void run(); }}
    >
      <label className="gc-search-field">
        <span>Name</span>
        <input
          value={namePattern}
          autoFocus
          placeholder={nameIsRegex ? 'regex, e.g. \\.tsx?$' : 'glob, e.g. *.ts or report?.pdf'}
          onChange={(e) => setNamePattern(e.target.value)}
        />
      </label>
      <label className="gc-search-field">
        <span>Contains</span>
        <input
          value={contentPattern}
          placeholder="text to find inside files (optional)"
          onChange={(e) => setContentPattern(e.target.value)}
        />
      </label>

      <div className="gc-search-toggles">
        <label>
          <input type="checkbox" checked={nameIsRegex} onChange={(e) => setNameIsRegex(e.target.checked)} />
          {' '}name is regex
        </label>
        <label>
          <input type="checkbox" checked={contentIsRegex} onChange={(e) => setContentIsRegex(e.target.checked)} />
          {' '}content is regex
        </label>
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          {' '}match case
        </label>
        <label>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          {' '}hidden files
        </label>
        <label>
          <input type="checkbox" checked={bothPanels} onChange={(e) => setBothPanels(e.target.checked)} />
          {' '}search both panel folders
        </label>
      </div>

      <div className="gc-search-filters">
        <label>size ≥ <input aria-label="minimum size" value={minSize} placeholder="10KB" onChange={(e) => setMinSize(e.target.value)} /></label>
        <label>size ≤ <input aria-label="maximum size" value={maxSize} placeholder="4MB" onChange={(e) => setMaxSize(e.target.value)} /></label>
        <label>after <input type="date" aria-label="modified after" value={after} onChange={(e) => setAfter(e.target.value)} /></label>
        <label>before <input type="date" aria-label="modified before" value={before} onChange={(e) => setBefore(e.target.value)} /></label>
      </div>

      <p className="gc-search-scope">Searching {roots.join(' and ')}</p>

      {error && <div className="gc-search-error" role="alert">{error}</div>}
      {status && !error && <div className="gc-search-status" role="status">{status}</div>}

      <div className="gc-modal-actions">
        <button type="button" onClick={onCancel}>Close</button>
        {running
          ? <button type="button" onClick={stop}>Stop</button>
          : <button type="submit">Search</button>}
      </div>
    </form>
  );
}
