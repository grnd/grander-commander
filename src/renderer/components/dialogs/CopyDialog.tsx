import { useEffect, useRef, useState } from 'react';

type Props = {
  title?: string;
  sources: string[];
  dstDefault: string;
  ctaLabel: string;
  onSubmit: (dst: string) => void;
  onCancel: () => void;
};

export function CopyDialog({ title, sources, dstDefault, ctaLabel, onSubmit, onCancel }: Props) {
  const [dst, setDst] = useState(dstDefault);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <div>
      <p>{title ?? `${ctaLabel} ${sources.length} item${sources.length === 1 ? '' : 's'} to:`}</p>
      <input
        ref={inputRef}
        value={dst}
        onChange={(e) => setDst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (dst) onSubmit(dst); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
      />
      <div className="gc-modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => dst && onSubmit(dst)} disabled={!dst}>{ctaLabel}</button>
      </div>
    </div>
  );
}
