// src/renderer/components/Viewer.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpError } from '@shared/types';
import {
  decodeText, formatBytes, hexDump, imageMimeFor, sniffMode, splitLines,
  type ViewerMode,
} from '@renderer/viewer/format';

/** Bytes pulled per page in text/hex mode. */
export const TEXT_WINDOW = 256 * 1024;
/** Images have to arrive whole, so they get their own (capped) budget. */
export const IMAGE_MAX = 16 * 1024 * 1024;

type Props = {
  path: string;
  /** `overlay` is F3 (full window); `embedded` fills the opposite panel (Ctrl+Q). */
  variant: 'overlay' | 'embedded';
  onClose: () => void;
};

function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
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

export function Viewer({ path, variant, onClose }: Props) {
  const name = baseName(path);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<ViewerMode | null>(null);
  const [chunk, setChunk] = useState<{ bytes: Uint8Array; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrap, setWrap] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A new target is a new document: forget the page and the resolved mode so
  // the next load re-sniffs. Quick view swaps `path` on every cursor move.
  useEffect(() => {
    setOffset(0);
    setMode(null);
    setError(null);
  }, [path]);

  // Only whether the whole file is needed belongs in the deps — keying on
  // `mode` itself would re-read the same bytes the moment sniffing resolves.
  const wantsWholeFile = mode === 'image';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await window.gc.fs.readChunk(
        path,
        wantsWholeFile ? 0 : offset,
        wantsWholeFile ? IMAGE_MAX : TEXT_WINDOW,
      );
      if (cancelled) return;
      if (!r.ok) { setError(describe(r.error)); setChunk(null); return; }
      setError(null);
      setChunk(r.value);
      setMode((m) => m ?? sniffMode(name, r.value.bytes.subarray(0, 8000)));
    })();
    return () => { cancelled = true; };
  }, [path, offset, wantsWholeFile, name]);

  // Scroll back to the top when a page is turned; the browser would otherwise
  // keep the old scrollTop and show the middle of the new window.
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [offset, path, mode]);

  const imageUrl = useMemo(() => {
    if (mode !== 'image' || !chunk) return null;
    // Copy into a plain ArrayBuffer: Blob rejects a view whose backing store is
    // only known to be ArrayBufferLike (it could be shared).
    const copy = chunk.bytes.slice().buffer as ArrayBuffer;
    const blob = new Blob([copy], { type: imageMimeFor(name) });
    return URL.createObjectURL(blob);
  }, [mode, chunk, name]);

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const lines = useMemo(() => {
    if (!chunk || mode === 'image' || mode === null) return [];
    return mode === 'hex'
      ? hexDump(chunk.bytes, offset)
      : splitLines(decodeText(chunk.bytes));
  }, [chunk, mode, offset]);

  const size = chunk?.size ?? 0;
  const loadedEnd = offset + (chunk?.bytes.length ?? 0);
  const hasMore = mode !== 'image' && loadedEnd < size;
  const hasPrev = mode !== 'image' && offset > 0;

  return (
    <div className={`gc-viewer gc-viewer-${variant}`} data-testid="gc-viewer">
      <div className="gc-viewer-head">
        <span className="gc-viewer-name" title={path}>{name}</span>
        <span className="gc-viewer-meta">
          {formatBytes(size)}
          {(hasMore || hasPrev) && ` · ${formatBytes(offset)}–${formatBytes(loadedEnd)}`}
        </span>
        <span className="gc-viewer-modes">
          {(['text', 'hex', 'image'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'is-active' : ''}
              onClick={() => { setMode(m); if (m === 'image') setOffset(0); }}
            >{m}</button>
          ))}
          {mode === 'text' && (
            <button
              type="button"
              className={wrap ? 'is-active' : ''}
              onClick={() => setWrap((w) => !w)}
            >wrap</button>
          )}
        </span>
        <button type="button" className="gc-viewer-close" onClick={onClose} aria-label="Close viewer">✕</button>
      </div>

      <div className="gc-viewer-body" ref={bodyRef} tabIndex={-1}>
        {error && <div className="gc-viewer-error" role="alert">{error}</div>}
        {!error && !chunk && <div className="gc-viewer-empty">Loading…</div>}
        {!error && chunk && mode === 'image' && imageUrl && (
          <div className="gc-viewer-image"><img src={imageUrl} alt={name} /></div>
        )}
        {!error && chunk && (mode === 'text' || mode === 'hex') && (
          <pre className={`gc-viewer-pre${wrap && mode === 'text' ? ' is-wrapped' : ''}`}>
            {lines.join('\n')}
          </pre>
        )}
      </div>

      {(hasPrev || hasMore) && (
        <div className="gc-viewer-pager">
          <button type="button" disabled={!hasPrev} onClick={() => setOffset(Math.max(0, offset - TEXT_WINDOW))}>
            ← previous
          </button>
          <span>{Math.floor(offset / TEXT_WINDOW) + 1} / {Math.max(1, Math.ceil(size / TEXT_WINDOW))}</span>
          <button type="button" disabled={!hasMore} onClick={() => setOffset(loadedEnd)}>
            next →
          </button>
        </div>
      )}
    </div>
  );
}
