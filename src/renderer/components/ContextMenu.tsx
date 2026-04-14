import { useEffect, useRef } from 'react';

export type MenuItem =
  | { kind: 'item'; label: string; onClick: () => void; disabled?: boolean }
  | { kind: 'separator' };

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = { left: x, top: y };

  return (
    <div ref={ref} className="gc-context-menu" style={style}>
      {items.map((it, i) => {
        if (it.kind === 'separator') return <div key={i} className="gc-context-sep" />;
        return (
          <button
            key={i}
            className="gc-context-item"
            disabled={it.disabled}
            onClick={() => { it.onClick(); onClose(); }}
          >{it.label}</button>
        );
      })}
    </div>
  );
}
