import { useEffect, useRef } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** `wide` is for the table-shaped tools (multi-rename, compare, sync, search). */
  size?: 'normal' | 'wide';
};

export function DialogShell({ title, onClose, children, size = 'normal' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    // If a child element already claimed focus via autoFocus, don't override it.
    const root = rootRef.current;
    if (root && (!document.activeElement || !root.contains(document.activeElement))) {
      root.querySelector<HTMLInputElement>('input,button')?.focus();
    }
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="gc-modal-backdrop" onMouseDown={onClose}>
      <div
        className={`gc-modal${size === 'wide' ? ' is-wide' : ''}`}
        ref={rootRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="gc-modal-title">{title}</div>
        <div className="gc-modal-body">{children}</div>
      </div>
    </div>
  );
}
