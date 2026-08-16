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
  /** Set when the next page load should land at the bottom, not the top. */
  const landAtEndRef = useRef(false);

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

  // Scroll to the edge of the new page; the browser would otherwise keep the
  // old scrollTop and show the middle of the new window. Paging *backwards*
  // lands at the bottom, so reading up through a file stays continuous.
  useEffect(() => {
    const host = bodyRef.current;
    if (!host) return;
    host.scrollTop = landAtEndRef.current ? host.scrollHeight : 0;
    landAtEndRef.current = false;
  }, [offset, path, mode, chunk]);

  // The overlay owns the keyboard, so it has to actually hold focus.
  useEffect(() => {
    if (variant === 'overlay') bodyRef.current?.focus({ preventScroll: true });
  }, [variant, path]);

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

  const toPrevPage = () => {
    // Turning back should land at the *end* of the previous page, so paging up
    // reads as one continuous document rather than jumping to its top.
    landAtEndRef.current = true;
    setOffset(Math.max(0, offset - TEXT_WINDOW));
  };

  /**
   * Scrolling is handled here rather than left to the browser: nothing in the
   * overlay holds focus by default, so arrow and page keys went to the document
   * — which does not scroll — and only the trackpad worked.
   *
   * At the edges of a page the keys turn it, so the whole file is reachable
   * from the keyboard without touching the pager buttons.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (variant !== 'overlay') return;
    const host = bodyRef.current;
    if (!host) return;

    const line = 16;
    const page = Math.max(host.clientHeight - 40, 40);
    const atTop = host.scrollTop <= 0;
    const atBottom = host.scrollTop + host.clientHeight >= host.scrollHeight - 1;
    let handled = true;

    switch (e.key) {
      case 'ArrowDown': host.scrollTop += line; break;
      case 'ArrowUp': host.scrollTop -= line; break;
      case 'ArrowRight': host.scrollLeft += 40; break;
      case 'ArrowLeft': host.scrollLeft -= 40; break;
      case ' ':
      case 'PageDown':
        if (atBottom && hasMore) setOffset(loadedEnd);
        else host.scrollTop += page;
        break;
      case 'PageUp':
        if (atTop && hasPrev) toPrevPage();
        else host.scrollTop -= page;
        break;
      case 'Home':
        if (e.metaKey && hasPrev) setOffset(0);
        else host.scrollTop = 0;
        break;
      case 'End':
        if (e.metaKey && hasMore) setOffset(Math.max(0, size - TEXT_WINDOW));
        else host.scrollTop = host.scrollHeight;
        break;
      default: handled = false;
    }
    // Escape and F3 have to keep reaching the app's key router, which is what
    // closes the viewer.
    if (handled) e.preventDefault();
  };

  return (
    <div
      className={`gc-viewer gc-viewer-${variant}`}
      data-testid="gc-viewer"
      onKeyDown={onKeyDown}
    >
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

      <div className="gc-viewer-body" ref={bodyRef} tabIndex={variant === 'overlay' ? 0 : -1}>
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
          <button type="button" disabled={!hasPrev} onClick={toPrevPage}>
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
