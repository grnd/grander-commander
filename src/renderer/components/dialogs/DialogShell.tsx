import { useEffect, useRef } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function DialogShell({ title, onClose, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    rootRef.current?.querySelector<HTMLInputElement>('input,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="gc-modal-backdrop" onMouseDown={onClose}>
      <div className="gc-modal" ref={rootRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="gc-modal-title">{title}</div>
        <div className="gc-modal-body">{children}</div>
      </div>
    </div>
  );
}
